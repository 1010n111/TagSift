/**
 * API Key 本地存储加密工具
 *
 * 使用 XOR + Base64 对 API Key 进行简单混淆。
 * 注意：此为轻量级混淆而非真正加密。
 * Chrome storage.local 本身处于沙盒环境，仅当前扩展可访问。
 * 主要目的是防止 API Key 以明文形式出现在存储层。
 */
import { ENCRYPT_KEY } from './constants.js';

export const Encrypt = {
  /**
   * 加密：XOR 混淆 → Base64 编码
   * @param {string} str - 原始文本
   * @returns {string} 加密后的 Base64 字符串
   */
  encode(str) {
    if (!str) return '';
    const key = ENCRYPT_KEY;
    const codePoints = [];
    for (let i = 0; i < str.length; i++) {
      codePoints.push(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(String.fromCharCode(...codePoints));
  },

  /**
   * 解密：Base64 解码 → XOR 还原
   * @param {string} encodedStr - 加密的 Base64 字符串
   * @returns {string} 原始文本
   */
  decode(encodedStr) {
    if (!encodedStr) return '';
    try {
      const key = ENCRYPT_KEY;
      const decoded = atob(encodedStr);
      const chars = [];
      for (let i = 0; i < decoded.length; i++) {
        chars.push(String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
      }
      return chars.join('');
    } catch {
      return '';
    }
  },
};
