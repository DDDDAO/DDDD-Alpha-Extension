# 🏗️ DDDD Alpha Extension - 架构重构方案

> **分支**: `refactor/architecture-optimization`
> **创建时间**: 2025-01-09
> **目标**: 将 2500+ 行的巨型文件重构为模块化、可维护、可测试的架构

---

## 📊 当前架构分析

### 🔴 核心问题总览

| 文件 | 行数 | 主要问题 | 影响 |
|------|------|----------|------|
| `src/content/main.content.ts` | 2529 | 50+ 全局变量，所有职责混杂 | 极难维护和测试 |
| `src/popup/Popup.tsx` | 2796 | 17+ useState，40+ hooks，巨型组件 | 性能差，难以复用 |
| `src/background/index.worker.ts` | 864 | 消息处理、调度、空投监控混杂 | 职责不清晰 |

### ❌ 违反的设计原则

#### 1. **单一职责原则 (SRP)** - 严重违反
- `main.content.ts`: 包含订单管理、价格计算、DOM操作、监控、状态管理、国际化等
- `Popup.tsx`: UI渲染、数据获取、状态管理、业务逻辑全部混在一起

#### 2. **开闭原则 (OCP)** - 违反
- 添加新功能需要修改核心文件
- DOM 选择器硬编码，页面变更需要大量修改

#### 3. **依赖倒置原则 (DIP)** - 违反
- 直接依赖具体实现（DOM 结构、Chrome API）
- 缺少抽象层和接口定义

#### 4. **DRY 原则** - 部分违反
- 价格格式化、数值解析等逻辑重复出现
- 延迟函数、验证逻辑重复定义

---

## 🎯 重构目标与收益

### 📈 量化目标

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| `main.content.ts` 行数 | 2529 | ~200 | ↓ 92% |
| `Popup.tsx` 行数 | 2796 | ~300 | ↓ 89% |
| 模块数量 | 3 个主文件 | 50+ 专注模块 | +1600% |
| 测试覆盖率 | 0% | 80%+ | +80% |
| 新功能开发时间 | - | - | ↓ 50% |
| Bug 修复时间 | - | - | ↓ 60% |

### ✅ 质量提升

- **可维护性**: 每个模块少于 200 行，职责单一
- **可测试性**: 纯函数 + 依赖注入，易于单元测试
- **可扩展性**: 遵循开闭原则，新功能无需修改现有代码
- **可读性**: 清晰的分层架构，代码自文档化
- **类型安全**: 完整的 TypeScript 类型系统

---

## 🏛️ 新架构设计

### 📁 目录结构

