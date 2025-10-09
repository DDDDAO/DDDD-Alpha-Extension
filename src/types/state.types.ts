/**
 * 状态相关类型定义
 */

import type { IntervalMode } from '../config/defaults';

/**
 * 自动化状态
 */
export interface AutomationState {
  enabled: boolean;
  inProgress: boolean;
  loopActive: boolean;
  monitoringEnabled: boolean;
}

/**
 * 价格配置状态
 */
export interface PriceConfigState {
  priceOffsetPercent: number;
  buyPriceOffset: number;
  sellPriceOffset: number;
}

/**
 * 积分配置状态
 */
export interface PointsConfigState {
  pointsFactor: number;
  pointsTarget: number;
}

/**
 * 订单监控状态
 */
export interface OrderMonitoringState {
  pendingOrders: Map<string, number>;
  warningsShown5Sec: Set<string>;
  warningsShown10Sec: Set<string>;
  monitoringEnabled: boolean;
  monitorId?: number;
}

/**
 * 全局运行时状态
 */
export interface RuntimeState extends AutomationState, PriceConfigState, PointsConfigState {
  loginErrorDispatched: boolean;
  lastOrderPlacedAt: number;
  runtimeUnavailable: boolean;
  nextEvaluationTimeoutId?: number;
  intervalMode: IntervalMode;
}

/**
 * Token 目录缓存状态
 */
export interface TokenDirectoryCacheState {
  cachedMultiplierMap: Record<string, number> | null;
  cachedTimestamp: number;
}
