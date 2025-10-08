# P2 架构深度优化计划

**制定时间**: 2025-10-08
**状态**: 📋 规划中
**优先级**: P2 (在P0/P1基础上的深度优化)

---

## 🎯 优化目标

### 核心目标
1. **main.content.ts**: 2534行 → <800行 (减少约1700行)
2. **Popup.tsx**: ~3000行 → <500行 (减少约2500行)
3. **删除旧备份代码**: 减少约500-600行
4. **提升代码可维护性**: 所有模块 <500行

### 成功指标
- ✅ 单文件 <500行 (理想)
- ⚠️ 单文件 <1000行 (可接受)
- ❌ 单文件 >1000行 (需重构)

---

## 📋 第一阶段: main.content.ts 深度拆分

### 1.1 创建自动化引擎模块

**文件**: `src/content/automation/automationEngine.ts` (预估450行)

**功能**: 统一管理自动化调度和执行流程

**迁移内容**:
```typescript
export class AutomationEngine {
  // 核心方法
  async runEvaluationCycle(scheduled: boolean, options?: TaskExecutionOptions)
  async executePrimaryTask(options?: TaskExecutionOptions)

  // 调度管理
  private async ensurePolling()
  private scheduleNextAutomationCycle(delayMs?: number)
  teardownPolling()

  // 状态管理
  private evaluationInProgress: boolean
  private automationLoopActive: boolean
  private nextEvaluationTimeoutId?: number
}
```

**迁移函数列表**:
- `runEvaluationCycle()` (main.content.ts:629)
- `executePrimaryTask()` (main.content.ts:702)
- `ensurePolling()` (main.content.ts:599)
- `scheduleNextAutomationCycle()`
- `teardownPolling()`

**依赖**:
- VWAPCalculator
- OrderPlacer
- OrderMonitor
- DOMController
- postRuntimeMessage

---

### 1.2 创建订单历史管理模块

**文件**: `src/content/data/orderHistoryManager.ts` (预估350行)

**功能**: 处理订单历史的获取、合并和快照

**API设计**:
```typescript
export class OrderHistoryManager {
  constructor(private csrfTokenProvider: () => string | null) {}

  async performRequest(url: string): Promise<OrderHistoryResponse>
  async fetchAllPages(now: Date): Promise<BinanceOrderHistoryResponse[]>
  async refreshSnapshot(): Promise<OrderHistorySnapshotPayload | null>

  private mergeData(responses: BinanceOrderHistoryResponse[])
  private summarizeData(items: OrderHistoryItem[])
}
```

**迁移函数**:
- `performOrderHistoryRequest()` (main.content.ts:164)
- `fetchAllOrderHistoryPages()` (main.content.ts:237)
- `refreshOrderHistorySnapshotForAutomation()` (main.content.ts:287)
- `mergeOrderHistoryData()` (from lib/orderHistory.ts)
- `summarizeOrderHistoryData()` (from lib/orderHistory.ts)

---

### 1.3 创建Token目录管理模块

**文件**: `src/content/data/tokenDirectoryManager.ts` (预估250行)

**功能**: 管理Token倍数映射和缓存

**API设计**:
```typescript
export class TokenDirectoryManager {
  async getAlphaMultiplierMap(): Promise<Record<string, number>>
  lookupMultiplier(alphaId: string): number
  invalidateCache(): void

  private extractDirectory(value: unknown): Record<string, TokenDirectoryRecord> | null
  private cachedMap: Record<string, number> | null
  private cachedTimestamp: number
}
```

**迁移函数**:
- `getAlphaMultiplierMap()` (main.content.ts:107)
- `lookupAlphaMultiplier()` (main.content.ts:151)
- `invalidateTokenDirectoryCache()` (main.content.ts:87)
- `extractTokenDirectory()` (main.content.ts:92)

**迁移状态**:
- `cachedAlphaMultiplierMap`
- `cachedAlphaMultiplierTimestamp`
- `MULTIPLIER_CACHE_DURATION_MS`

---

### 1.4 创建消息路由模块

**文件**: `src/content/messaging/messageRouter.ts` (预估250行)

**功能**: 统一处理Chrome消息传递