```
src/
├── types/                          # 统一类型定义 [NEW]
│   ├── index.ts                    # 导出所有类型
│   ├── order.types.ts              # 订单相关类型
│   ├── price.types.ts              # 价格相关类型
│   ├── state.types.ts              # 状态相关类型
│   └── dom.types.ts                # DOM 相关类型
│
├── content/                        # Content Script 重构
│   ├── main.content.ts             # 入口文件 (2529 → ~200 行)
│   │
│   ├── domains/                    # 领域模块 [NEW]
│   │   ├── order/                  # 订单领域
│   │   │   ├── index.ts
│   │   │   ├── order-placer.ts     # 订单下单逻辑
│   │   │   ├── order-monitor.ts    # 订单监控
│   │   │   └── order-validator.ts  # 订单验证
│   │   │
│   │   ├── price/                  # 价格领域
│   │   │   ├── index.ts
│   │   │   ├── vwap-calculator.ts  # VWAP 计算
│   │   │   └── price-formatter.ts  # 价格格式化
│   │   │
│   │   ├── balance/                # 余额领域
│   │   │   ├── index.ts
│   │   │   └── balance-tracker.ts  # 余额追踪
│   │   │
│   │   └── history/                # 历史记录领域
│   │       ├── index.ts
│   │       ├── history-fetcher.ts  # 历史数据获取
│   │       └── history-merger.ts   # 数据合并
│   │
│   ├── services/                   # 服务层 [NEW]
│   │   ├── automation.service.ts   # 自动化服务
│   │   ├── monitoring.service.ts   # 监控服务
│   │   └── alert.service.ts        # 告警服务
│   │
│   ├── adapters/                   # 适配器层 [NEW]
│   │   ├── dom/
│   │   │   ├── selectors.adapter.ts    # 选择器适配
│   │   │   ├── form.adapter.ts         # 表单操作适配
│   │   │   └── panel.adapter.ts        # 面板交互适配
│   │   │
│   │   └── ui/
│   │       ├── alert-renderer.ts       # 告警渲染
│   │       └── sound-player.ts         # 音频播放
│   │
│   └── utils/                      # 工具函数
│       ├── delay.ts
│       ├── parser.ts
│       └── validator.ts
│
├── popup/                          # Popup 重构
│   ├── index.tsx                   # 入口文件
│   ├── Popup.tsx                   # 主组件 (2796 → ~300 行)
│   │
│   ├── components/                 # UI 组件 [NEW]
│   │   ├── common/
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   ├── StatCard.tsx
│   │   │   └── StatusBadge.tsx
│   │   │
│   │   ├── automation/
│   │   │   ├── AutomationControls.tsx  # 自动化控制面板
│   │   │   ├── PriceOffsetForm.tsx     # 价格偏移表单
│   │   │   └── PointsSettings.tsx      # 积分设置
│   │   │
│   │   ├── stats/
│   │   │   ├── AlphaPointsCard.tsx     # Alpha 积分卡片
│   │   │   ├── BalanceCard.tsx         # 余额卡片
│   │   │   └── SessionStats.tsx        # 会话统计
│   │   │
│   │   ├── tokens/
│   │   │   ├── StableCoinsList.tsx     # 稳定币列表
│   │   │   └── TokenInfo.tsx           # Token 信息
│   │   │
│   │   └── airdrops/
│   │       ├── AirdropList.tsx         # 空投列表
│   │       └── AirdropCard.tsx         # 空投卡片
│   │
│   ├── hooks/                      # 自定义 Hooks [NEW]
│   │   ├── useSchedulerState.ts    # 调度状态 Hook
│   │   ├── useTokenDirectory.ts    # Token 目录 Hook
│   │   ├── useActiveTab.ts         # 活动标签 Hook
│   │   ├── useStableCoins.ts       # 稳定币 Hook
│   │   ├── useAirdrops.ts          # 空投 Hook
│   │   ├── useOrderHistory.ts      # 订单历史 Hook
│   │   └── useI18n.ts              # 国际化 Hook
│   │
│   ├── services/                   # Popup 服务层 [NEW]
│   │   ├── token-directory.service.ts
│   │   ├── stability.service.ts
│   │   └── airdrop.service.ts
│   │
│   └── utils/                      # Popup 工具函数
│       ├── formatters.ts
│       └── validators.ts
│
├── background/                     # Background 重构
│   ├── index.worker.ts             # 入口文件 (简化)
│   │
│   ├── services/                   # 服务层 [NEW]
│   │   ├── scheduler.service.ts    # 调度服务
│   │   ├── airdrop.service.ts      # 空投监控服务
│   │   └── header-modifier.service.ts  # Header 修改服务
│   │
│   └── handlers/                   # 消息处理器 [NEW]
│       ├── message.handler.ts      # Runtime 消息处理
│       ├── alarm.handler.ts        # Alarm 处理
│       └── control.handler.ts      # 控制命令处理
│
├── shared/                         # 共享代码 [REORGANIZED]
│   ├── lib/
│   │   ├── storage.ts
│   │   ├── messages.ts
│   │   ├── tabs.ts
│   │   └── alphaPoints.ts
│   │
│   ├── config/
│   │   ├── defaults.ts
│   │   ├── selectors.ts
│   │   └── storageKey.ts
│   │
│   ├── i18n/
│   │   ├── config.ts
│   │   └── locales/
│   │       ├── en.json
│   │       └── zh-CN.json
│   │
│   └── utils/                      # 通用工具函数
│       ├── delay.ts
│       ├── parser.ts
│       ├── formatter.ts
│       └── validator.ts
│
└── __tests__/                      # 测试文件 [NEW]
    ├── unit/
    │   ├── domains/
    │   ├── services/
    │   └── utils/
    ├── integration/
    └── e2e/
```

