/**
 * 弹窗主逻辑
 *
 * 职责：
 * 1. 打开弹窗时自动捕获当前网页内容
 * 2. 发送给 background service worker 调用 LLM 生成标签
 * 3. 展示/编辑标签，保存至本地存储
 * 4. 历史记录管理
 */
import { Storage } from '../lib/storage.js';
import { TAG_DIMENSIONS, TAG_DIMENSION_KEYS, MESSAGE_TYPES, CAPTURE_THROTTLE_MS } from '../lib/constants.js';

// ====== DOM References ======
const $ = (id) => document.getElementById(id);

const els = {
  pageTitle: $('pageTitle'),
  pageUrl: $('pageUrl'),
  captureTime: $('captureTime'),
  loadingState: $('loadingState'),
  errorState: $('errorState'),
  errorText: $('errorText'),
  emptyState: $('emptyState'),
  tagSection: $('tagSection'),
  tagContainer: $('tagContainer'),
  btnRefresh: $('btnRefresh'),
  btnRegenerate: $('btnRegenerate'),
  btnSave: $('btnSave'),
  btnSettings: $('btnSettings'),
  btnHistory: $('btnHistory'),
  btnRetry: $('btnRetry'),
  btnGoSettings: $('btnGoSettings'),
  btnBack: $('btnBack'),
  btnClearAll: $('btnClearAll'),
  historyPanel: $('historyPanel'),
  historyList: $('historyList'),
  configHint: $('configHint'),
  configHintLink: $('configHintLink'),
};

// ====== State ======
let state = {
  pageData: null,       // { title, url, content }
  tags: null,           // { contentDomain: [], usageScenario: [], ... }
  isSaving: false,
  isCapturing: false,
  lastCaptureTime: 0,
  currentView: 'main',  // 'main' | 'history'
  autoSaveTimer: null,  // debounce timer for auto-save
};

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', async () => {
  await applyTheme();
  bindEvents();
  await initPopup();
});

// Cleanup on popup close — prevent memory leaks
window.addEventListener('unload', () => {
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = null;
  }
  if (state.pageData?.content) {
    state.pageData.content = ''; // release large text
  }
});

// ====== Event Binding ======
function bindEvents() {
  els.btnRefresh.addEventListener('click', () => capturePage());
  els.btnRegenerate.addEventListener('click', () => generateTags());
  els.btnSave.addEventListener('click', () => saveTags());
  els.btnRetry.addEventListener('click', () => capturePage());
  els.btnGoSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());
  els.configHintLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  els.btnHistory.addEventListener('click', () => showHistory());
  els.btnBack.addEventListener('click', () => showMainView());
  els.btnClearAll.addEventListener('click', () => clearAllHistory());
}

// ====== Initialization ======
async function initPopup() {
  showLoading('正在获取网页内容...');
  await capturePage();
}

// ====== Theme ======
async function applyTheme() {
  const config = await Storage.getConfig();
  const theme = config.theme || 'auto';
  document.documentElement.dataset.theme = theme;
}

