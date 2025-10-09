/**
 * 价格偏移计算器
 *
 * 职责：
 * - 计算买入/卖出价格偏移
 * - 验证偏移范围
 * - 应用价格偏移
 */

import type { PriceOffsetConfig } from '@types';

/**
 * 价格偏移限制
 */
const MIN_PRICE_OFFSET_PERCENT = -5;
const MAX_PRICE_OFFSET_PERCENT = 5;

/**
 * 价格偏移计算器类
 */
export class PriceOffsetCalculator {
  /**
   * 限制价格偏移在有效范围内
   *
   * @param offsetPercent - 偏移百分比
   * @returns 限制后的偏移百分比
   */
  clampOffset(offsetPercent: number): number {
    if (!Number.isFinite(offsetPercent)) {
      return 0;
    }

    if (offsetPercent < MIN_PRICE_OFFSET_PERCENT) {
      return MIN_PRICE_OFFSET_PERCENT;
    }

    if (offsetPercent > MAX_PRICE_OFFSET_PERCENT) {
      return MAX_PRICE_OFFSET_PERCENT;
    }

    return offsetPercent;
  }

  /**
   * 应用价格偏移
   *
   * @param basePrice - 基准价格
   * @param offsetPercent - 偏移百分比
   * @returns 偏移后的价格
   *
   * @example
   * ```typescript
   * const calculator = new PriceOffsetCalculator();
   * calculator.applyOffset(100, 1); // 101 (上涨 1%)
   * calculator.applyOffset(100, -1); // 99 (下跌 1%)
   * ```
   */
  applyOffset(basePrice: number, offsetPercent: number): number {
    const clampedOffset = this.clampOffset(offsetPercent);
    return basePrice * (1 + clampedOffset / 100);
  }

  /**
   * 计算买入和卖出价格
   *
   * @param basePrice - 基准价格（通常是 VWAP）
   * @param config - 价格偏移配置
   * @returns 买入价格和卖出价格
   *
   * @example
   * ```typescript
   * const calculator = new PriceOffsetCalculator();
   * const { buyPrice, sellPrice } = calculator.calculatePrices(100, {
   *   buyPriceOffset: 0.5,
   *   sellPriceOffset: -0.5,
   * });
   * // buyPrice = 100.5, sellPrice = 99.5
   * ```
   */
  calculatePrices(
    basePrice: number,
    config: PriceOffsetConfig,
  ): { buyPrice: number; sellPrice: number } {
    const buyPrice = this.applyOffset(basePrice, config.buyPriceOffset);
    const sellPrice = this.applyOffset(basePrice, config.sellPriceOffset);

    return {
      buyPrice: Math.max(0, buyPrice), // 确保价格非负
      sellPrice: Math.max(0, sellPrice),
    };
  }

  /**
   * 验证偏移配置是否有效
   *
   * @param config - 价格偏移配置
   * @returns 配置是否有效
   */
  validateConfig(config: PriceOffsetConfig): boolean {
    return (
      Number.isFinite(config.buyPriceOffset) &&
      Number.isFinite(config.sellPriceOffset) &&
      config.buyPriceOffset >= MIN_PRICE_OFFSET_PERCENT &&
      config.buyPriceOffset <= MAX_PRICE_OFFSET_PERCENT &&
      config.sellPriceOffset >= MIN_PRICE_OFFSET_PERCENT &&
      config.sellPriceOffset <= MAX_PRICE_OFFSET_PERCENT
    );
  }
}

/**
 * 创建价格偏移计算器实例（工厂函数）
 */
export function createPriceOffsetCalculator(): PriceOffsetCalculator {
  return new PriceOffsetCalculator();
}