---

## 🔄 分阶段重构计划

### 📅 总体时间线：14-21 天

---

### **阶段 1: 基础设施准备** (1-2 天)

#### 目标
- 创建类型系统基础
- 设置测试框架
- 准备新目录结构

#### 任务清单
- [ ] 创建 `src/types/` 目录和基础类型定义
  - [ ] `order.types.ts` - 订单相关类型
  - [ ] `price.types.ts` - 价格相关类型
  - [ ] `state.types.ts` - 状态相关类型
  - [ ] `dom.types.ts` - DOM 相关类型
- [ ] 配置 Vitest 测试框架
- [ ] 创建 `src/__tests__/` 测试目录结构
- [ ] 创建新的模块目录结构
- [ ] 设置 ESLint 和 TypeScript 严格模式

#### 验收标准
- ✅ 所有类型定义文件创建完成
- ✅ 测试框架可以运行基础测试
- ✅ 目录结构创建完成
- ✅ 类型检查通过

---

### **阶段 2: Content Script - 提取核心领域** (3-5 天)

#### 2.1 价格计算领域 (1 天)

**提取模块**:
```
src/content/domains/price/
├── vwap-calculator.ts      # VWAP 计算逻辑
├── price-formatter.ts      # 价格格式化
└── price-offset.ts         # 价格偏移计算
```

**从 main.content.ts 提取的函数**:
- `calculateVolumeWeightedAverage()` → `vwap-calculator.ts`
- `formatNumberFixedDecimals()` → `price-formatter.ts`
- `parseNumericValue()` → `price-formatter.ts`
- 价格偏移相关逻辑 → `price-offset.ts`

**测试要求**:
- 单元测试覆盖率 > 90%
- 边界条件测试（0值、极大值、精度等）

---

#### 2.2 订单管理领域 (2 天)

**提取模块**:
```
src/content/domains/order/
├── order-placer.ts         # 订单下单逻辑
├── order-monitor.ts        # 订单监控
├── order-validator.ts      # 订单验证
└── order-state-detector.ts # 订单状态检测
```

**从 main.content.ts 提取的函数**:
- `ensureLimitOrderPlaced()` → `order-placer.ts`
- `configureLimitOrder()` → `order-placer.ts`
- `checkPendingLimitOrders()` → `order-monitor.ts`
- `extractOpenLimitOrderKeys()` → `order-monitor.ts`
- `resolveLimitOrderState()` → `order-state-detector.ts`
- `detectLimitOrderState()` → `order-state-detector.ts`

**测试要求**:
- 模拟 DOM 环境测试
- 订单状态转换测试
- 错误处理测试

---

#### 2.3 余额管理领域 (0.5 天)

**提取模块**:
```
src/content/domains/balance/
└── balance-tracker.ts      # 余额追踪
```

**从 main.content.ts 提取的函数**:
- `extractAvailableUsdt()` → `balance-tracker.ts`
- `sendInitialBalanceUpdate()` → `balance-tracker.ts`

---

#### 2.4 历史记录领域 (1 天)

**提取模块**:
```
src/content/domains/history/
├── history-fetcher.ts      # 历史数据获取
├── history-merger.ts       # 数据合并
└── history-analyzer.ts     # 数据分析
```

**从 main.content.ts 提取的函数**:
- `performOrderHistoryRequest()` → `history-fetcher.ts`
- `fetchAllOrderHistoryPages()` → `history-fetcher.ts`
- `refreshOrderHistorySnapshotForAutomation()` → `history-fetcher.ts`

---

#### 2.5 适配器层实现 (1 天)

**创建模块**:
```
src/content/adapters/
├── dom/
│   ├── selectors.adapter.ts    # 选择器管理
│   ├── form.adapter.ts         # 表单操作
│   └── panel.adapter.ts        # 面板交互
└── ui/
    ├── alert-renderer.ts       # 告警渲染
    └── sound-player.ts         # 音频播放
```

**功能抽象**:
- DOM 选择器逻辑封装
- 表单操作抽象（价格输入、滑块等）
- 告警和音频抽象

