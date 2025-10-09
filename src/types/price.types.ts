/**
 * 价格相关类型定义
 */

/**
 * 交易历史样本
 */
export interface TradeHistorySample {
  time: string;
  price: number;
  quantity: number;
}

/**
 * VWAP 计算结果
 */
export interface VWAPResult {
  vwap: number | null;
  tradeCount: number;
  totalVolume: number;
}

/**
 * 价格格式化选项
 */
export interface PriceFormatOptions {
  fractionDigits?: number;
  useThreshold?: boolean;
  threshold?: number;
}

/**
 * 价格偏移配置
 */
export interface PriceOffsetConfig {
  buyPriceOffset: number;
  sellPriceOffset: number;
}

/**
 * 价格偏移模式
 */
export type PriceOffsetMode = 'sideways' | 'custom';
