/**
 * 收藏夹标签管理页逻辑
 *
 * 职责：
 * 1. 读取 chrome.bookmarks.getTree 渲染树形视图
 * 2. 加载已有标签并在每个书签旁展示
 * 3. 批量处理：勾选书签 → 逐条送 background 处理 → 更新 UI
 */
import { Storage } from '../lib/storage.js';
import { TAG_DIMENSION_KEYS, TAG_DIMENSIONS, MESSAGE_TYPES } from '../lib/constants.js';

// ====== DOM References ======
const $ = (id) => document.getElementById(id);

const els = {
  treeContainer: $('treeContainer'),
  loadingState: $('loadingState'),
  emptyState: $('emptyState'),
  progressBar: $('progressBar'),
  progressFill: $('progressFill'),
  progressText: $('progressText'),
  btnProcess: $('btnProcess'),
  btnBack: $('btnBack'),
  statsInfo: $('statsInfo'),
  searchBar: $('searchBar'),
  searchInput: $('searchInput'),
  btnClearSearch: $('btnClearSearch'),
  searchResults: $('searchResults'),
  searchResultsList: $('searchResultsList'),
  searchEmpty: $('searchEmpty'),
  tagStatsPanel: $('tagStatsPanel'),
  tagStatsList: $('tagStatsList'),
  btnStopProcess: $('btnStopProcess'),
  processModal: $('processModal'),
  btnOverwriteAll: $('btnOverwriteAll'),
  btnProcessRemaining: $('btnProcessRemaining'),
  btnCancelProcess: $('btnCancelProcess'),
  btnExport: $('btnExport'),
  btnImport: $('btnImport'),
  fileInput: $('fileInput'),
};

// ====== State ======
let state = {
  allUrls: [],          // { id, url, title, path: 'folder > subfolder' }
  tagsMap: {},          // url → tags object
  folderPathMap: {},    // url → 'folder > subfolder' path string
  processing: false,
  stopRequested: false,
  processedCount: 0,
  totalCount: 0,
};

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  bindEvents();
  await loadData();
});

function bindEvents() {
  els.btnProcess.addEventListener('click', showProcessModal);
  els.btnOverwriteAll.addEventListener('click', () => startBatchProcess('overwrite'));
  els.btnProcessRemaining.addEventListener('click', () => startBatchProcess('remaining'));
  els.btnCancelProcess.addEventListener('click', closeProcessModal);
  els.btnBack.addEventListener('click', () => window.close());
  els.searchInput.addEventListener('input', handleSearch);
  els.btnClearSearch.addEventListener('click', clearSearch);
  els.btnStopProcess.addEventListener('click', stopBatchProcess);
  els.btnExport.addEventListener('click', handleExport);
  els.btnImport.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', handleImport);
}

// ====== Theme ======
async function applyTheme() {
  try {
    const config = await Storage.getConfig();
    document.documentElement.dataset.theme = config.theme || 'auto';
  } catch {
    // ignore
  }
}

// ====== Load Data ======
async function loadData() {
  els.loadingState.classList.remove('hidden');
  els.treeContainer.classList.add('hidden');

  try {
    // 1. Get bookmark tree
    const [root] = await chrome.bookmarks.getTree();
    const bookmarks = root.children || [];

    // 2. Get all existing tag records
    const records = await Storage.getAllRecords();
    state.tagsMap = {};
    records.forEach((r) => { state.tagsMap[r.url] = r.tags; });

    // 3. Flatten bookmark tree to collect stats
    state.allUrls = [];
    flattenBookmarks(bookmarks, '');

    const urlCount = state.allUrls.length;
    const taggedCount = state.allUrls.filter((b) => state.tagsMap[b.url]).length;

    // Also count bookmarks bar URLs
    const [barNode] = await chrome.bookmarks.getSubTree('1');
    const barUrls = collectUrls(barNode);
    const barTagged = barUrls.filter((u) => state.tagsMap[u]).length;

    els.statsInfo.textContent = `收藏栏 ${barTagged}/${barUrls.length} | 全部 ${taggedCount}/${urlCount}`;

    // 5. Render tree
    if (bookmarks.length === 0) {
      els.emptyState.classList.remove('hidden');
    } else {
      renderTree(bookmarks, els.treeContainer);
      els.treeContainer.classList.remove('hidden');
    }

    // 6. Auto-open tag stats sidebar
    openTagStats();
  } catch (err) {
    console.error('[Bookmarks] Load error:', err);
    els.emptyState.classList.remove('hidden');
    els.emptyState.innerHTML = `<p>加载失败：${err.message}</p>`;
  } finally {
    els.loadingState.classList.add('hidden');
  }
}