---

### **阶段 3: Popup - 组件拆分与 Hook 提取** (4-6 天)

#### 3.1 提取自定义 Hooks (2 天)

**创建 Hooks**:
```typescript
// useSchedulerState.ts
export function useSchedulerState() {
  const [state, setState] = useState<SchedulerState | null>(null);

  const loadState = useCallback(async () => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    setState(result[STORAGE_KEY] ?? null);
  }, []);

  useEffect(() => {
    loadState();
    // 监听变化
  }, [loadState]);

  return { state, loadState, setState };
}

// useTokenDirectory.ts
export function useTokenDirectory() {
  const [tokenDirectory, setTokenDirectory] = useState<Record<string, TokenDirectoryEntry>>({});
  const [loading, setLoading] = useState(false);

  const fetchTokenDirectory = useCallback(async () => {
    setLoading(true);
    // 实现逻辑
    setLoading(false);
  }, []);

  return { tokenDirectory, loading, fetchTokenDirectory };
}

// useActiveTab.ts
export function useActiveTab() {
  const [activeTab, setActiveTab] = useState<ActiveTabContext>({...});

  const refreshActiveTab = useCallback(async () => {
    // 实现逻辑
  }, []);

  return { activeTab, refreshActiveTab };
}

// useStableCoins.ts
export function useStableCoins() {
  const [stableCoins, setStableCoins] = useState<StabilityItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStableCoins = useCallback(async () => {
    // 实现逻辑
  }, []);

  return { stableCoins, loading, fetchStableCoins };
}

// useAirdrops.ts
export function useAirdrops() {
  const [airdropToday, setAirdropToday] = useState<ProcessedAirdrop[]>([]);
  const [airdropForecast, setAirdropForecast] = useState<ProcessedAirdrop[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAirdrops = useCallback(async () => {
    // 实现逻辑
  }, []);

  return { airdropToday, airdropForecast, loading, fetchAirdrops };
}

// useOrderHistory.ts
export function useOrderHistory(tabId: number | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderHistory = useCallback(async () => {
    // 实现逻辑
  }, [tabId]);

  return { loading, error, fetchOrderHistory };
}
```

**优势**:
- 状态逻辑解耦
- 易于测试
- 可复用
- 代码更清晰

---

#### 3.2 拆分 UI 组件 (2-3 天)

**组件拆分方案**:

```typescript
// components/automation/AutomationControls.tsx
export function AutomationControls({ state, onStart, onStop, busy }) {
  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button onClick={onStart} disabled={busy}>
          {t('start')}
        </Button>
        <Button onClick={onStop} disabled={busy}>
          {t('stop')}
        </Button>
      </Space>
    </Card>
  );
}

// components/automation/PriceOffsetForm.tsx
export function PriceOffsetForm({
  mode,
  buyOffset,
  sellOffset,
  onModeChange,
  onBuyOffsetChange,
  onSellOffsetChange
}) {
  return (
    <Form>
      <Radio.Group value={mode} onChange={onModeChange}>
        <Radio value="sideways">{t('sideways')}</Radio>
        <Radio value="custom">{t('custom')}</Radio>
      </Radio.Group>
      {/* ... */}
    </Form>
  );
}

// components/stats/AlphaPointsCard.tsx
export function AlphaPointsCard({ points, nextThresholdDelta }) {
  return (
    <Card title={t('alphaPoints')}>
      <Statistic value={points} suffix="pts" />
      <Text type="secondary">
        {t('nextPoint')}: {nextThresholdDelta} USDT
      </Text>
    </Card>
  );
}

// components/stats/BalanceCard.tsx
export function BalanceCard({
  currentBalance,
  firstBalance,
  onReset,
  resetting
}) {
  const spent = firstBalance && currentBalance
    ? firstBalance - currentBalance
    : null;

  return (
    <Card>
      <Statistic
        title={t('currentBalance')}
        value={currentBalance}
        suffix="USDT"
      />
      {spent && (
        <Text type="secondary">
          {t('spent')}: {spent.toFixed(2)} USDT
        </Text>
      )}
      <Button onClick={onReset} loading={resetting}>
        {t('resetBalance')}
      </Button>
    </Card>
  );
}

// components/tokens/StableCoinsList.tsx
export function StableCoinsList({ coins, loading }) {
  if (loading) return <Spin />;

  return (
    <List
      dataSource={coins}
      renderItem={coin => (
        <List.Item>
          <Space>
            <Tag color="green">{coin.n}</Tag>
            <Text>{coin.p} USDT</Text>
            <Text type="secondary">
              {t('spread')}: {coin.spr.toFixed(2)}bp
            </Text>
          </Space>
        </List.Item>
      )}
    />
  );
}

// components/airdrops/AirdropCard.tsx
export function AirdropCard({ airdrop }) {
  return (
    <Card size="small">
      <Space direction="vertical">
        <Text strong>{airdrop.title}</Text>
        <Text type="secondary">{airdrop.date}</Text>
        <Tag color={airdrop.type === 'today' ? 'green' : 'blue'}>
          {t(airdrop.type)}
        </Tag>
      </Space>
    </Card>
  );
}
```

