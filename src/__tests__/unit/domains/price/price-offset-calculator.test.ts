/**
 * Price Offset Calculator 单元测试
 */

import { describe, expect, it } from 'vitest';
import { PriceOffsetCalculator } from '@/content/domains/price/price-offset-calculator';

describe('PriceOffsetCalculator', () => {
  const calculator = new PriceOffsetCalculator();

  describe('clampOffset', () => {
    it('should return value within valid range', () => {
      expect(calculator.clampOffset(0)).toBe(0);
      expect(calculator.clampOffset(1)).toBe(1);
      expect(calculator.clampOffset(-1)).toBe(-1);
      expect(calculator.clampOffset(5)).toBe(5);
      expect(calculator.clampOffset(-5)).toBe(-5);
    });

    it('should clamp value above maximum', () => {
      expect(calculator.clampOffset(6)).toBe(5);
      expect(calculator.clampOffset(10)).toBe(5);
      expect(calculator.clampOffset(100)).toBe(5);
    });

    it('should clamp value below minimum', () => {
      expect(calculator.clampOffset(-6)).toBe(-5);
      expect(calculator.clampOffset(-10)).toBe(-5);
      expect(calculator.clampOffset(-100)).toBe(-5);
    });

    it('should handle invalid values', () => {
      expect(calculator.clampOffset(NaN)).toBe(0);
      expect(calculator.clampOffset(Infinity)).toBe(5);
      expect(calculator.clampOffset(-Infinity)).toBe(-5);
    });
  });

  describe('applyOffset', () => {
    it('should apply positive offset correctly', () => {
      expect(calculator.applyOffset(100, 1)).toBe(101);
      expect(calculator.applyOffset(100, 5)).toBe(105);
      expect(calculator.applyOffset(50, 2)).toBe(51);
    });

    it('should apply negative offset correctly', () => {
      expect(calculator.applyOffset(100, -1)).toBe(99);
      expect(calculator.applyOffset(100, -5)).toBe(95);
      expect(calculator.applyOffset(50, -2)).toBe(49);
    });

    it('should apply zero offset', () => {
      expect(calculator.applyOffset(100, 0)).toBe(100);
    });

    it('should clamp offset before applying', () => {
      // 偏移超过最大值 5%
      expect(calculator.applyOffset(100, 10)).toBe(105);

      // 偏移低于最小值 -5%
      expect(calculator.applyOffset(100, -10)).toBe(95);
    });

    it('should handle decimal prices', () => {
      expect(calculator.applyOffset(1.5, 1)).toBeCloseTo(1.515, 6);
      expect(calculator.applyOffset(0.001, 1)).toBeCloseTo(0.00101, 8);
    });

    it('should handle large prices', () => {
      expect(calculator.applyOffset(1_000_000, 1)).toBe(1_010_000);
    });
  });

  describe('calculatePrices', () => {
    it('should calculate buy and sell prices correctly', () => {
      const result = calculator.calculatePrices(100, {
        buyPriceOffset: 0.5,
        sellPriceOffset: -0.5,
      });

      expect(result.buyPrice).toBeCloseTo(100.5, 6);
      expect(result.sellPrice).toBeCloseTo(99.5, 6);
    });

    it('should ensure prices are non-negative', () => {
      const result = calculator.calculatePrices(10, {
        buyPriceOffset: -5,
        sellPriceOffset: -5,
      });

      // 10 * (1 - 0.05) = 9.5
      expect(result.buyPrice).toBeCloseTo(9.5, 6);
      expect(result.sellPrice).toBeCloseTo(9.5, 6);
      expect(result.buyPrice).toBeGreaterThanOrEqual(0);
      expect(result.sellPrice).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero offsets', () => {
      const result = calculator.calculatePrices(100, {
        buyPriceOffset: 0,
        sellPriceOffset: 0,
      });

      expect(result.buyPrice).toBe(100);
      expect(result.sellPrice).toBe(100);
    });

    it('should clamp extreme offsets', () => {
      const result = calculator.calculatePrices(100, {
        buyPriceOffset: 100, // 会被限制为 5
        sellPriceOffset: -100, // 会被限制为 -5
      });

      expect(result.buyPrice).toBe(105);
      expect(result.sellPrice).toBe(95);
    });

    it('should handle small base prices', () => {
      const result = calculator.calculatePrices(0.001, {
        buyPriceOffset: 1,
        sellPriceOffset: -1,
      });

      expect(result.buyPrice).toBeCloseTo(0.00101, 8);
      expect(result.sellPrice).toBeCloseTo(0.00099, 8);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct config', () => {
      expect(
        calculator.validateConfig({
          buyPriceOffset: 0.5,
          sellPriceOffset: -0.5,
        }),
      ).toBe(true);

      expect(
        calculator.validateConfig({
          buyPriceOffset: 5,
          sellPriceOffset: -5,
        }),
      ).toBe(true);

      expect(
        calculator.validateConfig({
          buyPriceOffset: 0,
          sellPriceOffset: 0,
        }),
      ).toBe(true);
    });

    it('should reject config with offsets out of range', () => {
      expect(
        calculator.validateConfig({
          buyPriceOffset: 6,
          sellPriceOffset: 0,
        }),
      ).toBe(false);

      expect(
        calculator.validateConfig({
          buyPriceOffset: 0,
          sellPriceOffset: -6,
        }),
      ).toBe(false);
    });

    it('should reject config with invalid values', () => {
      expect(
        calculator.validateConfig({
          buyPriceOffset: NaN,
          sellPriceOffset: 0,
        }),
      ).toBe(false);

      expect(
        calculator.validateConfig({
          buyPriceOffset: 0,
          sellPriceOffset: Infinity,
        }),
      ).toBe(false);
    });
  });
});