// ====== Flatten Bookmarks (for stats) ======
function flattenBookmarks(nodes, parentPath) {
  (nodes || []).forEach((node) => {
    if (node.url) {
      state.allUrls.push({
        id: node.id,
        url: node.url,
        title: node.title || node.url,
        path: parentPath,
      });
      state.folderPathMap[node.url] = parentPath;
    }
    if (node.children) {
      const folderPath = parentPath ? `${parentPath} > ${node.title}` : node.title;
      flattenBookmarks(node.children, folderPath);
    }
  });
}

// ====== Render Tree ======
function renderTree(nodes, container, depth = 0) {
  // Sort by Chrome's bookmark index order
  const sorted = [...(nodes || [])].sort((a, b) => (a.index || 0) - (b.index || 0));

  sorted.forEach((node) => {
    if (node.url) {
      // Bookmark leaf
      container.appendChild(createBookmarkItem(node));
    } else if (node.children) {
      // Folder
      container.appendChild(createFolderNode(node, depth));
    }
  });
}

// ====== Create Folder Node ======
function createFolderNode(node, depth) {
  const folder = document.createElement('div');
  folder.className = 'tree-folder';

  const header = document.createElement('div');
  header.className = 'tree-folder-header';

  const toggle = document.createElement('span');
  toggle.className = 'tree-folder-toggle';
  toggle.textContent = '▶';

  const icon = document.createElement('span');
  icon.className = 'tree-folder-icon';
  icon.textContent = '📁';

  const name = document.createElement('span');
  name.className = 'tree-folder-name';
  name.textContent = node.title || '(未命名)';

  const urlCount = countUrls(node);
  const count = document.createElement('span');
  count.className = 'tree-folder-count';
  count.textContent = `${urlCount} 个`;

  header.append(toggle, icon, name, count);

  const children = document.createElement('div');
  children.className = 'tree-folder-children';
  children.classList.add('collapsed');  // default collapsed

  renderTree(node.children, children, depth + 1);

  // Toggle expand/collapse
  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const isCollapsed = children.classList.toggle('collapsed');
    toggle.classList.toggle('expanded', !isCollapsed);
  });

  folder.append(header, children);
  return folder;
}

function countUrls(node) {
  let count = 0;
  if (node.url) return 1;
  if (node.children) {
    node.children.forEach((child) => { count += countUrls(child); });
  }
  return count;
}

/** Recursively collect all bookmark URLs from a tree node */
function collectUrls(node, result = []) {
  if (node.url) result.push(node.url);
  if (node.children) {
    node.children.forEach((child) => collectUrls(child, result));
  }
  return result;
}

// ====== Create Bookmark Item ======
function createBookmarkItem(node) {
  const item = document.createElement('div');
  item.className = 'bookmark-item';
  item.dataset.url = node.url;
  item.dataset.id = node.id;

  // Checkbox
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'bookmark-checkbox';
  checkbox.addEventListener('change', updateSelectAllState);

  // Content
  const content = document.createElement('div');
  content.className = 'bookmark-content';

  const title = document.createElement('div');
  title.className = 'bookmark-title';
  const link = document.createElement('a');
  link.href = node.url;
  link.textContent = node.title || node.url;
  link.target = '_blank';
  link.title = node.url;
  title.appendChild(link);
  content.appendChild(title);

  const urlEl = document.createElement('div');
  urlEl.className = 'bookmark-url';
  urlEl.textContent = node.url;
  content.appendChild(urlEl);

  // Tags
  const tags = state.tagsMap[node.url];
  if (tags) {
    const tagContainer = document.createElement('div');
    tagContainer.className = 'bookmark-tags';
    TAG_DIMENSION_KEYS.forEach((dimKey) => {
      (tags[dimKey] || []).forEach((val) => {
        const tag = document.createElement('span');
        tag.className = 'bookmark-tag';
        tag.textContent = val;
        tag.title = TAG_DIMENSIONS[dimKey].label;
        tagContainer.appendChild(tag);
      });
    });
    if (tagContainer.children.length > 0) {
      content.appendChild(tagContainer);
    }
  }

  // Status
  const status = document.createElement('span');
  status.className = 'bookmark-status';
  if (tags) {
    status.textContent = '✅';
    status.classList.add('done');
  } else {
    status.textContent = '⏳';
    status.classList.add('pending');
  }

  item.append(checkbox, content, status);
  return item;
}

