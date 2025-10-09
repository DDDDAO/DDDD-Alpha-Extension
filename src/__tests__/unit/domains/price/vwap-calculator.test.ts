/**
 * VWAP Calculator 单元测试
 */

import type { TradeHistorySample } from '@types';
import { describe, expect, it } from 'vitest';
import { VWAPCalculator } from '@/content/domains/price/vwap-calculator';

describe('VWAPCalculator', () => {
  const calculator = new VWAPCalculator();

  describe('calculate', () => {
    it('should calculate VWAP correctly for valid trades', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 10 },
        { time: '10:01', price: 1.1, quantity: 20 },
        { time: '10:02', price: 0.9, quantity: 30 },
      ];

      const vwap = calculator.calculate(trades);

      // Expected VWAP = (1.0*10 + 1.1*20 + 0.9*30) / (10+20+30)
      // = (10 + 22 + 27) / 60 = 59 / 60 = 0.983333...
      expect(vwap).toBeCloseTo(0.9833, 4);
    });

    it('should return null for empty array', () => {
      expect(calculator.calculate([])).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(calculator.calculate(null as any)).toBeNull();
      expect(calculator.calculate(undefined as any)).toBeNull();
    });

    it('should skip trades with invalid price', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 10 },
        { time: '10:01', price: NaN, quantity: 20 }, // 无效
        { time: '10:02', price: 2.0, quantity: 10 },
      ];

      const vwap = calculator.calculate(trades);

      // 只使用第 1 和第 3 个交易
      // = (1.0*10 + 2.0*10) / (10+10) = 30 / 20 = 1.5
      expect(vwap).toBe(1.5);
    });

    it('should skip trades with invalid quantity', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 10 },
        { time: '10:01', price: 1.5, quantity: Infinity }, // 无效
        { time: '10:02', price: 2.0, quantity: 10 },
      ];

      const vwap = calculator.calculate(trades);

      // 只使用第 1 和第 3 个交易
      expect(vwap).toBe(1.5);
    });

    it('should return null when all trades are invalid', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: NaN, quantity: 10 },
        { time: '10:01', price: 1.0, quantity: Infinity },
      ];

      expect(calculator.calculate(trades)).toBeNull();
    });

    it('should return null when total volume is zero', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 0 },
        { time: '10:01', price: 2.0, quantity: 0 },
      ];

      expect(calculator.calculate(trades)).toBeNull();
    });

    it('should handle single trade', () => {
      const trades: TradeHistorySample[] = [{ time: '10:00', price: 1.5, quantity: 100 }];

      const vwap = calculator.calculate(trades);
      expect(vwap).toBe(1.5);
    });

    it('should handle very small numbers', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 0.0001, quantity: 1000 },
        { time: '10:01', price: 0.0002, quantity: 2000 },
      ];

      const vwap = calculator.calculate(trades);

      // = (0.0001*1000 + 0.0002*2000) / (1000+2000)
      // = (0.1 + 0.4) / 3000 = 0.5 / 3000 = 0.00016666...
      expect(vwap).toBeCloseTo(0.0001667, 7);
    });

    it('should handle very large numbers', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1000000, quantity: 1000000 },
        { time: '10:01', price: 2000000, quantity: 2000000 },
      ];

      const vwap = calculator.calculate(trades);

      // = (1000000*1000000 + 2000000*2000000) / (1000000+2000000)
      // = (1e12 + 4e12) / 3000000 = 5e12 / 3000000 = 1666666.666...
      expect(vwap).toBeCloseTo(1666666.67, 2);
    });
  });

  describe('calculateWithDetails', () => {
    it('should return detailed VWAP result', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 10 },
        { time: '10:01', price: 2.0, quantity: 20 },
      ];

      const result = calculator.calculateWithDetails(trades);

      expect(result.vwap).toBeCloseTo(1.667, 3);
      expect(result.tradeCount).toBe(2);
      expect(result.totalVolume).toBe(30);
    });

    it('should return zeros for empty array', () => {
      const result = calculator.calculateWithDetails([]);

      expect(result.vwap).toBeNull();
      expect(result.tradeCount).toBe(0);
      expect(result.totalVolume).toBe(0);
    });

    it('should only count valid trades', () => {
      const trades: TradeHistorySample[] = [
        { time: '10:00', price: 1.0, quantity: 10 },
        { time: '10:01', price: NaN, quantity: 20 }, // 无效
        { time: '10:02', price: 2.0, quantity: 10 },
      ];

      const result = calculator.calculateWithDetails(trades);

      expect(result.tradeCount).toBe(2); // 只有 2 个有效交易
      expect(result.totalVolume).toBe(20);
    });
  });
});
