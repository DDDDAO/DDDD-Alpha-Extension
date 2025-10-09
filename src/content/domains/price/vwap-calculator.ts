/**
 * VWAP (Volume Weighted Average Price) 计算器
 *
 * 职责：
 * - 计算成交量加权平均价格
 * - 验证交易数据有效性
 */

import type { TradeHistorySample, VWAPResult } from '@types';

/**
 * VWAP 计算器类
 */
export class VWAPCalculator {
  /**
   * 计算成交量加权平均价格
   *
   * @param trades - 交易历史样本数组
   * @returns VWAP 值，如果无法计算则返回 null
   *
   * @example
   * ```typescript
   * const calculator = new VWAPCalculator();
   * const trades = [
   *   { time: '10:00', price: 1.0, quantity: 10 },
   *   { time: '10:01', price: 1.1, quantity: 20 },
   * ];
   * const vwap = calculator.calculate(trades);
   * // vwap = (1.0 * 10 + 1.1 * 20) / (10 + 20) = 1.067
   * ```
   */
  calculate(trades: TradeHistorySample[]): number | null {
    if (!trades || trades.length === 0) {
      return null;
    }

    let weightedSum = 0;
    let volumeSum = 0;

    for (const trade of trades) {
      // 验证数据有效性
      if (!Number.isFinite(trade.price) || !Number.isFinite(trade.quantity)) {
        continue;
      }

      // 累加加权价格和成交量
      weightedSum += trade.price * trade.quantity;
      volumeSum += trade.quantity;
    }

    // 避免除以零
    if (volumeSum === 0) {
      return null;
    }

    return weightedSum / volumeSum;
  }

  /**
   * 计算 VWAP 并返回详细结果
   *
   * @param trades - 交易历史样本数组
   * @returns 包含 VWAP、交易数量和总成交量的结果对象
   */
  calculateWithDetails(trades: TradeHistorySample[]): VWAPResult {
    if (!trades || trades.length === 0) {
      return {
        vwap: null,
        tradeCount: 0,
        totalVolume: 0,
      };
    }

    let weightedSum = 0;
    let volumeSum = 0;
    let validTradeCount = 0;

    for (const trade of trades) {
      if (!Number.isFinite(trade.price) || !Number.isFinite(trade.quantity)) {
        continue;
      }

      weightedSum += trade.price * trade.quantity;
      volumeSum += trade.quantity;
      validTradeCount++;
    }

    const vwap = volumeSum === 0 ? null : weightedSum / volumeSum;

    return {
      vwap,
      tradeCount: validTradeCount,
      totalVolume: volumeSum,
    };
  }
}

/**
 * 创建 VWAP 计算器实例（工厂函数）
 */
export function createVWAPCalculator(): VWAPCalculator {
  return new VWAPCalculator();
}