// ====== Select All State ======
function updateSelectAllState() {
  // This is a placeholder — the select-all bar will be implemented if needed
}

// ====== Process Mode Modal ======
function showProcessModal() {
  if (state.processing) return;

  // Check if any bookmarks are manually selected via checkbox
  const checked = document.querySelectorAll('.bookmark-checkbox:checked');
  if (checked.length > 0) {
    const urls = [];
    checked.forEach((cb) => {
      const item = cb.closest('.bookmark-item');
      if (item?.dataset.url) urls.push(item.dataset.url);
    });
    // Process selected directly without modal
    runBatch(urls);
    return;
  }

  // No selection — show mode picker
  els.processModal.classList.remove('hidden');
}

function closeProcessModal() {
  els.processModal.classList.add('hidden');
}

// ====== Batch Process ======
/**
 * @param {'overwrite'|'remaining'} mode
 */
async function startBatchProcess(mode) {
  if (state.processing) return;
  closeProcessModal();

  let urls = [];

  if (mode === 'overwrite') {
    urls = state.allUrls.map((b) => b.url);
  } else {
    // Only bookmarks from the Bookmarks Bar (Chrome id=1)
    const [barNode] = await chrome.bookmarks.getSubTree('1');
    const barUrls = collectUrls(barNode);
    if (barUrls.length === 0) {
      alert('收藏栏中没有书签。请先将网页添加到收藏栏，再使用此功能。');
      return;
    }
    barUrls.forEach((url) => {
      if (!state.tagsMap[url]) urls.push(url);
    });
    if (urls.length === 0) {
      alert('收藏栏中的所有书签已有标签，无需处理。');
      return;
    }
  }

  runBatch(urls);
}

async function runBatch(urls) {
  state.processing = true;
  state.stopRequested = false;
  state.processedCount = 0;
  state.totalCount = urls.length;
  els.btnProcess.disabled = true;
  els.btnProcess.textContent = '⏳ 处理中...';
  els.progressBar.classList.remove('hidden');
  els.btnStopProcess.classList.remove('hidden');
  els.btnStopProcess.disabled = false;
  els.btnStopProcess.textContent = '⏹ 结束';

  // Process one by one (check stop flag each iteration)
  for (const url of urls) {
    if (state.stopRequested) break;
    await processSingleBookmark(url);
    state.processedCount++;
    updateProgress(state.processedCount, state.totalCount);
  }

  // Done (or stopped)
  state.processing = false;
  els.btnStopProcess.classList.add('hidden');
  els.btnProcess.disabled = false;

  if (state.stopRequested) {
    els.btnProcess.textContent = '🚀 继续处理';
    els.progressText.textContent = `已中止 ${state.processedCount} / ${state.totalCount}`;
  } else {
    els.btnProcess.textContent = '🚀 批量处理';
    els.progressFill.style.width = '100%';
    els.progressText.textContent = `完成 ${state.totalCount} / ${state.totalCount}`;
  }

  // Reload tags from storage to refresh display
  const records = await Storage.getAllRecords();
  state.tagsMap = {};
  records.forEach((r) => { state.tagsMap[r.url] = r.tags; });

  // Update bookmark items display
  document.querySelectorAll('.bookmark-item').forEach((item) => {
    const url = item.dataset.url;
    const tags = state.tagsMap[url];
    const status = item.querySelector('.bookmark-status');

    // Update tag display
    const content = item.querySelector('.bookmark-content');
    let tagContainer = content.querySelector('.bookmark-tags');
    if (tagContainer) tagContainer.remove();

    if (tags) {
      tagContainer = document.createElement('div');
      tagContainer.className = 'bookmark-tags';
      TAG_DIMENSION_KEYS.forEach((dimKey) => {
        (tags[dimKey] || []).forEach((val) => {
          const tag = document.createElement('span');
          tag.className = 'bookmark-tag';
          tag.textContent = val;
          tag.title = TAG_DIMENSIONS[dimKey].label;
          tagContainer.appendChild(tag);
        });
      });
      if (tagContainer.children.length > 0) {
        content.appendChild(tagContainer);
      }
      status.textContent = '✅';
      status.className = 'bookmark-status done';
    }
  });

  // Update stats
  const totalUrls = state.allUrls.length;
  const taggedCount = state.allUrls.filter((b) => state.tagsMap[b.url]).length;
  els.statsInfo.textContent = `共 ${totalUrls} 个书签，${taggedCount} 个已有标签`;
}