// ====== Page Capture ======
async function capturePage() {
  // Throttle: prevent repeated capture within 30s
  const now = Date.now();
  if (now - state.lastCaptureTime < CAPTURE_THROTTLE_MS) {
    const remaining = Math.ceil((CAPTURE_THROTTLE_MS - (now - state.lastCaptureTime)) / 1000);
    showError(`请 ${remaining}s 后再试（抓取节流中）`);
    return;
  }

  state.isCapturing = true;
  showLoading('正在获取网页内容...');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      showError('无法获取当前标签页');
      return;
    }

    // Check for restricted URLs (browser internal pages)
    if (isRestrictedUrl(tab.url)) {
      showError('当前为浏览器内部页面，无法抓取内容');
      displayPageInfo({ title: tab.title || '浏览器内部页', url: tab.url || '' });
      return;
    }

    // Delegate to background service worker (handles executeScript + content comm)
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.CAPTURE_PAGE,
      tabId: tab.id,
    });

    if (response?.error) {
      throw new Error(response.error);
    }

    if (!response || (!response.content && !response.title)) {
      showEmptyState();
      return;
    }

    state.pageData = {
      title: response.title || tab.title || '无标题',
      url: response.url || tab.url || '',
      content: response.content || '',
      capturedAt: new Date().toISOString(),
    };
    state.lastCaptureTime = Date.now();

    // Display page info
    displayPageInfo(state.pageData);

    // Check for existing saved tags for this URL
    const existing = await Storage.getRecord(state.pageData.url);
    if (existing?.tags) {
      // Load existing tags — no need to call AI again
      state.tags = JSON.parse(JSON.stringify(existing.tags));
      renderTags(state.tags);
      showTagSection();
      return;
    }

    // No existing tags — auto-generate if enabled
    const config = await Storage.getConfig();
    if (config.autoTag && state.pageData.content) {
      await generateTags();
    } else if (!state.pageData.content) {
      showEmptyState();
    } else {
      showTagSection();
      checkApiConfigHint();
    }
  } catch (err) {
    console.error('[Popup] Capture error:', err);
    const msg = err.message || '';
    if (msg.includes('chrome://') || msg.includes('Cannot access a chrome://')) {
      showError('浏览器内部页面无法抓取内容');
    } else if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
      showError('无法连接到页面，请刷新后重试');
    } else {
      showError(msg || '抓取失败，请重试');
    }
  } finally {
    state.isCapturing = false;
  }
}

// ====== Restricted URL Detection ======
function isRestrictedUrl(url) {
  if (!url) return false;
  const restricted = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'view-source:',
    'edge://',
    'file://',
    'data:',
  ];
  return restricted.some((prefix) => url.startsWith(prefix));
}

// ====== AI Tag Generation ======
async function generateTags() {
  if (!state.pageData?.content) {
    showError('无可用的网页内容，请先刷新抓取');
    return;
  }

  showLoading('AI 正在分析内容，生成标签...');

  try {
    const config = await Storage.getConfig();
    if (!config.apiKey || !config.apiEndpoint) {
      showError('请先前往设置页配置 API Key 和接口地址', true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.GENERATE_TAGS,
      content: state.pageData.content,
      customPrompt: config.customPrompt,
    });

    if (response?.error) {
      showError(response.error);
      return;
    }

    // Expected format: { contentDomain: [], usageScenario: [], ... }
    state.tags = sanitizeTags(response);
    renderTags(state.tags);
    showTagSection();
    // Auto-save after successful AI generation
    await saveTags(true);
  } catch (err) {
    console.error('[Popup] Generate tags error:', err);
    if (err.message?.includes('Could not establish connection')) {
      showError('后台服务未响应，请重新打开弹窗');
    } else {
      showError(err.message || '标签生成失败，请重试');
    }
  }
}

// ====== Tag Rendering ======
function renderTags(tags) {
  if (!tags) return;

  els.tagContainer.innerHTML = '';

  TAG_DIMENSION_KEYS.forEach((dimKey) => {
    const dim = TAG_DIMENSIONS[dimKey];
    const values = tags[dimKey] || [];

    const group = document.createElement('div');
    group.className = 'tag-group';
    group.dataset.dimKey = dimKey;

    // Label row
    const label = document.createElement('div');
    label.className = 'tag-group-label';
    label.innerHTML = `
      <span class="tag-group-dot" style="background:${dim.color}"></span>
      <span class="tag-group-name">${dim.label}</span>
      <button class="tag-group-add" title="添加标签">+</button>
    `;
    group.appendChild(label);

    // Chips row
    const chips = document.createElement('div');
    chips.className = 'tag-chips';

    values.forEach((val) => {
      chips.appendChild(createTagChip(dimKey, val));
    });

    group.appendChild(chips);
    els.tagContainer.appendChild(group);

    // Add tag handler
    const addBtn = label.querySelector('.tag-group-add');
    addBtn.addEventListener('click', () => handleAddTag(dimKey));
  });
}

