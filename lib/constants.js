/**
 * 全局常量定义
 * 集中管理所有配置 key、默认值、维度定义等
 */

// ====== Chrome Storage Keys ======
export const STORAGE_KEYS = {
  /** 用户配置 */
  CONFIG: 'ai_tag_config',
  /** 标签记录集合 */
  TAGS: 'ai_tag_records',
};

// ====== 默认配置 ======
export const DEFAULT_CONFIG = {
  apiProvider: 'custom',
  apiKey: '',
  apiEndpoint: '',
  modelName: 'deepseek-chat',
  autoCapture: true,
  autoTag: true,
  customPrompt: '',
  theme: 'auto',
};

// ====== 标签维度定义 ======
export const TAG_DIMENSIONS = {
  contentDomain: {
    label: '内容领域',
    color: '#4A90D9',
    description: '网页所属的知识/行业领域',
    singleSelect: false,
  },
  usageScenario: {
    label: '用途场景',
    color: '#50C878',
    description: '该网页适合什么场景使用',
    singleSelect: false,
  },
  difficultyLevel: {
    label: '难度等级',
    color: '#FF8C42',
    description: '内容的专业/难易程度',
    singleSelect: true,
  },
  coreKeywords: {
    label: '核心关键词',
    color: '#9B59B6',
    description: '2-4 个代表性关键词',
    singleSelect: false,
  },
  contentAttribute: {
    label: '内容属性',
    color: '#E74C3C',
    description: '网页的类型/体裁',
    singleSelect: false,
  },
};

/** 维度 key 列表，用于遍历 */
export const TAG_DIMENSION_KEYS = Object.keys(TAG_DIMENSIONS);

// ====== API 默认参数 ======
export const API_DEFAULTS = {
  /** 请求超时时间 (ms) */
  TIMEOUT: 15_000,
  /** 发送给模型的最大内容长度（字符数） */
  MAX_CONTENT_LENGTH: 8000,
  /** 失败重试次数 */
  RETRY_TIMES: 1,
};

// ====== 抓取节流 ======
export const CAPTURE_THROTTLE_MS = 30_000;

// ====== 消息类型（插件内部通信） ======
export const MESSAGE_TYPES = {
  CAPTURE_PAGE: 'capture_page',
  GENERATE_TAGS: 'generate_tags',
};

// ====== 存储 Key（加密用） ======
export const ENCRYPT_KEY = 'AI_TAG_EXT_2025';
