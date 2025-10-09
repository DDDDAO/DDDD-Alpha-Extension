# Content Script - 服务层

## 目录结构

```
services/
├── automation.service.ts   # 自动化服务
├── monitoring.service.ts   # 监控服务
└── alert.service.ts        # 告警服务
```

## 职责

服务层协调多个领域模块，实现复杂的业务流程。

### AutomationService
- 自动化流程编排
- 状态管理
- 错误处理

### MonitoringService
- 订单监控
- 状态检测
- 超时处理

### AlertService
- 视觉告警
- 音频提示
- 用户通知

## 示例

```typescript
import type { OrderPlacer } from '../domains/order/order-placer';
import type { VWAPCalculator } from '../domains/price/vwap-calculator';

export class AutomationService {
  constructor(
    private orderPlacer: OrderPlacer,
    private vwapCalculator: VWAPCalculator,
  ) {}

  async runAutomationCycle(): Promise<void> {
    // 编排多个领域模块完成自动化流程
  }
}
```