**重构后的 Popup.tsx** (~300 行):
```typescript
export function Popup(): React.ReactElement {
  const { t } = useTranslation();

  // 使用自定义 Hooks
  const { state, loadState } = useSchedulerState();
  const { tokenDirectory } = useTokenDirectory();
  const { activeTab, refreshActiveTab } = useActiveTab();
  const { stableCoins, loading: stabilityLoading } = useStableCoins();
  const { airdropToday, airdropForecast, loading: airdropLoading } = useAirdrops();
  const { fetchOrderHistory, loading: historyLoading } = useOrderHistory(activeTab.tabId);

  // 本地状态
  const [controlsBusy, setControlsBusy] = useState(false);
  const [priceOffsetMode, setPriceOffsetMode] = useState<PriceOffsetMode>('sideways');

  // 事件处理函数
  const handleStart = useCallback(async () => {
    setControlsBusy(true);
    try {
      await postRuntimeMessage({ type: 'CONTROL_START', payload: {...} });
    } finally {
      setControlsBusy(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    setControlsBusy(true);
    try {
      await postRuntimeMessage({ type: 'CONTROL_STOP' });
    } finally {
      setControlsBusy(false);
    }
  }, []);

  // 渲染
  return (
    <div className="popup-container">
      <Header />

      <AutomationControls
        state={state}
        onStart={handleStart}
        onStop={handleStop}
        busy={controlsBusy}
      />

      <PriceOffsetForm
        mode={priceOffsetMode}
        onModeChange={setPriceOffsetMode}
        {...}
      />

      <Row gutter={16}>
        <Col span={12}>
          <AlphaPointsCard {...} />
        </Col>
        <Col span={12}>
          <BalanceCard {...} />
        </Col>
      </Row>

      <StableCoinsList coins={stableCoins} loading={stabilityLoading} />

      <AirdropList
        today={airdropToday}
        forecast={airdropForecast}
        loading={airdropLoading}
      />

      <Footer />
    </div>
  );
}
```

**拆分收益**:
- Popup.tsx: 2796 行 → ~300 行 (89% 减少)
- 组件可复用、可测试
- 状态逻辑清晰
- 渲染性能优化

---

#### 3.3 提取服务层 (1 天)

**创建服务**:
```typescript
// services/token-directory.service.ts
export class TokenDirectoryService {
  async fetchTokenDirectory(): Promise<Record<string, TokenDirectoryEntry>> {
    // 实现逻辑
  }

  async getCachedDirectory(): Promise<Record<string, TokenDirectoryEntry> | null> {
    // 实现逻辑
  }

  async updateCache(directory: Record<string, TokenDirectoryEntry>): Promise<void> {
    // 实现逻辑
  }
}

// services/stability.service.ts
export class StabilityService {
  async fetchStableCoins(): Promise<StabilityItem[]> {
    // 实现逻辑
  }
}

// services/airdrop.service.ts
export class AirdropService {
  async fetchAirdrops(): Promise<{ today: ProcessedAirdrop[], forecast: ProcessedAirdrop[] }> {
    // 实现逻辑
  }
}
```

---

### **阶段 4: Background - 服务拆分** (2-3 天)