**API设计**:
```typescript
export class MessageRouter {
  constructor(
    private orderHistoryManager: OrderHistoryManager,
    private domController: DOMController,
    private automationHandler: () => Promise<void>,
    private manualRunHandler: () => Promise<void>
  ) {}

  setupListeners(): void

  private handleFetchOrderHistory(message, sendResponse): boolean
  private handleRequestTokenSymbol(sendResponse): boolean
  private handleRequestCurrentBalance(sendResponse): boolean
  private handleRunTask(sendResponse): boolean
  private handleRunTaskOnce(sendResponse): boolean

  async dispatchRuntimeMessage(message: RuntimeMessage): Promise<void>
}
```

**迁移内容**:
- `chrome.runtime.onMessage.addListener` 的所有处理器
- `dispatchRuntimeMessage()` (main.content.ts:867)

---

### 1.5 创建自动化状态管理模块

**文件**: `src/content/state/automationStateManager.ts` (预估180行)

**功能**: 集中管理所有自动化相关状态

**API设计**:
```typescript
export class AutomationStateManager {
  // 状态属性
  enabled: boolean
  priceOffsetPercent: number
  buyPriceOffset: number
  sellPriceOffset: number
  pointsFactor: number
  pointsTarget: number
  intervalMode: IntervalMode

  // 方法
  initializeStateWatcher(): void
  applyState(state: AutomationState): void

  private syncFromStorage(): Promise<void>
  private stateWatcherInitialized: boolean
}
```

**迁移内容**:
- `initializeAutomationStateWatcher()`
- `applyAutomationState()`
- 所有状态变量的集中管理

**迁移状态变量**:
- `automationEnabled`
- `priceOffsetPercent`
- `buyPriceOffset`
- `sellPriceOffset`
- `pointsFactor`
- `pointsTarget`
- `intervalMode`
- `automationStateWatcherInitialized`
- `loginErrorDispatched`
- `runtimeUnavailable`

---

## 📋 第二阶段: 删除旧备份代码

### 待删除内容清单

**旧订单下单函数** (~500行):
- `_ensureLimitOrderPlaced()` (1044-1124)
- `ensureOpenOrdersTabs()` (1126-1142)
- `getTabByLabel()` (1144-1156)
- `resolveLimitOrderState()` (1158-1173)
- `detectLimitOrderState()` (1175-1200)
- `getLimitOrdersContainer()` (1202-1259)
- `getOpenOrdersRoot()` (1261-1264)

**旧订单监控函数** (~200行):
- `_startPendingOrderMonitor()` (1267-1282)
- `_checkPendingLimitOrders()` (1285-1365)
- `_extractOpenLimitOrderKeys()` (1373-1413)
- `_getOrderRowSignature()` (1416-1431)
- `_getNormalizedOrderRowText()` (1434-1441)
- `_detectLimitOrderSide()` (1444-1475)

**旧警告函数** (~250行):
- `playNormalWarningSound()`
- `showPendingOrderWarning()`
- `playUrgentAlertSound()`
- `showUrgentSellAlert()`

**相关常量** (~30行):
- `ORDER_PLACEMENT_COOLDOWN_MS`
- `LIMIT_STATE_TIMEOUT_MS`
- `LIMIT_STATE_POLL_INTERVAL_MS`
- `PENDING_ORDER_WARNING_DELAY_MS`
- `PENDING_SELL_ORDER_ALERT_DELAY_MS`
- `PENDING_ORDER_CHECK_INTERVAL_MS`
- `PENDING_ORDER_WARNING_ELEMENT_ID`
- `URGENT_SELL_ALERT_ELEMENT_ID`

**相关状态** (~10行):
- `lastOrderPlacedAt`
- `pendingBuyOrderMonitorId`
- `monitoringEnabled`
- `pendingOrderTimestamps`
- `pending5SecWarningsShown`
- `pending10SecWarningsShown`

**总计可删除**: 约990行

---

## 📋 第三阶段: Popup.tsx 拆分 (可选)

### 3.1 提取状态管理Hooks

**文件**: `src/popup/hooks/useSchedulerState.ts` (预估100行)
```typescript
export function useSchedulerState() {
  const [state, setState] = useState<SchedulerState | null>(null);

  useEffect(() => {
    // 订阅storage变化
  }, []);

  return { state, refreshState };
}
```

**文件**: `src/popup/hooks/useOrderHistory.ts` (预估120行)
```typescript
export function useOrderHistory(tabId: number | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    // 请求订单历史
  }, [tabId]);

  return { loading, error, fetchHistory };
}
```

