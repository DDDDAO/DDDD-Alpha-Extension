/**
 * 历史记录相关类型定义
 */

/**
 * Binance 订单历史响应
 */
export interface BinanceOrderHistoryResponse {
  code?: string;
  message?: string | null;
  data?: unknown[];
}

/**
 * 订单历史摘要
 */
export interface OrderHistorySummary {
  totalBuyVolume: number;
  buyOrderCount: number;
  totalSellVolume: number;
  sellOrderCount: number;
}

/**
 * Alpha 乘数映射
 */
export type AlphaMultiplierMap = Record<string, number>;

/**
 * Alpha 乘数查找函数
 */
export type AlphaMultiplierLookup = (alphaId: string) => number;

/**
 * 历史数据分页选项
 */
export interface HistoryPaginationOptions {
  maxPages?: number;
  pageSize?: number;
}

/**
 * 历史数据获取选项
 */
export interface HistoryFetchOptions extends HistoryPaginationOptions {
  csrfToken: string;
  date?: Date;
}