function stopBatchProcess() {
  state.stopRequested = true;
  els.btnStopProcess.disabled = true;
  els.btnStopProcess.textContent = '⏹ 停止中...';
}

async function processSingleBookmark(url) {
  // Find the bookmark item element for this URL
  const item = document.querySelector(`.bookmark-item[data-url="${CSS.escape(url)}"]`);
  const statusEl = item?.querySelector('.bookmark-status');

  if (statusEl) {
    statusEl.textContent = '⏳';
    statusEl.className = 'bookmark-status processing';
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.PROCESS_BOOKMARK,
      url: url,
      customPrompt: '',
    });

    if (result?.success) {
      // Save to local tags map
      state.tagsMap[url] = result.tags;
    }
  } catch (err) {
    console.error('[Bookmarks] Process error:', url, err);
    if (statusEl) {
      statusEl.textContent = '❌';
      statusEl.className = 'bookmark-status';
    }
  }
}

function updateProgress(current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  els.progressFill.style.width = `${pct}%`;
  els.progressText.textContent = `${current} / ${total}`;
}

// ====== Search (Flat Results) ======
let searchTimer = null;

function handleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(performSearch, 200);
}

function performSearch() {
  const query = els.searchInput.value.trim().toLowerCase();

  // Toggle clear button
  els.btnClearSearch.classList.toggle('hidden', !query);

  if (!query) {
    clearSearch();
    return;
  }

  // Split query into multiple terms (space-separated, AND logic)
  const terms = query.split(/\s+/).filter(Boolean);

  // Find matching bookmarks — must match ALL terms
  const matches = [];
  state.allUrls.forEach((b) => {
    const tags = state.tagsMap[b.url];
    const allMatch = terms.every((term) => {
      // Search in tags (all 5 dimensions)
      if (tags) {
        let found = false;
        TAG_DIMENSION_KEYS.forEach((key) => {
          (tags[key] || []).forEach((val) => {
            if (val.toLowerCase().includes(term)) found = true;
          });
        });
        if (found) return true;
      }
      // Search in title
      if (b.title.toLowerCase().includes(term)) return true;
      // Search in folder path
      const folderPath = state.folderPathMap[b.url] || '';
      if (folderPath.toLowerCase().includes(term)) return true;
      return false;
    });
    if (allMatch) matches.push(b);
  });

  // Update match count
  const existingCount = els.searchBar.querySelector('.search-match-count');
  if (existingCount) existingCount.remove();
  if (matches.length > 0) {
    const countEl = document.createElement('span');
    countEl.className = 'search-match-count';
    countEl.textContent = `匹配 ${matches.length} 个`;
    els.searchBar.appendChild(countEl);
  }

  // Hide tree, show results
  els.treeContainer.classList.add('search-mode');
  els.searchResults.classList.remove('hidden');

  if (matches.length === 0) {
    els.searchResultsList.innerHTML = '';
    els.searchEmpty.classList.remove('hidden');
    return;
  }

  els.searchEmpty.classList.add('hidden');
  els.searchResultsList.innerHTML = '';

  matches.forEach((b) => {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    // Folder path breadcrumb
    const folderPath = state.folderPathMap[b.url];
    if (folderPath) {
      const pathEl = document.createElement('div');
      pathEl.className = 'search-result-path';
      pathEl.innerHTML = `📁 ${escapeHtml(folderPath)}`;
      item.appendChild(pathEl);
    }

    // Title
    const titleEl = document.createElement('div');
    titleEl.className = 'search-result-title';
    const link = document.createElement('a');
    link.href = b.url;
    link.textContent = b.title || b.url;
    link.target = '_blank';
    link.title = b.url;
    titleEl.appendChild(link);
    item.appendChild(titleEl);

    // URL
    const urlEl = document.createElement('div');
    urlEl.className = 'search-result-url';
    urlEl.textContent = b.url;
    item.appendChild(urlEl);

    // Tags
    const tags = state.tagsMap[b.url];
    if (tags) {
      const tagEl = document.createElement('div');
      tagEl.className = 'search-result-tags';
      TAG_DIMENSION_KEYS.forEach((dimKey) => {
        (tags[dimKey] || []).forEach((val) => {
          const tag = document.createElement('span');
          tag.className = 'search-result-tag';
          tag.textContent = val;
          tag.title = TAG_DIMENSIONS[dimKey].label;
          tagEl.appendChild(tag);
        });
      });
      if (tagEl.children.length > 0) {
        item.appendChild(tagEl);
      }
    }

    els.searchResultsList.appendChild(item);
  });
}

