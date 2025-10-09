/**
 * Price Formatter 单元测试
 */

import { describe, expect, it } from 'vitest';
import { PriceFormatter } from '@/content/domains/price/price-formatter';

describe('PriceFormatter', () => {
  const formatter = new PriceFormatter();

  describe('formatFixed', () => {
    it('should format number with fixed decimals', () => {
      expect(formatter.formatFixed(1.23456, 2)).toBe('1.23');
      expect(formatter.formatFixed(1.23456, 4)).toBe('1.2346');
      expect(formatter.formatFixed(1.0, 2)).toBe('1.00');
    });

    it('should handle NaN', () => {
      expect(formatter.formatFixed(NaN, 2)).toBe('0.00');
    });

    it('should handle Infinity', () => {
      expect(formatter.formatFixed(Infinity, 2)).toBe('0.00');
      expect(formatter.formatFixed(-Infinity, 2)).toBe('0.00');
    });

    it('should handle negative numbers', () => {
      expect(formatter.formatFixed(-1.23456, 2)).toBe('-1.23');
    });

    it('should handle zero', () => {
      expect(formatter.formatFixed(0, 2)).toBe('0.00');
      expect(formatter.formatFixed(-0, 2)).toBe('0.00');
    });
  });

  describe('formatPrice', () => {
    it('should use 8 decimals for price < 1', () => {
      expect(formatter.formatPrice(0.00123)).toBe('0.00123000');
      expect(formatter.formatPrice(0.999)).toBe('0.99900000');
    });

    it('should use 6 decimals for price >= 1', () => {
      expect(formatter.formatPrice(1.0)).toBe('1.000000');
      expect(formatter.formatPrice(123.456)).toBe('123.456000');
    });

    it('should respect custom fractionDigits option', () => {
      expect(formatter.formatPrice(1.234, { fractionDigits: 2 })).toBe('1.23');
      expect(formatter.formatPrice(0.123, { fractionDigits: 4 })).toBe('0.1230');
    });

    it('should respect custom threshold', () => {
      expect(formatter.formatPrice(5, { threshold: 10 })).toBe('5.00000000');
      expect(formatter.formatPrice(15, { threshold: 10 })).toBe('15.000000');
    });

    it('should ignore threshold when useThreshold is false', () => {
      expect(formatter.formatPrice(0.5, { useThreshold: false })).toBe('0.500000');
    });

    it('should handle invalid values', () => {
      expect(formatter.formatPrice(NaN)).toBe('0.00');
      expect(formatter.formatPrice(Infinity)).toBe('0.00');
    });
  });

  describe('parseNumeric', () => {
    it('should parse plain numbers', () => {
      expect(formatter.parseNumeric('123')).toBe(123);
      expect(formatter.parseNumeric('123.45')).toBe(123.45);
      expect(formatter.parseNumeric('-123.45')).toBe(-123.45);
    });

    it('should parse K suffix (thousands)', () => {
      expect(formatter.parseNumeric('1K')).toBe(1000);
      expect(formatter.parseNumeric('1.5K')).toBe(1500);
      expect(formatter.parseNumeric('0.5k')).toBe(500);
    });

    it('should parse M suffix (millions)', () => {
      expect(formatter.parseNumeric('1M')).toBe(1_000_000);
      expect(formatter.parseNumeric('2.5M')).toBe(2_500_000);
      expect(formatter.parseNumeric('0.1m')).toBe(100_000);
    });

    it('should parse B suffix (billions)', () => {
      expect(formatter.parseNumeric('1B')).toBe(1_000_000_000);
      expect(formatter.parseNumeric('1.2B')).toBe(1_200_000_000);
      expect(formatter.parseNumeric('0.5b')).toBe(500_000_000);
    });

    it('should handle comma-separated numbers', () => {
      expect(formatter.parseNumeric('1,234.56')).toBe(1234.56);
      expect(formatter.parseNumeric('1,000,000')).toBe(1_000_000);
    });

    it('should handle numbers with spaces', () => {
      expect(formatter.parseNumeric('1 234.56')).toBe(1234.56);
      expect(formatter.parseNumeric(' 123 ')).toBe(123);
    });

    it('should return null for empty string', () => {
      expect(formatter.parseNumeric('')).toBeNull();
      expect(formatter.parseNumeric('   ')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(formatter.parseNumeric('abc')).toBeNull();
      expect(formatter.parseNumeric('12.34.56')).toBeNull();
      expect(formatter.parseNumeric('1.2.3K')).toBeNull();
    });

    it('should return null for invalid suffix', () => {
      expect(formatter.parseNumeric('123X')).toBeNull();
      expect(formatter.parseNumeric('123KM')).toBeNull();
    });

    it('should handle negative numbers with suffix', () => {
      expect(formatter.parseNumeric('-1K')).toBe(-1000);
      expect(formatter.parseNumeric('-2.5M')).toBe(-2_500_000);
    });
  });

  describe('formatPriceOffset', () => {
    it('should format positive offset', () => {
      expect(formatter.formatPriceOffset(1.5)).toBe('+1.50%');
      expect(formatter.formatPriceOffset(0.01)).toBe('+0.01%');
    });

    it('should format negative offset', () => {
      expect(formatter.formatPriceOffset(-1.5)).toBe('-1.50%');
      expect(formatter.formatPriceOffset(-0.01)).toBe('-0.01%');
    });

    it('should format zero offset', () => {
      expect(formatter.formatPriceOffset(0)).toBe('+0.00%');
    });

    it('should handle invalid values', () => {
      expect(formatter.formatPriceOffset(NaN)).toBe('0.00%');
      expect(formatter.formatPriceOffset(Infinity)).toBe('0.00%');
    });
  });
});
