/**
 * VWAP(成交量加权平均价格)计算器
 * 负责根据交易历史计算VWAP
 */

export interface TradeHistorySample {
  time: string;
  price: number;
  quantity: number;
}

/**
 * VWAP计算器类
 */
export class VWAPCalculator {
  /**
   * 计算交易历史的VWAP
   * @param trades - 交易历史样本数组
   * @returns VWAP值，如果无法计算则返回null
   */
  calculate(trades: TradeHistorySample[]): number | null {
    if (trades.length === 0) {
      return null;
    }

    let weightedSum = 0;
    let volumeSum = 0;

    for (const trade of trades) {
      if (!this.isValidTrade(trade)) {
        continue;
      }

      weightedSum += trade.price * trade.quantity;
      volumeSum += trade.quantity;
    }

    if (volumeSum === 0) {
      return null;
    }

    return weightedSum / volumeSum;
  }

  /**
   * 检查交易数据是否有效
   * @param trade - 交易样本
   * @returns 是否有效
   */
  private isValidTrade(trade: TradeHistorySample): boolean {
    return (
      Number.isFinite(trade.price) &&
      Number.isFinite(trade.quantity) &&
      trade.price > 0 &&
      trade.quantity > 0
    );
  }

  /**
   * 格式化价格为指定精度
   * @param price - 价格
   * @param precision - 精度（小数位数）
   * @returns 格式化后的价格字符串
   */
  formatPrice(price: number, precision?: number): string {
    const actualPrecision = precision ?? (price < 1 ? 8 : 6);
    return price.toFixed(actualPrecision);
  }
}
