# Content Script - 领域模块

## 目录结构

```
domains/
├── order/          # 订单领域
│   ├── index.ts
│   ├── order-placer.ts
│   ├── order-monitor.ts
│   └── order-validator.ts
│
├── price/          # 价格领域
│   ├── index.ts
│   ├── vwap-calculator.ts
│   └── price-formatter.ts
│
├── balance/        # 余额领域
│   ├── index.ts
│   └── balance-tracker.ts
│
└── history/        # 历史记录领域
    ├── index.ts
    ├── history-fetcher.ts
    └── history-merger.ts
```

## 设计原则

### 1. 单一职责原则 (SRP)
每个领域模块只负责一个业务领域的逻辑。

### 2. 纯函数优先
- 领域逻辑尽量实现为纯函数
- 易于测试
- 无副作用

### 3. 依赖注入
- 通过构造函数注入依赖
- 便于测试和模拟

### 4. 类型安全
- 使用 `@types` 中定义的类型
- 避免 `any` 类型

## 示例

```typescript
import type { TradeHistorySample } from '@types';

export class VWAPCalculator {
  /**
   * 计算成交量加权平均价格
   */
  calculate(trades: TradeHistorySample[]): number | null {
    if (!trades.length) return null;

    let weightedSum = 0;
    let volumeSum = 0;

    for (const trade of trades) {
      if (!Number.isFinite(trade.price) || !Number.isFinite(trade.quantity)) {
        continue;
      }

      weightedSum += trade.price * trade.quantity;
      volumeSum += trade.quantity;
    }

    return volumeSum === 0 ? null : weightedSum / volumeSum;
  }
}
```