function createTagChip(dimKey, value) {
  const chip = document.createElement('span');
  chip.className = 'tag-chip';
  chip.innerHTML = `
    <span class="tag-chip-text">${escapeHtml(value)}</span>
    <span class="tag-chip-remove" data-dim="${dimKey}" data-value="${escapeHtml(value)}">&times;</span>
  `;

  // Remove handler
  const removeBtn = chip.querySelector('.tag-chip-remove');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    handleRemoveTag(dimKey, value);
  });

  // Edit handler: single click to edit text
  const textSpan = chip.querySelector('.tag-chip-text');
  textSpan.addEventListener('dblclick', () => startEditTag(chip, textSpan, dimKey, value));

  return chip;
}

function startEditTag(chip, textSpan, dimKey, oldValue) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-chip-input';
  input.value = oldValue;
  input.maxLength = 10;

  textSpan.replaceWith(input);
  input.focus();
  input.select();

  const finishEdit = () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== oldValue) {
      const tags = state.tags[dimKey];
      const idx = tags.indexOf(oldValue);
      if (idx !== -1) {
        tags[idx] = newValue;
        renderTags(state.tags);
        scheduleAutoSave();
      }
    } else {
      // Revert
      textSpan.textContent = oldValue;
      input.replaceWith(textSpan);
    }
  };

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') {
      textSpan.textContent = oldValue;
      input.replaceWith(textSpan);
    }
  });
}

function handleAddTag(dimKey) {
  const tags = state.tags[dimKey] || [];
  const newVal = prompt(`请输入新的${TAG_DIMENSIONS[dimKey].label}标签：`);
  if (newVal && newVal.trim() && newVal.trim().length >= 1) {
    const val = newVal.trim().slice(0, 10);
    if (!tags.includes(val)) {
      tags.push(val);
      renderTags(state.tags);
      scheduleAutoSave();
    }
  }
}

function handleRemoveTag(dimKey, value) {
  const tags = state.tags[dimKey] || [];
  const idx = tags.indexOf(value);
  if (idx !== -1) {
    tags.splice(idx, 1);
    renderTags(state.tags);
    scheduleAutoSave();
  }
}

// ====== Save ======
/** @param {boolean} [silent] - If true, does not show toast */
async function saveTags(silent) {
  if (!state.pageData || !state.tags || state.isSaving) return false;

  state.isSaving = true;
  els.btnSave.disabled = true;

  try {
    const existing = await Storage.getRecord(state.pageData.url);

    await Storage.saveRecord({
      url: state.pageData.url,
      title: state.pageData.title,
      capturedAt: state.pageData.capturedAt || new Date().toISOString(),
      tags: state.tags,
      edited: existing?.edited || true,
    });

    if (!silent) showToast('保存成功 ✅');
    return true;
  } catch (err) {
    console.error('[Popup] Save error:', err);
    if (!silent) showToast('保存失败，请重试');
    return false;
  } finally {
    state.isSaving = false;
    els.btnSave.disabled = false;
  }
}

// ====== Auto-Save with Debounce ======
/**
 * Schedule an auto-save 500ms after the last edit.
 * Resets the timer on each call (debounce).
 */
function scheduleAutoSave() {
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
  }
  state.autoSaveTimer = setTimeout(async () => {
    await saveTags(true);
    state.autoSaveTimer = null;
  }, 500);
}

// ====== History ======
async function showHistory() {
  state.currentView = 'history';
  els.historyPanel.classList.remove('hidden');
  els.historyList.innerHTML = '<div class="history-empty">加载中...</div>';

  try {
    const records = await Storage.getAllRecords();

    if (!records || records.length === 0) {
      els.historyList.innerHTML = '<div class="history-empty">暂无标签记录</div>';
      return;
    }

    els.historyList.innerHTML = '';
    records.forEach((record) => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const tagValues = Object.values(record.tags || {}).flat();
      const tagHtml = tagValues.slice(0, 8).map(t => `<span class="history-tag">${escapeHtml(t)}</span>`).join('');

      item.innerHTML = `
        <div class="history-item-title">${escapeHtml(record.title || '无标题')}</div>
        <div class="history-item-url">${escapeHtml(record.url || '')}</div>
        <div class="history-item-time">${new Date(record.updatedAt).toLocaleString('zh-CN')}</div>
        <div class="history-item-tags">${tagHtml}</div>
      `;

      // Click to restore
      item.addEventListener('click', () => {
        restoreFromHistory(record);
      });

      els.historyList.appendChild(item);
    });
  } catch (err) {
    console.error('[Popup] History error:', err);
    els.historyList.innerHTML = '<div class="history-empty">加载失败，请重试</div>';
  }
}

