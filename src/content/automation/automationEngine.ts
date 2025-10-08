/**
 * 自动化引擎模块
 * 负责管理自动化调度、执行流程和状态控制
 */
import {
  FAST_MODE_MAX_DELAY,
  FAST_MODE_MIN_DELAY,
  type IntervalMode,
  MAX_SUCCESSFUL_TRADES,
  MEDIUM_MODE_MAX_DELAY,
  MEDIUM_MODE_MIN_DELAY,
  SUCCESSFUL_TRADES_LIMIT_MESSAGE,
} from '../../config/defaults.js';
import { SELECTORS } from '../../config/selectors.js';
import {
  type OrderHistorySnapshotPayload,
  postRuntimeMessage,
  type RuntimeMessage,
  type TaskResultMeta,
} from '../../lib/messages.js';
import type { OrderPlacementResult, OrderPlacer } from './orderPlacer.js';
import type { VWAPCalculator } from './vwapCalculator.js';

/**
 * 任务执行选项
 */
export interface TaskExecutionOptions {
  placeOrder?: boolean;
}

/**
 * 评估选项
 */
interface EvaluationOptions {
  placeOrder?: boolean;
}

/**
 * 交易历史样本
 */
interface TradeHistorySample {
  time: string;
  price: number;
  quantity: number;
}

/**
 * 自动化引擎类
 * 统一管理自动化调度和执行流程
 */
export class AutomationEngine {
  private evaluationInProgress = false;
  private automationLoopActive = false;
  private nextEvaluationTimeoutId?: number;
  private loginErrorDispatched = false;
  private runtimeUnavailable = false;

  // 自动化参数
  private automationEnabled = false;
  private priceOffsetPercent: number;
  private buyPriceOffset: number;
  private sellPriceOffset: number;
  private pointsFactor: number;
  private pointsTarget: number;
  private intervalMode: IntervalMode;

  constructor(
    private vwapCalculator: VWAPCalculator,
    private orderPlacer: OrderPlacer,
    private extractTokenSymbol: () => string | null,
    private findTradeHistoryPanel: () => HTMLElement | null,
    private extractTradeHistorySamples: (panel: HTMLElement) => TradeHistorySample[],
    private refreshOrderHistorySnapshot: () => Promise<OrderHistorySnapshotPayload | null>,
    private getTradingFormPanel: () => HTMLElement | null,
    private extractAvailableUsdt: (panel: HTMLElement) => Promise<number | null>,
    config: {
      priceOffsetPercent: number;
      buyPriceOffset: number;
      sellPriceOffset: number;
      pointsFactor: number;
      pointsTarget: number;
      intervalMode: IntervalMode;
    },
  ) {
    this.priceOffsetPercent = config.priceOffsetPercent;
    this.buyPriceOffset = config.buyPriceOffset;
    this.sellPriceOffset = config.sellPriceOffset;
    this.pointsFactor = config.pointsFactor;
    this.pointsTarget = config.pointsTarget;
    this.intervalMode = config.intervalMode;
  }

  /**
   * 启用自动化
   */
  enableAutomation(): void {
    this.automationEnabled = true;
  }

  /**
   * 禁用自动化
   */
  disableAutomation(): void {
    this.automationEnabled = false;
    this.teardownPolling();
  }

  /**
   * 检查自动化是否启用
   */
  isAutomationEnabled(): boolean {
    return this.automationEnabled;
  }

  /**
   * 更新配置
   */
  updateConfig(
    config: Partial<{
      priceOffsetPercent: number;
      buyPriceOffset: number;
      sellPriceOffset: number;
      pointsFactor: number;
      pointsTarget: number;
      intervalMode: IntervalMode;
    }>,
  ): void {
    if (config.priceOffsetPercent !== undefined) {
      this.priceOffsetPercent = config.priceOffsetPercent;
    }
    if (config.buyPriceOffset !== undefined) {
      this.buyPriceOffset = config.buyPriceOffset;
    }
    if (config.sellPriceOffset !== undefined) {
      this.sellPriceOffset = config.sellPriceOffset;
    }
    if (config.pointsFactor !== undefined) {
      this.pointsFactor = config.pointsFactor;
    }
    if (config.pointsTarget !== undefined) {
      this.pointsTarget = config.pointsTarget;
    }
    if (config.intervalMode !== undefined) {
      this.intervalMode = config.intervalMode;
      this.orderPlacer.setIntervalMode(config.intervalMode);
    }
  }