#### 4.1 拆分服务层 (1 天)

**创建服务**:
```typescript
// services/scheduler.service.ts
export class SchedulerService {
  async bootstrap(): Promise<void> {
    // 初始化调度器
  }

  async startAutomation(tokenAddress?: string, tabId?: number): Promise<void> {
    // 启动自动化
  }

  async stopAutomation(): Promise<void> {
    // 停止自动化
  }

  async runCycle(options?: RunOptions): Promise<void> {
    // 执行一次调度周期
  }
}

// services/airdrop.service.ts
export class AirdropMonitorService {
  startMonitoring(): void {
    // 启动空投监控
  }

  stopMonitoring(): void {
    // 停止空投监控
  }

  async fetchAndUpdateAirdrops(): Promise<void> {
    // 获取并更新空投数据
  }
}

// services/header-modifier.service.ts
export class HeaderModifierService {
  async registerRules(): Promise<void> {
    // 注册请求头修改规则
  }
}
```

---

#### 4.2 提取消息处理器 (1 天)

**创建处理器**:
```typescript
// handlers/message.handler.ts
export class MessageHandler {
  constructor(
    private schedulerService: SchedulerService,
    private airdropService: AirdropMonitorService
  ) {}

  handleMessage(message: RuntimeMessage, sender: MessageSender, sendResponse: Function): boolean {
    switch (message.type) {
      case 'CONTROL_START':
        return this.handleControlStart(message, sendResponse);
      case 'CONTROL_STOP':
        return this.handleControlStop(sendResponse);
      case 'BALANCE_UPDATE':
        return this.handleBalanceUpdate(message, sendResponse);
      case 'TASK_COMPLETE':
        return this.handleTaskComplete(message, sendResponse);
      case 'TASK_ERROR':
        return this.handleTaskError(message, sendResponse);
      case 'ORDER_HISTORY_SNAPSHOT':
        return this.handleOrderHistorySnapshot(message, sendResponse);
      default:
        return false;
    }
  }

  private handleControlStart(message, sendResponse): boolean {
    // 实现逻辑
  }

  // ... 其他处理函数
}

// handlers/alarm.handler.ts
export class AlarmHandler {
  constructor(private schedulerService: SchedulerService) {}

  handleAlarm(alarm: chrome.alarms.Alarm): void {
    if (alarm.name === 'automation') {
      void this.schedulerService.runCycle();
    }
  }
}
```

---

#### 4.3 重构入口文件 (0.5 天)

**简化后的 index.worker.ts**:
```typescript
import { SchedulerService } from './services/scheduler.service';
import { AirdropMonitorService } from './services/airdrop.service';
import { HeaderModifierService } from './services/header-modifier.service';
import { MessageHandler } from './handlers/message.handler';
import { AlarmHandler } from './handlers/alarm.handler';

// 初始化服务
const schedulerService = new SchedulerService();
const airdropService = new AirdropMonitorService();
const headerModifier = new HeaderModifierService();

// 初始化处理器
const messageHandler = new MessageHandler(schedulerService, airdropService);
const alarmHandler = new AlarmHandler(schedulerService);

// 注册监听器
chrome.runtime.onMessage.addListener(messageHandler.handleMessage.bind(messageHandler));
chrome.alarms.onAlarm.addListener(alarmHandler.handleAlarm.bind(alarmHandler));

chrome.runtime.onInstalled.addListener(() => {
  void schedulerService.bootstrap();
  airdropService.startMonitoring();
  void headerModifier.registerRules();
});

chrome.runtime.onStartup.addListener(() => {
  void schedulerService.bootstrap();
  airdropService.startMonitoring();
});
```

**收益**:
- index.worker.ts: 864 行 → ~50 行 (94% 减少)
- 职责清晰
- 易于测试
- 易于扩展

---

### **阶段 5: Content Script 主入口重构** (1-2 天)

#### 目标
- 简化 `main.content.ts`
- 组装各领域模块
- 实现依赖注入

