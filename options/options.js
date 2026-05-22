/**
 * 设置页逻辑
 *
 * 职责：
 * 1. 读取/保存配置至 chrome.storage.local
 * 2. API Key 加密存储
 * 3. 测试 API 连接
 */
import { Storage } from '../lib/storage.js';
import { Encrypt } from '../lib/encrypt.js';
import { DEFAULT_CONFIG } from '../lib/constants.js';

// ====== DOM References ======
const $ = (id) => document.getElementById(id);

const form = {
  apiEndpoint: $('apiEndpoint'),
  apiKey: $('apiKey'),
  modelName: $('modelName'),
  autoCapture: $('autoCapture'),
  autoTag: $('autoTag'),
  customPrompt: $('customPrompt'),
  theme: $('theme'),
};

const els = {
  form: $('configForm'),
  btnTest: $('btnTest'),
  btnToggleKey: $('btnToggleKey'),
  statusMessage: $('statusMessage'),
};

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  await loadConfig();
  bindEvents();
});

// ====== Events ======
function bindEvents() {
  els.form.addEventListener('submit', handleSave);
  els.btnTest.addEventListener('click', handleTestConnection);
  els.btnToggleKey.addEventListener('click', toggleKeyVisibility);
  form.theme.addEventListener('change', handleThemeChange);
}

// ====== Load Config ======
async function loadConfig() {
  try {
    const config = await Storage.getConfig();
    form.apiEndpoint.value = config.apiEndpoint || '';
    form.apiKey.value = config.apiKey ? '••••••••' : '';  // Don't expose plaintext
    form.modelName.value = config.modelName || '';
    form.autoCapture.checked = config.autoCapture !== false;
    form.autoTag.checked = config.autoTag !== false;
    form.customPrompt.value = config.customPrompt || '';
    form.theme.value = config.theme || 'auto';

    // Store temporarily for save
    els.form.dataset.hasKey = config.apiKey ? 'true' : 'false';
    els.form.dataset.realKey = config.apiKey || '';
  } catch (err) {
    console.error('[Options] Load config error:', err);
    showStatus('加载配置失败', 'error');
  }
}

// ====== Save Config ======
async function handleSave(e) {
  e.preventDefault();

  let apiKey = form.apiKey.value;

  // If the field still shows masked dots, keep the existing key
  if (apiKey === '••••••••') {
    apiKey = els.form.dataset.realKey || '';
  } else if (apiKey) {
    // Encrypt new key
    apiKey = Encrypt.encode(apiKey);
  }

  const config = {
    apiProvider: 'custom',
    apiEndpoint: form.apiEndpoint.value.trim(),
    apiKey: apiKey,
    modelName: form.modelName.value.trim(),
    autoCapture: form.autoCapture.checked,
    autoTag: form.autoTag.checked,
    customPrompt: form.customPrompt.value.trim(),
    theme: form.theme.value,
  };

  // Validate
  if (!config.apiEndpoint) {
    showStatus('请输入 API 接口地址', 'error');
    form.apiEndpoint.focus();
    return;
  }

  if (!config.apiKey && !els.form.dataset.hasKey) {
    showStatus('请输入 API Key', 'error');
    form.apiKey.focus();
    return;
  }

  const ok = await Storage.saveConfig(config);
  if (ok) {
    els.form.dataset.hasKey = 'true';
    els.form.dataset.realKey = config.apiKey;
    form.apiKey.value = '••••••••';
    showStatus('设置已保存 ✅', 'success');
  } else {
    showStatus('保存失败，请重试', 'error');
  }
}

// ====== Test Connection ======
async function handleTestConnection() {
  const endpoint = form.apiEndpoint.value.trim();
  let apiKey = form.apiKey.value;

  if (!endpoint) {
    showStatus('请先填写 API 接口地址', 'error');
    return;
  }

  if (apiKey === '••••••••') {
    apiKey = Encrypt.decode(els.form.dataset.realKey || '');
  }

  if (!apiKey) {
    showStatus('请先填写 API Key', 'error');
    return;
  }

  els.btnTest.disabled = true;
  els.btnTest.textContent = '⏳ 测试中...';
  showStatus('正在测试连接...', '');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: form.modelName.value.trim() || 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) {
      showStatus('✅ 连接成功！API 配置可用', 'success');
    } else if (response.status === 401) {
      showStatus('❌ API Key 无效，请检查', 'error');
    } else {
      showStatus(`❌ 服务返回异常 (${response.status})`, 'error');
    }
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      showStatus('⏰ 连接超时，请检查接口地址', 'error');
    } else {
      showStatus(`❌ 连接失败：${err.message}`, 'error');
    }
  } finally {
    els.btnTest.disabled = false;
    els.btnTest.textContent = '🔍 测试连接';
  }
}

// ====== Toggle API Key Visibility ======
function toggleKeyVisibility() {
  if (form.apiKey.type === 'password') {
    form.apiKey.type = 'text';
    els.btnToggleKey.textContent = '🙈';
  } else {
    form.apiKey.type = 'password';
    els.btnToggleKey.textContent = '👁';
  }
}

// ====== Theme ======
function applyTheme() {
  const theme = form.theme?.value || 'auto';
  document.documentElement.dataset.theme = theme;
}

function handleThemeChange() {
  applyTheme();
}

// ====== Status Display ======
function showStatus(text, type) {
  els.statusMessage.textContent = text;
  els.statusMessage.className = 'status-message';
  if (type) {
    els.statusMessage.classList.add(type);
  }
  els.statusMessage.classList.remove('hidden');
}