  /**
   * 处理状态变化
   */
  async handleStateChange(): Promise<void> {
    if (this.checkForLoginPrompt()) {
      if (!this.loginErrorDispatched) {
        console.warn('[dddd-alpah-extension] Login prompt detected');
        await this.dispatchRuntimeMessage({
          type: 'TASK_ERROR',
          payload: { message: '请先登录币安' },
        });
        this.loginErrorDispatched = true;
      }
      return;
    }

    this.loginErrorDispatched = false;
    if (!this.automationEnabled) {
      console.log('[dddd-alpah-extension] Automation disabled, tearing down polling');
      this.teardownPolling();
      return;
    }

    await this.ensurePolling();
  }

  /**
   * 手动运行一次
   */
  async runManually(): Promise<void> {
    if (this.evaluationInProgress) {
      return;
    }

    await this.runEvaluationCycle(false, { placeOrder: false });
  }

  /**
   * 确保轮询正在运行
   */
  private async ensurePolling(): Promise<void> {
    if (!this.isExtensionContextValid()) {
      console.warn('[dddd-alpah-extension] Extension context invalid, skipping evaluation');
      this.teardownPolling();
      return;
    }

    if (!this.automationEnabled) {
      console.log('[dddd-alpah-extension] Automation not enabled, skipping evaluation');
      return;
    }

    if (this.evaluationInProgress || this.nextEvaluationTimeoutId !== undefined) {
      return;
    }

    if (!this.automationLoopActive) {
      this.scheduleNextAutomationCycle(0);
      return;
    }

    this.scheduleNextAutomationCycle();
  }

