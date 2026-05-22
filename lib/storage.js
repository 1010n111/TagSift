/**
 * Chrome Storage 封装
 *
 * 提供对 chrome.storage.local 的统一读写接口，
 * 自动处理 JSON 序列化、异常捕获。
 */
import { STORAGE_KEYS, DEFAULT_CONFIG } from './constants.js';

export const Storage = {
  // ====== 通用底层方法 ======

  /** 读取指定 key 的值 */
  async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] ?? null;
    } catch (e) {
      console.error('[Storage] get error:', key, e);
      return null;
    }
  },

  /** 写入指定 key 的值 */
  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      console.error('[Storage] set error:', key, e);
      return false;
    }
  },

  /** 删除指定 key */
  async remove(key) {
    try {
      await chrome.storage.local.remove(key);
      return true;
    } catch (e) {
      console.error('[Storage] remove error:', key, e);
      return false;
    }
  },

  /** 清空所有本地存储 */
  async clear() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (e) {
      console.error('[Storage] clear error:', e);
      return false;
    }
  },

  // ====== 标签记录（TagRecord）操作方法 ======

  /** 获取所有标签记录，按更新时间倒序 */
  async getAllRecords() {
    const data = await this.get(STORAGE_KEYS.TAGS);
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
  },

  /** 根据 URL 获取单条记录 */
  async getRecord(url) {
    const data = await this.get(STORAGE_KEYS.TAGS);
    return data?.[url] ?? null;
  },

  /** 保存/更新一条标签记录（相同 URL 自动覆盖） */
  async saveRecord(record) {
    if (!record?.url) return false;
    const data = (await this.get(STORAGE_KEYS.TAGS)) || {};
    data[record.url] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    return this.set(STORAGE_KEYS.TAGS, data);
  },

  /** 根据 URL 删除单条记录 */
  async deleteRecord(url) {
    if (!url) return false;
    const data = (await this.get(STORAGE_KEYS.TAGS)) || {};
    delete data[url];
    return this.set(STORAGE_KEYS.TAGS, data);
  },

  /** 清空所有标签记录 */
  async clearAllRecords() {
    return this.set(STORAGE_KEYS.TAGS, {});
  },

  // ====== 配置操作方法 ======

  /** 读取配置，若不存在则返回默认配置 */
  async getConfig() {
    const config = await this.get(STORAGE_KEYS.CONFIG);
    return config ? { ...DEFAULT_CONFIG, ...config } : { ...DEFAULT_CONFIG };
  },

  /** 保存配置 */
  async saveConfig(config) {
    return this.set(STORAGE_KEYS.CONFIG, config);
  },
};
