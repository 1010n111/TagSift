/**
 * 网页内容抓取脚本（Content Script）
 *
 * 职责：
 * 1. 监听来自 popup/background 的消息
 * 2. 智能提取当前网页的核心正文内容
 * 3. 过滤广告、导航栏、页脚等非正文元素
 * 4. 返回 { title, url, content } 给调用方
 */

// ====== Message Listener ======
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'capture_page') {
    const result = extractPageContent();
    sendResponse(result);
  }
  // Must NOT return true — we respond synchronously.
  // If we needed async, we'd return true.
});

// ====== Page Content Extraction ======
function extractPageContent() {
  const title = extractTitle();
  const url = window.location.href;
  const content = extractMainContent();

  return { title, url, content };
}

// ====== Title Extraction ======
function extractTitle() {
  // Prefer Open Graph title
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle?.content) return ogTitle.content.trim();

  // Prefer Twitter card title
  const twitterTitle = document.querySelector('meta[name="twitter:title"]');
  if (twitterTitle?.content) return twitterTitle.content.trim();

  // Fallback to document title
  return document.title?.trim() || '';
}

// ====== Main Content Extraction ======
function extractMainContent() {
  // Strategy: find the text-densest container in <body>
  const body = document.body;
  if (!body) return '';

  // 1. Try common article containers first
  const articleSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.markdown-body',
    '.prose',
  ];

  for (const selector of articleSelectors) {
    const el = document.querySelector(selector);
    if (el && isVisible(el)) {
      const text = cleanElement(el);
      if (text.length > 100) return text;
    }
  }

  // 2. Fallback: score all major containers by text density
  const candidates = [];
  const containerCandidates = body.querySelectorAll('div, section, article, main');

  containerCandidates.forEach((el) => {
    // Skip small / hidden elements
    if (!isVisible(el)) return;
    const text = el.innerText || '';
    if (text.length < 80) return;

    // Count link text to filter out nav/list pages
    const links = el.querySelectorAll('a');
    const linkTextLen = Array.from(links).reduce((sum, a) => sum + (a.innerText?.length || 0), 0);
    const totalLen = text.length;

    // Text density score: higher is better
    const score = (totalLen - linkTextLen) / Math.max(el.querySelectorAll('*').length, 1);

    candidates.push({ el, score, textLen: totalLen });
  });

  // Sort by score, pick best
  candidates.sort((a, b) => b.score - a.score || b.textLen - a.textLen);

  if (candidates.length > 0) {
    const best = candidates[0];
    if (best.textLen > 200) {
      return cleanElement(best.el);
    }
  }

  // 3. Last resort: clean the whole body
  const bodyText = cleanElement(body);
  if (bodyText.length > 50) return bodyText;

  return '';
}

// ====== Visibility Check ======
function isVisible(el) {
  if (!el || !el.nodeType) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

// ====== Element Cleaning ======
function cleanElement(el) {
  // Clone to avoid mutating the page
  const clone = el.cloneNode(true);

  // Remove non-content elements
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'nav', 'header', 'footer',
    '.nav', '.navbar', '.navigation', '.menu',
    '.sidebar', '.aside', '.side',
    '.footer', '.footer-wrapper',
    '.ad', '.ads', '.advertisement', '.adsbygoogle',
    '.social-share', '.share-buttons',
    '.comments', '.comment', '#comments',
    '.related-posts', '.recommended',
    '.popup', '.modal', '.overlay',
    '.cookie', '.cookie-banner',
    '.newsletter', '.subscribe',
    '.breadcrumb',
    '[role="navigation"]',
    '[role="complementary"]',
    '[aria-hidden="true"]',
  ];

  removeSelectors.forEach((selector) => {
    try {
      const elements = clone.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    } catch {
      // Skip invalid selectors
    }
  });

  // Get text and normalize whitespace
  let text = clone.innerText || '';
  text = text
    .replace(/\s+/g, ' ')   // Collapse whitespace
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();

  return text;
}