function restoreFromHistory(record) {
  state.pageData = {
    title: record.title,
    url: record.url,
    content: '',
  };
  state.tags = JSON.parse(JSON.stringify(record.tags || {}));

  displayPageInfo(state.pageData);
  renderTags(state.tags);
  showTagSection();
  showMainView();
  showToast('已加载历史标签');
}

async function clearAllHistory() {
  if (!confirm('确定清空所有历史标签记录？此操作不可恢复。')) return;
  if (!confirm('再次确认：清空全部记录？')) return;

  await Storage.clearAllRecords();
  showToast('已清空全部记录');
  showHistory(); // Refresh
}

// ====== View Switching ======
function showMainView() {
  state.currentView = 'main';
  els.historyPanel.classList.add('hidden');
}

function showLoading(text) {
  els.loadingState.classList.remove('hidden');
  els.loadingState.querySelector('.loading-text').textContent = text || '加载中...';
  els.errorState.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.tagSection.classList.add('hidden');
}

function showError(text, showSettings) {
  els.loadingState.classList.add('hidden');
  els.errorState.classList.remove('hidden');
  els.errorText.textContent = text || '未知错误';
  els.emptyState.classList.add('hidden');
  els.tagSection.classList.add('hidden');
  if (showSettings) {
    els.btnGoSettings.classList.remove('hidden');
    els.btnRetry.classList.add('hidden');
  } else {
    els.btnGoSettings.classList.add('hidden');
    els.btnRetry.classList.remove('hidden');
  }
}

function showEmptyState() {
  els.loadingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
  els.tagSection.classList.add('hidden');
}

function showTagSection() {
  els.loadingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.emptyState.classList.add('hidden');
  els.tagSection.classList.remove('hidden');
  // Hide config hint by default; shown explicitly via checkApiConfigHint()
  els.configHint.classList.add('hidden');
}

async function checkApiConfigHint() {
  if (state.tags && hasAnyTags(state.tags)) return; // already have tags
  try {
    const config = await Storage.getConfig();
    if (!config.apiKey || !config.apiEndpoint) {
      els.configHint.classList.remove('hidden');
    }
  } catch {
    // Silently fail — not critical
  }
}

function hasAnyTags(tags) {
  if (!tags) return false;
  return TAG_DIMENSION_KEYS.some((key) => (tags[key]?.length || 0) > 0);
}

// ====== Display Page Info ======
function displayPageInfo(data) {
  if (!data) return;
  els.pageTitle.textContent = data.title || '无标题';
  els.pageUrl.textContent = data.url || '';
  const capturedAt = data.capturedAt || new Date().toISOString();
  els.captureTime.textContent = `抓取于 ${new Date(capturedAt).toLocaleTimeString('zh-CN')}`;
}

// ====== Helpers ======
function sanitizeTags(response) {
  const result = {};
  TAG_DIMENSION_KEYS.forEach((key) => {
    const vals = response?.[key];
    if (Array.isArray(vals)) {
      // Deduplicate within same dimension
      result[key] = [...new Set(vals.map(v => String(v).trim()).filter(v => v.length >= 1 && v.length <= 10))];
    } else {
      result[key] = [];
    }
  });
  return result;
}



function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ====== Toast Notification ======
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '60px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--text-primary)',
    color: 'var(--bg-primary)',
    padding: '6px 16px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '500',
    zIndex: '100',
    opacity: '0',
    transition: 'opacity 0.3s ease',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(toast);

  requestAnimationFrame(() => { toast.style.opacity = '1'; });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