  /**
   * 运行评估周期
   */
  async runEvaluationCycle(
    requireAutomationEnabled = true,
    options: EvaluationOptions = {},
  ): Promise<void> {
    if (!this.isExtensionContextValid()) {
      console.warn('[dddd-alpah-extension] Extension context invalid in evaluation cycle');
      this.teardownPolling();
      return;
    }

    if (this.evaluationInProgress) {
      console.log('[dddd-alpah-extension] Evaluation already in progress, skipping');
      return;
    }

    this.evaluationInProgress = true;
    console.log(
      '[dddd-alpah-extension] Starting evaluation cycle, placeOrder:',
      options.placeOrder !== false,
    );

    try {
      const placeOrder = options.placeOrder !== false;

      if (requireAutomationEnabled && !this.automationEnabled) {
        console.log('[dddd-alpah-extension] Automation disabled during evaluation, tearing down');
        this.teardownPolling();
        return;
      }

      if (this.checkForLoginPrompt()) {
        if (!this.loginErrorDispatched) {
          console.warn('[dddd-alpah-extension] Login prompt detected during evaluation');
          await this.dispatchRuntimeMessage({
            type: 'TASK_ERROR',
            payload: { message: '请先登录币安' },
          });
          this.loginErrorDispatched = true;
        }
        return;
      }

      this.loginErrorDispatched = false;

      const result = await this.executePrimaryTask({ placeOrder });
      console.log('[dddd-alpah-extension] Task completed:', result.success, result.details);
      await this.dispatchRuntimeMessage({
        type: 'TASK_COMPLETE',
        payload: result,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error('[dddd-alpah-extension] Evaluation cycle error:', messageText);
      await this.dispatchRuntimeMessage({
        type: 'TASK_ERROR',
        payload: { message: messageText },
      });
    } finally {
      this.evaluationInProgress = false;
    }
  }

  /**
   * 执行主要任务
   */
  private async executePrimaryTask(
    options: TaskExecutionOptions = {},
  ): Promise<{ success: boolean; details?: string; meta?: TaskResultMeta }> {
    console.log('[dddd-alpah-extension] executePrimaryTask started');

    const panel = this.findTradeHistoryPanel();
    if (!panel) {
      console.error('[dddd-alpah-extension] Trade history panel not found');
      return {
        success: false,
        details: 'Unable to locate limit trade history panel.',
      };
    }

    const trades = this.extractTradeHistorySamples(panel);
    console.log('[dddd-alpah-extension] Extracted trades:', trades.length);
    if (!trades.length) {
      return { success: false, details: 'No limit trade entries detected.' };
    }

    const tokenSymbol = this.extractTokenSymbol();
    console.log('[dddd-alpah-extension] Token symbol:', tokenSymbol);

    const averagePrice = this.vwapCalculator.calculate(trades);
    if (averagePrice === null) {
      console.error('[dddd-alpah-extension] Failed to calculate VWAP');
      return { success: false, details: 'Failed to compute average price.' };
    }

    console.log('[dddd-alpah-extension] Calculated VWAP:', averagePrice);

    const tradeCount = trades.length;
    const precision = averagePrice < 1 ? 8 : 6;
    const formattedAverage = averagePrice.toFixed(precision);
    const detailParts = [`VWAP across ${tradeCount} trades: ${formattedAverage}`];

    let shouldPlaceOrder = options.placeOrder !== false;
    let latestOrderHistorySnapshot: OrderHistorySnapshotPayload | null = null;
    let orderResult: OrderPlacementResult | undefined;
    let currentBalanceSnapshot: number | undefined;

    // 积分检查逻辑
    if (shouldPlaceOrder) {
      try {
        latestOrderHistorySnapshot = await this.refreshOrderHistorySnapshot();

        if (latestOrderHistorySnapshot) {
          if (latestOrderHistorySnapshot.buyOrderCount >= MAX_SUCCESSFUL_TRADES) {
            detailParts.push(SUCCESSFUL_TRADES_LIMIT_MESSAGE);
            shouldPlaceOrder = false;
          } else if (latestOrderHistorySnapshot.alphaPoints >= this.pointsTarget) {
            detailParts.push(
              `Points target reached (${latestOrderHistorySnapshot.alphaPoints} ≥ ${this.pointsTarget}). Order placement skipped.`,
            );
            shouldPlaceOrder = false;
          }
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        console.warn(
          '[dddd-alpah-extension] Failed to refresh order history snapshot:',
          messageText,
        );
      }
    }

    // 下单逻辑
    if (shouldPlaceOrder) {
      try {
        this.orderPlacer.setIntervalMode(this.intervalMode);
        this.orderPlacer.enableMonitoring();
        orderResult = await this.orderPlacer.ensureLimitOrderPlaced({
          price: averagePrice,
          priceOffsetPercent: this.priceOffsetPercent,
          buyPriceOffset: this.buyPriceOffset,
          sellPriceOffset: this.sellPriceOffset,
        });

        if (orderResult.status === 'placed') {
          detailParts.push(`订单已下达: ${orderResult.buyVolume?.toFixed(2) ?? 'N/A'} USDT`);
        } else if (orderResult.status === 'skipped') {
          detailParts.push(`订单跳过: ${orderResult.reason ?? 'Unknown'}`);
        } else if (orderResult.status === 'cooldown') {
          detailParts.push(`冷却中: ${orderResult.reason ?? 'Unknown'}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[dddd-alpah-extension] Order placement error:', message);
        detailParts.push(`下单失败: ${message}`);
      }
    }

    const balancePanel = this.getTradingFormPanel();
    if (balancePanel) {
      const balanceValue = await this.extractAvailableUsdt(balancePanel);
      if (balanceValue !== null && Number.isFinite(balanceValue)) {
        currentBalanceSnapshot = balanceValue;
      }
    }

    console.log('[dddd-alpah-extension] Limit VWAP', {
      averagePrice,
      formattedAverage,
      tokenSymbol: tokenSymbol ?? null,
      orderStatus: shouldPlaceOrder ? (orderResult?.status ?? 'skipped') : 'manual-skip',
      orderReason: shouldPlaceOrder ? (orderResult?.reason ?? null) : 'manual refresh',
      timestamp: new Date().toISOString(),
    });

    const meta: TaskResultMeta = {
      averagePrice,
      tradeCount,
    };

    if (tokenSymbol) {
      meta.tokenSymbol = tokenSymbol;
    }

    if (
      orderResult?.availableBalanceBeforeOrder !== undefined &&
      Number.isFinite(orderResult.availableBalanceBeforeOrder)
    ) {
      meta.availableBalanceBeforeOrder = orderResult.availableBalanceBeforeOrder;
    }

    if (currentBalanceSnapshot !== undefined && Number.isFinite(currentBalanceSnapshot)) {
      meta.currentBalance = currentBalanceSnapshot;
    }

    return {
      success: true,
      details: detailParts.join(' '),
      meta,
    };
  }

  /**
   * 调度下一次自动化周期
   */
  private scheduleNextAutomationCycle(delayMs?: number): void {
    if (!this.automationEnabled) {
      return;
    }

    const delay =
      typeof delayMs === 'number' && delayMs >= 0 ? delayMs : this.getRandomAutomationDelay();

    if (this.nextEvaluationTimeoutId !== undefined) {
      clearTimeout(this.nextEvaluationTimeoutId);
    }

    this.automationLoopActive = true;
    this.nextEvaluationTimeoutId = window.setTimeout(() => {
      this.nextEvaluationTimeoutId = undefined;

      if (!this.automationEnabled || !this.isExtensionContextValid()) {
        return;
      }

      void this.runEvaluationCycle(true, { placeOrder: true }).finally(() => {
        if (this.automationEnabled) {
          this.scheduleNextAutomationCycle();
        }
      });
    }, delay);
  }

  /**
   * 停止轮询
   */
  teardownPolling(): void {
    if (this.nextEvaluationTimeoutId !== undefined) {
      clearTimeout(this.nextEvaluationTimeoutId);
      this.nextEvaluationTimeoutId = undefined;
    }

    this.automationLoopActive = false;
    this.evaluationInProgress = false;
  }

  /**
   * 获取随机自动化延迟
   */
  private getRandomAutomationDelay(): number {
    let minDelay: number;
    let maxDelay: number;

    if (this.intervalMode === 'fast') {
      minDelay = FAST_MODE_MIN_DELAY;
      maxDelay = FAST_MODE_MAX_DELAY;
    } else {
      minDelay = MEDIUM_MODE_MIN_DELAY;
      maxDelay = MEDIUM_MODE_MAX_DELAY;
    }

    return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
  }

  /**
   * 检查扩展上下文是否有效
   */
  private isExtensionContextValid(): boolean {
    if (this.runtimeUnavailable) {
      return false;
    }

    try {
      const id = chrome?.runtime?.id;
      return typeof id === 'string' && id.length > 0;
    } catch {
      this.runtimeUnavailable = true;
      return false;
    }
  }

  /**
   * 检查登录提示
   */
  private checkForLoginPrompt(): boolean {
    if (!SELECTORS.loginPrompt) {
      return false;
    }

    const loginNode = document.querySelector(SELECTORS.loginPrompt);
    if (!loginNode) {
      return false;
    }

    const text = loginNode.textContent?.trim() ?? '';
    return text.length > 0;
  }

  /**
   * 发送运行时消息
   */
  private async dispatchRuntimeMessage(message: RuntimeMessage): Promise<void> {
    if (!this.isExtensionContextValid()) {
      this.teardownPolling();
      return;
    }

    try {
      await postRuntimeMessage(message);
    } catch (error) {
      console.warn('[dddd-alpah-extension] Failed to post runtime message', error);

      const messageText = error instanceof Error ? error.message : String(error ?? '');
      if (/extension context invalidated/i.test(messageText)) {
        this.runtimeUnavailable = true;
        this.teardownPolling();
      }
    }
  }
}
