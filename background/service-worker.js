/**
 * Background Service Worker (Manifest V3)
 *
 * 职责：
 * 1. 作为 API 代理，处理所有跨域 LLM 请求
 * 2. 接收 popup 的标签生成请求并转发至大模型
 * 3. 返回解析后的标签 JSON 给 popup
 */
import { Storage } from '../lib/storage.js';
import { Encrypt } from '../lib/encrypt.js';
import { API_DEFAULTS, MESSAGE_TYPES } from '../lib/constants.js';

// ====== Message Listener ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case MESSAGE_TYPES.CAPTURE_PAGE:
      handleCapturePage(message.tabId)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    case MESSAGE_TYPES.GENERATE_TAGS:
      handleGenerateTags(message.content, message.customPrompt)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message }));
      return true;

    default:
      // Not for us — might be content script self-messages
      return false;
  }
});

// ====== Service Worker Lifecycle ======
self.addEventListener('install', () => {
  console.log('[ServiceWorker] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activated');
  event.waitUntil(clients.claim());
});

// ====== Page Capture (代理注入，解决 activeTab 权限问题) ======
async function handleCapturePage(tabId) {
  if (!tabId) throw new Error('无效的标签页 ID');

  // 1. Inject content script into the target tab
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js'],
  });

  // 2. Send message to the now-injected content script to request page data
  const response = await chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.CAPTURE_PAGE });

  if (!response) throw new Error('内容脚本未响应');

  return {
    title: response.title || '',
    url: response.url || '',
    content: response.content || '',
  };
}

// ====== Tag Generation ======
async function handleGenerateTags(content, customPrompt) {
  // 1. Get config
  const config = await Storage.getConfig();
  if (!config) {
    throw new Error('配置读取失败，请前往设置页配置 API');
  }

  if (!config.apiKey) {
    throw new Error('API Key 未配置，请前往设置页填写');
  }

  if (!config.apiEndpoint) {
    throw new Error('API 接口地址未配置，请前往设置页填写');
  }

  // 2. Decrypt API key
  const apiKey = Encrypt.decode(config.apiKey);
  if (!apiKey) {
    throw new Error('API Key 解密失败，请重新在设置页保存');
  }

  // 3. Build prompt
  const systemPrompt = buildSystemPrompt(customPrompt);
  const userContent = (content || '').slice(0, API_DEFAULTS.MAX_CONTENT_LENGTH);

  if (!userContent.trim()) {
    throw new Error('网页内容为空，无法生成标签');
  }

  // 4. Call LLM API
  let lastError;
  const maxRetries = API_DEFAULTS.RETRY_TIMES + 1;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callLLM(config, apiKey, systemPrompt, userContent);
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Brief delay before retry
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error('标签生成失败');
}

// ====== LLM API Call ======
async function callLLM(config, apiKey, systemPrompt, userContent) {
  const modelName = config.modelName || 'deepseek-chat';

  const response = await fetch(config.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
    signal: AbortSignal.timeout(API_DEFAULTS.TIMEOUT),
  });

  // Handle HTTP errors
  if (!response.ok) {
    const errorMap = {
      400: '请求参数错误，请检查模型名称',
      401: 'API Key 无效，请检查设置',
      402: 'API 余额不足',
      429: '请求过于频繁，请稍后重试',
      500: 'AI 服务内部错误，请稍后重试',
      502: 'AI 服务暂不可用，请稍后重试',
      503: 'AI 服务正在维护，请稍后重试',
    };
    throw new Error(errorMap[response.status] || `服务异常 (${response.status})`);
  }

  const data = await response.json();

  // Parse response
  return parseTagsResponse(data);
}

// ====== Prompt Builder ======
function buildSystemPrompt(customPrompt) {
  let prompt = `你是一个网页内容分析专家。请分析以下网页内容，按 5 个维度生成标签。

维度说明：
1. 内容领域 — 网页所属的知识/行业领域，如 "科技"、"教育"、"金融"
2. 用途场景 — 适合什么场景使用，如 "学习参考"、"工作文档"、"休闲阅读"
3. 难度等级 — 内容的专业程度，只能选 1 个：入门 / 进阶 / 专业
4. 核心关键词 — 2-4 个代表性关键词，如 "AI"、"机器学习"
5. 内容属性 — 网页的类型，如 "教程"、"新闻"、"分析"、"工具"

要求：
- 每个标签 2-6 个字，简洁标准
- 同维度内自动去重、合并同类项
- 以 JSON 格式输出：{ "contentDomain":[], "usageScenario":[], "difficultyLevel":[], "coreKeywords":[], "contentAttribute":[] }
- 除了 JSON 不要输出任何其他内容`;

  if (customPrompt?.trim()) {
    prompt += `\n\n额外规则：\n${customPrompt.trim()}`;
  }

  return prompt;
}

// ====== Response Parser ======
function parseTagsResponse(data) {
  // Extract content from various API response formats
  let content = '';

  if (data.choices?.[0]?.message?.content) {
    // OpenAI / DeepSeek format
    content = data.choices[0].message.content;
  } else if (data.choices?.[0]?.text) {
    // Older completion format
    content = data.choices[0].text;
  } else if (data.content) {
    // Simplified format
    content = data.content;
  } else if (typeof data === 'string') {
    content = data;
  }

  if (!content) {
    throw new Error('模型返回内容为空，请重试');
  }

  // Extract JSON object from response (handle markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('模型返回格式异常，无法解析标签 JSON');
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate structure
    const expectedKeys = ['contentDomain', 'usageScenario', 'difficultyLevel', 'coreKeywords', 'contentAttribute'];
    const result = {};

    expectedKeys.forEach((key) => {
      const val = parsed[key];
      if (Array.isArray(val)) {
        // Deduplicate and normalize
        result[key] = [...new Set(
          val.map((v) => String(v).trim().slice(0, 10)).filter((v) => v.length >= 1)
        )];
      } else {
        result[key] = [];
      }
    });

    return result;
  } catch (e) {
    throw new Error(`标签数据解析失败：${e.message}`);
  }
}
