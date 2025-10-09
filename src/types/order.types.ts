/**
 * 订单相关类型定义
 */

/**
 * 订单下单状态
 */
export type OrderPlacementStatus = 'placed' | 'skipped' | 'cooldown';

/**
 * 订单下单结果
 */
export interface OrderPlacementResult {
  status: OrderPlacementStatus;
  reason?: string;
  buyVolume?: number;
  availableBalanceBeforeOrder?: number;
}

/**
 * 订单状态
 */
export type OrderState = 'empty' | 'non-empty' | 'unknown';

/**
 * 订单信息
 */
export interface OrderInfo {
  key: string;
  side: 'buy' | 'sell';
}

/**
 * 订单下单参数
 */
export interface OrderPlacementParams {
  price: number;
  priceOffsetPercent: number;
  buyPriceOffset: number;
  sellPriceOffset: number;
}

/**
 * 限价单配置参数
 */
export interface LimitOrderConfig extends OrderPlacementParams {
  availableUsdt: number;
  orderPanel: HTMLElement;
}

/**
 * 评估选项
 */
export interface EvaluationOptions {
  placeOrder?: boolean;
}

/**
 * 任务执行选项
 */
export interface TaskExecutionOptions {
  placeOrder?: boolean;
}