**文件**: `src/popup/hooks/useActiveTab.ts` (预估80行)
```typescript
export function useActiveTab() {
  const [tab, setTab] = useState<TabInfo | null>(null);

  useEffect(() => {
    // 获取当前活动标签
  }, []);

  return { tab };
}
```

### 3.2 拆分UI组件

**文件**: `src/popup/components/StatusCard.tsx` (预估120行)
- 显示当前状态、余额、积分等信息

**文件**: `src/popup/components/SettingsPanel.tsx` (预估150行)
- 参数配置表单

**文件**: `src/popup/components/OrderHistoryPanel.tsx` (预估120行)
- 订单历史展示

**文件**: `src/popup/components/ControlButtons.tsx` (预估100行)
- 启动/停止按钮

**文件**: `src/popup/components/AirdropInfo.tsx` (预估110行)
- 空投信息展示

### 3.3 简化主组件

**文件**: `src/popup/Popup.tsx` (目标<500行)
```typescript
export default function Popup() {
  const { state } = useSchedulerState();
  const { tab } = useActiveTab();
  const orderHistory = useOrderHistory(tab?.id);

  return (
    <div>
      <StatusCard state={state} tab={tab} />
      <ControlButtons state={state} tab={tab} />
      <SettingsPanel />
      <OrderHistoryPanel {...orderHistory} />
      <AirdropInfo />
    </div>
  );
}
```

---

## ⏱️ 实施时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| **第一阶段** | main.content.ts拆分 | **6-8小时** |
| 1.1 | AutomationEngine | 2h |
| 1.2 | OrderHistoryManager | 1.5h |
| 1.3 | TokenDirectoryManager | 1h |
| 1.4 | MessageRouter | 1.5h |
| 1.5 | AutomationStateManager | 1h |
| **第二阶段** | 删除旧代码 | **1-2小时** |
| 2.1 | 删除旧函数 | 1h |
| 2.2 | 验证构建 | 0.5h |
| **第三阶段** | Popup.tsx拆分(可选) | **4-6小时** |
| 3.1 | 提取Hooks | 2h |
| 3.2 | 拆分Components | 2h |
| 3.3 | 重构主组件 | 1h |
| **总计** | - | **11-16小时** |

---

## 📊 预期成果

### 代码行数变化

| 文件/模块 | 当前 | 优化后 | 变化 |
|-----------|------|--------|------|
| **Content Script** | | | |
| main.content.ts | 2534行 | ~750行 | -1784行 |
| AutomationEngine | 0 | 450行 | +450行 |
| OrderHistoryManager | 0 | 350行 | +350行 |
| TokenDirectoryManager | 0 | 250行 | +250行 |
| MessageRouter | 0 | 250行 | +250行 |
| AutomationStateManager | 0 | 180行 | +180行 |
| **Popup** | | | |
| Popup.tsx | ~3000行 | ~450行 | -2550行 |
| Hooks (3个) | 0 | 300行 | +300行 |
| Components (5个) | 0 | 600行 | +600行 |
| **总计** | ~5534行 | ~3580行 | **-1954行** |

### 质量提升

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 最大文件行数 | 3000行 | <500行 | ⬇️ 83% |
| 平均文件行数 | ~1500行 | ~300行 | ⬇️ 80% |
| 模块数量 | 11个 | 24个 | ⬆️ 118% |
| 代码复用率 | 中 | 高 | ⬆️⬆️ |
| 可测试性 | 低 | 高 | ⬆️⬆️⬆️ |
| 可维护性 | 中 | 高 | ⬆️⬆️⬆️ |

---

## 🚀 开始实施

### 准备工作
1. ✅ 确认当前代码可正常构建
2. ✅ 确认manifest.json配置正确
3. ✅ 备份当前代码

### 实施顺序
1. **优先**: 第一阶段 + 第二阶段 (main.content.ts优化)
2. **可选**: 第三阶段 (Popup.tsx优化)

### 验收标准
- [ ] 所有模块文件 <500行
- [ ] TypeScript编译通过
- [ ] Biome lint通过
- [ ] Vite构建成功
- [ ] 功能测试通过
- [ ] 无性能退化

---

**文档版本**: v1.0
**最后更新**: 2025-10-08