**重构后的 main.content.ts** (~200 行):
```typescript
import { AutomationService } from './services/automation.service';
import { MonitoringService } from './services/monitoring.service';
import { AlertService } from './services/alert.service';
import { OrderPlacer } from './domains/order/order-placer';
import { VWAPCalculator } from './domains/price/vwap-calculator';
import { BalanceTracker } from './domains/balance/balance-tracker';
import { HistoryFetcher } from './domains/history/history-fetcher';
import { SelectorsAdapter } from './adapters/dom/selectors.adapter';
import { FormAdapter } from './adapters/dom/form.adapter';

// 初始化适配器
const selectorsAdapter = new SelectorsAdapter();
const formAdapter = new FormAdapter(selectorsAdapter);

// 初始化领域模块
const vwapCalculator = new VWAPCalculator();
const balanceTracker = new BalanceTracker(formAdapter);
const historyFetcher = new HistoryFetcher();
const orderPlacer = new OrderPlacer(formAdapter, selectorsAdapter);

// 初始化服务
const alertService = new AlertService();
const monitoringService = new MonitoringService(orderPlacer, alertService);
const automationService = new AutomationService(
  orderPlacer,
  vwapCalculator,
  balanceTracker,
  historyFetcher,
  monitoringService
);

// 注册消息监听
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'RUN_TASK':
      void automationService.runTask().then(() => sendResponse({ acknowledged: true }));
      return true;
    case 'RUN_TASK_ONCE':
      void automationService.runTaskOnce().then(() => sendResponse({ acknowledged: true }));
      return true;
    case 'REQUEST_TOKEN_SYMBOL':
      const symbol = selectorsAdapter.extractTokenSymbol();
      sendResponse({ acknowledged: !!symbol, tokenSymbol: symbol });
      return true;
    case 'REQUEST_CURRENT_BALANCE':
      void balanceTracker.getCurrentBalance().then(balance =>
        sendResponse({ acknowledged: balance !== null, currentBalance: balance })
      );
      return true;
    case 'FETCH_ORDER_HISTORY':
      void historyFetcher.fetchAllPages().then(response => sendResponse(response));
      return true;
    default:
      return false;
  }
});

// 初始化
automationService.initialize();
```

**收益**:
- main.content.ts: 2529 行 → ~200 行 (92% 减少)
- 依赖关系清晰
- 易于测试和模拟
- 符合 SOLID 原则

---

### **阶段 6: 测试与验证** (2-3 天)

#### 6.1 单元测试 (1 天)

**测试覆盖**:
- 领域模块测试 (90%+ 覆盖率)
- 服务层测试 (80%+ 覆盖率)
- 工具函数测试 (95%+ 覆盖率)

**示例测试**:
```typescript
// __tests__/unit/domains/price/vwap-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { VWAPCalculator } from '@/content/domains/price/vwap-calculator';

describe('VWAPCalculator', () => {
  const calculator = new VWAPCalculator();

  it('should calculate VWAP correctly', () => {
    const trades = [
      { price: 1.0, quantity: 10, time: '10:00' },
      { price: 1.1, quantity: 20, time: '10:01' },
      { price: 0.9, quantity: 30, time: '10:02' },
    ];

    const vwap = calculator.calculate(trades);
    expect(vwap).toBeCloseTo(0.983, 3);
  });

  it('should return null for empty trades', () => {
    expect(calculator.calculate([])).toBeNull();
  });

  it('should handle invalid data', () => {
    const trades = [
      { price: NaN, quantity: 10, time: '10:00' },
    ];
    expect(calculator.calculate(trades)).toBeNull();
  });
});
```

---

#### 6.2 集成测试 (1 天)

**测试场景**:
- Content Script 与 Background 通信
- Popup 与 Background 通信
- 订单流程端到端测试
- 自动化流程测试

---

#### 6.3 功能验证 (1 天)

**验证清单**:
- [ ] 自动化启动/停止功能正常
- [ ] 订单下单功能正常
- [ ] 订单监控功能正常
- [ ] 告警功能正常
- [ ] Alpha 积分计算正确
- [ ] 余额追踪正确
- [ ] Token 目录加载正常
- [ ] 稳定币列表显示正常
- [ ] 空投提醒功能正常
- [ ] 国际化切换正常
- [ ] 所有 UI 交互正常

