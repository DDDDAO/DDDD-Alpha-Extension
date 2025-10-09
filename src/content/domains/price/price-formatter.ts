/**
 * 价格格式化工具
 *
 * 职责：
 * - 格式化数字为固定小数位
 * - 解析数值字符串（支持 K/M/B 后缀）
 * - 价格精度处理
 */

import type { PriceFormatOptions } from '@types';

/**
 * 价格格式化器类
 */
export class PriceFormatter {
  /**
   * 格式化数字为固定小数位字符串
   *
   * @param value - 要格式化的数值
   * @param fractionDigits - 小数位数
   * @returns 格式化后的字符串
   *
   * @example
   * ```typescript
   * const formatter = new PriceFormatter();
   * formatter.formatFixed(1.23456, 2); // "1.23"
   * formatter.formatFixed(NaN, 2); // "0.00"
   * ```
   */
  formatFixed(value: number, fractionDigits: number): string {
    if (!Number.isFinite(value)) {
      return (0).toFixed(fractionDigits);
    }

    return value.toFixed(fractionDigits);
  }

  /**
   * 根据价格大小智能选择精度
   *
   * @param value - 价格值
   * @param options - 格式化选项
   * @returns 格式化后的字符串
   *
   * @example
   * ```typescript
   * formatter.formatPrice(0.00123); // "0.00123000" (8位小数)
   * formatter.formatPrice(123.456); // "123.456000" (6位小数)
   * ```
   */
  formatPrice(value: number, options?: PriceFormatOptions): string {
    if (!Number.isFinite(value)) {
      return '0.00';
    }

    const { useThreshold = true, threshold = 1, fractionDigits } = options ?? {};

    let digits: number;

    if (fractionDigits !== undefined) {
      // 使用指定的小数位数
      digits = fractionDigits;
    } else if (useThreshold) {
      // 根据阈值智能选择精度
      digits = value < threshold ? 8 : 6;
    } else {
      // 默认精度
      digits = 6;
    }

    return value.toFixed(digits);
  }

  /**
   * 解析数值字符串（支持 K/M/B 后缀）
   *
   * @param raw - 原始字符串
   * @returns 解析后的数值，无法解析则返回 null
   *
   * @example
   * ```typescript
   * formatter.parseNumeric('1.5K'); // 1500
   * formatter.parseNumeric('2.3M'); // 2300000
   * formatter.parseNumeric('1.2B'); // 1200000000
   * formatter.parseNumeric('123.45'); // 123.45
   * formatter.parseNumeric('invalid'); // null
   * ```
   */
  parseNumeric(raw: string): number | null {
    // 移除逗号和空格
    const sanitized = raw.replace(/[,\s]/g, '');

    if (!sanitized) {
      return null;
    }

    // 匹配数字和可选的 K/M/B 后缀
    const match = sanitized.match(/^(-?\d+(?:\.\d+)?)([KMB]?)$/i);

    if (!match) {
      return null;
    }

    let value = Number(match[1]);

    if (!Number.isFinite(value)) {
      return null;
    }

    // 处理后缀
    const suffix = match[2]?.toUpperCase() ?? '';

    switch (suffix) {
      case 'K':
        value *= 1_000;
        break;
      case 'M':
        value *= 1_000_000;
        break;
      case 'B':
        value *= 1_000_000_000;
        break;
      default:
        // 无后缀，保持原值
        break;
    }

    return value;
  }

  /**
   * 格式化价格偏移百分比
   *
   * @param offsetPercent - 偏移百分比
   * @returns 格式化后的字符串
   */
  formatPriceOffset(offsetPercent: number): string {
    if (!Number.isFinite(offsetPercent)) {
      return '0.00%';
    }

    const sign = offsetPercent >= 0 ? '+' : '';
    return `${sign}${offsetPercent.toFixed(2)}%`;
  }
}

/**
 * 创建价格格式化器实例（工厂函数）
 */
export function createPriceFormatter(): PriceFormatter {
  return new PriceFormatter();
}

/**
 * 单例实例（便捷使用）
 */
export const priceFormatter = new PriceFormatter();