function clearSearch() {
  els.searchInput.value = '';
  els.btnClearSearch.classList.add('hidden');
  // Remove match count
  const countEl = els.searchBar.querySelector('.search-match-count');
  if (countEl) countEl.remove();
  // Hide results, show tree
  els.searchResults.classList.add('hidden');
  els.searchResultsList.innerHTML = '';
  els.searchEmpty.classList.add('hidden');
  els.treeContainer.classList.remove('search-mode');
}

// ====== Tag Stats ======
function openTagStats() {
  // Compute tag stats from all bookmarks
  const tagCount = {};  // 'tagValue' → { count, dims: Set }
  state.allUrls.forEach((b) => {
    const tags = state.tagsMap[b.url];
    if (!tags) return;
    TAG_DIMENSION_KEYS.forEach((dimKey) => {
      (tags[dimKey] || []).forEach((val) => {
        if (!tagCount[val]) tagCount[val] = { count: 0, dims: new Set() };
        tagCount[val].count++;
        tagCount[val].dims.add(TAG_DIMENSIONS[dimKey].label);
      });
    });
  });

  // Sort by count descending, then alphabetically
  const sorted = Object.entries(tagCount).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return a[0].localeCompare(b[0]);
  });

  // Render
  els.tagStatsList.innerHTML = '';
  sorted.forEach(([tagName, info]) => {
    const chip = document.createElement('span');
    chip.className = 'tag-stats-chip';

    const dimLabel = Array.from(info.dims).sort().join(', ');
    chip.innerHTML = `
      <span class="tag-stats-dim">${escapeHtml(dimLabel)}</span>
      ${escapeHtml(tagName)}
      <span class="tag-stats-count">${info.count}</span>
    `;

    // Click → append to search input (space-separated for multi-tag)
    chip.addEventListener('click', () => {
      const existing = els.searchInput.value.trim();
      const tags = existing ? existing.split(/\s+/) : [];
      if (!tags.includes(tagName)) {
        tags.push(tagName);
        els.searchInput.value = tags.join(' ');
      }
      performSearch();
    });

    els.tagStatsList.appendChild(chip);
  });

}

// ====== Export / Import ======
async function handleExport() {
  try {
    const records = await Storage.getAllRecords();
    if (!records || records.length === 0) {
      alert('没有标签数据可导出');
      return;
    }

    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      total: records.length,
      records: records,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-tags-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[Bookmarks] Export error:', err);
    alert('导出失败：' + err.message);
  }
}

async function handleImport(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate format
    if (!data.version || !Array.isArray(data.records)) {
      alert('无效的导入文件格式');
      return;
    }

    const count = data.records.length;
    const existingCount = (await Storage.getAllRecords()).length;

    const mode = confirm(
      `即将导入 ${count} 条标签记录。\n当前已有 ${existingCount} 条记录。\n\n确定「确定」将追加导入（URL 相同的记录会覆盖）；\n「取消」则放弃导入。`
    );

    if (!mode) return;

    // Import one by one — saveRecord handles URL-based overwrite
    let imported = 0;
    for (const record of data.records) {
      if (record.url && record.tags) {
        await Storage.saveRecord({
          url: record.url,
          title: record.title || record.url,
          capturedAt: record.capturedAt || new Date().toISOString(),
          tags: record.tags,
          edited: record.edited ?? true,
        });
        imported++;
      }
    }

    alert(`导入完成：成功导入 ${imported} / ${count} 条记录`);

    // Reload the page to reflect imported data
    window.location.reload();
  } catch (err) {
    console.error('[Bookmarks] Import error:', err);
    alert('导入失败：' + err.message);
  } finally {
    // Reset file input so the same file can be re-imported
    els.fileInput.value = '';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