---

### **阶段 7: 文档与清理** (1 天)

#### 任务清单
- [ ] 更新 README.md
- [ ] 创建架构文档 (ARCHITECTURE.md)
- [ ] 添加模块使用说明
- [ ] 完善代码注释
- [ ] 删除旧代码注释
- [ ] 清理未使用的导入
- [ ] 优化构建配置

---

## 📊 重构收益总结

### 代码质量

| 指标 | 重构前 | 重构后 | 改善 |
|------|--------|--------|------|
| 最大文件行数 | 2796 | ~300 | ↓ 89% |
| 平均文件行数 | ~1400 | ~150 | ↓ 89% |
| 函数平均长度 | ~50 行 | ~20 行 | ↓ 60% |
| 圈复杂度 | 高 | 低 | - |
| 全局变量数 | 50+ | 0 | ↓ 100% |
| 模块数量 | 3 个 | 50+ 个 | +1600% |

### 开发效率

- **新功能开发**: 减少 50% 时间
- **Bug 修复**: 减少 60% 时间
- **代码审查**: 提升 70% 效率
- **测试编写**: 提升 80% 效率

### 维护性

- **可读性**: ⭐⭐⭐⭐⭐ (从 ⭐⭐)
- **可测试性**: ⭐⭐⭐⭐⭐ (从 ⭐)
- **可扩展性**: ⭐⭐⭐⭐⭐ (从 ⭐⭐)
- **可维护性**: ⭐⭐⭐⭐⭐ (从 ⭐⭐)

---

## 🚀 开始重构

### 前置条件检查

- [ ] 已创建 `refactor/architecture-optimization` 分支
- [ ] 已备份当前代码
- [ ] 已确保所有现有功能正常工作
- [ ] 团队成员已了解重构计划

### 执行步骤

1. **切换到重构分支**
   ```bash
   git checkout refactor/architecture-optimization
   ```

2. **开始阶段 1: 基础设施准备**
   - 按照任务清单逐项完成
   - 每完成一个任务提交一次代码

3. **逐步推进到后续阶段**
   - 严格按照计划执行
   - 保持频繁的代码提交
   - 每个阶段完成后进行代码审查

4. **持续测试**
   - 每完成一个模块立即编写测试
   - 运行测试确保功能正常
   - 保持高测试覆盖率

5. **定期合并主分支**
   ```bash
   git merge main
   ```
   解决冲突，保持分支与主分支同步

---

## 📝 注意事项

### ⚠️ 风险管理

1. **功能回归风险**
   - 缓解措施: 完整的测试覆盖
   - 每个模块重构后立即测试

2. **时间延期风险**
   - 缓解措施: 分阶段实施，可暂停
   - 每个阶段独立完成

3. **团队协作风险**
   - 缓解措施: 清晰的文档和代码审查
   - 定期同步进度

### ✅ 最佳实践

1. **小步快跑**
   - 每次重构一个小模块
   - 频繁提交代码
   - 保持代码始终可运行

2. **测试驱动**
   - 先写测试再重构
   - 保持测试通过
   - 逐步提升覆盖率

3. **持续集成**
   - 每次提交运行测试
   - 及时发现问题
   - 快速修复

4. **代码审查**
   - 每个阶段完成后审查
   - 确保质量
   - 及时反馈

---

## 🎓 学习资源

### 设计原则

- [SOLID 原则详解](https://en.wikipedia.org/wiki/SOLID)
- [领域驱动设计 (DDD)](https://martinfowler.com/tags/domain%20driven%20design.html)
- [六边形架构 (Hexagonal Architecture)](https://alistair.cockburn.us/hexagonal-architecture/)

### TypeScript

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

### React

- [React Hooks](https://react.dev/reference/react)
- [Custom Hooks Pattern](https://react.dev/learn/reusing-logic-with-custom-hooks)

### 测试

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)

---

## 📞 联系与支持

如有任何问题或建议，请：

1. 在 GitHub 上创建 Issue
2. 联系项目维护者
3. 参与代码审查讨论

---

**最后更新**: 2025-01-09
**维护者**: DDDD Alpha Extension Team
**版本**: 1.0.0
