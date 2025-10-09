/**
 * DOM 相关类型定义
 */

/**
 * 页面语言环境
 */
export type PageLocale = 'en' | 'zh-CN';

/**
 * DOM 选择器配置
 */
export interface SelectorConfig {
  tradeHistoryPanel?: string;
  tradeHistoryRow?: string;
  tokenSymbol?: string;
  loginPrompt?: string;
  tradingFormPanel?: string;
}

/**
 * 元素查找选项
 */
export interface ElementFindOptions {
  timeout?: number;
  pollInterval?: number;
  exact?: boolean;
}

/**
 * Token 目录记录
 */
export interface TokenDirectoryRecord {
  mulPoint?: number | string | null;
  alphaId?: string | null;
}

/**
 * Token 目录容器
 */
export interface TokenDirectoryContainer {
  directory?: Record<string, TokenDirectoryRecord>;
}

/**
 * 表单延迟配置
 */
export interface FormDelayConfig {
  min: number;
  max: number;
}
