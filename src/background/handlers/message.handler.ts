/**
 * 消息处理器
 * 负责处理来自 content script 和 popup 的消息
 *
 * 注意：保留原版的完整逻辑，包括所有边界情况处理
 */

import {
  DEFAULT_AUTOMATION,
  DEFAULT_POINTS_TARGET,
  MAX_SUCCESSFUL_TRADES,
  SUCCESSFUL_TRADES_LIMIT_MESSAGE,
} from '../../config/defaults.js';
import { calculateAlphaPointStats } from '../../lib/alphaPoints.js';
import type { RuntimeMessage } from '../../lib/messages.js';
import { getSchedulerState, updateSchedulerState } from '../../lib/storage.js';
import type { SchedulerService } from '../services/scheduler.service.js';

/**
 * 自动化消息错误类
 */
class AutomationMessageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AutomationMessageError';
  }
}

export class MessageHandler {
  constructor(private schedulerService: SchedulerService) {}

  handleBalanceUpdate(message: RuntimeMessage, sendResponse: (response: any) => void): boolean {
    if (message.type !== 'BALANCE_UPDATE') return false;

    const currentBalanceValue = this.normalizeBalance(message.payload?.currentBalance);
    const tokenSymbol = this.normalizeTokenSymbol(message.payload?.tokenSymbol);
    const timestamp = new Date().toISOString();
    const dateKey = timestamp.slice(0, 10);

    void updateSchedulerState((state) => {
      const previousDaily = state.dailyBuyVolume;
      const isSameDay = previousDaily?.date === dateKey;
      const previousTokenSymbol = state.tokenSymbol ?? state.lastResult?.tokenSymbol;
      const resolvedTokenSymbol = tokenSymbol ?? previousTokenSymbol;

      // 如果余额和token symbol都没有,则跳过更新
      if (currentBalanceValue === undefined && !tokenSymbol) {
        return state;
      }

      // 如果只有token symbol而没有余额,仅更新token symbol,不影响其他状态
      if (currentBalanceValue === undefined) {
        return {
          ...state,
          tokenSymbol: resolvedTokenSymbol,
        };
      }

      const existingFirstBalance =
        isSameDay && typeof previousDaily?.firstBalance === 'number'
          ? previousDaily.firstBalance
          : undefined;
      const existingTotal =
        isSameDay && typeof previousDaily?.total === 'number' ? previousDaily.total : 0;
      const existingTrades =
        isSameDay && typeof previousDaily?.tradeCount === 'number' ? previousDaily.tradeCount : 0;
      const existingAlphaPoints =
        isSameDay && typeof previousDaily?.alphaPoints === 'number' ? previousDaily.alphaPoints : 0;
      const existingNextThresholdDelta =
        isSameDay && typeof previousDaily?.nextThresholdDelta === 'number'
          ? previousDaily.nextThresholdDelta
          : 2;

      let nextFirstBalance = existingFirstBalance;

      // 只在余额 > 0 时才设置初始余额,避免页面加载时余额为0的情况
      if (!isSameDay) {
        nextFirstBalance = currentBalanceValue > 0 ? currentBalanceValue : undefined;
      } else if (nextFirstBalance === undefined && currentBalanceValue > 0) {
        nextFirstBalance = currentBalanceValue;
      }

      const nextDaily = {
        date: dateKey,
        total: existingTotal,
        alphaPoints: existingAlphaPoints,
        nextThresholdDelta: existingNextThresholdDelta,
        tradeCount: existingTrades,
        firstBalance: nextFirstBalance,
      } as const;

      return {
        ...state,
        tokenSymbol: resolvedTokenSymbol,
        dailyBuyVolume: nextDaily,
        lastResult: state.lastResult
          ? {
              ...state.lastResult,
              firstBalanceToday: nextDaily.firstBalance,
            }
          : undefined,
      };
    });

    sendResponse({ acknowledged: true });
    return true;
  }

  handleOrderHistorySnapshot(
    message: RuntimeMessage,
    sendResponse: (response: any) => void,
  ): boolean {
    if (message.type !== 'ORDER_HISTORY_SNAPSHOT') return false;

    const payload = message.payload;
    const dateKeyCandidate = typeof payload.date === 'string' ? payload.date : undefined;
    const now =
      typeof payload.fetchedAt === 'number' && Number.isFinite(payload.fetchedAt)
        ? new Date(payload.fetchedAt)
        : new Date();
    const timestamp = now.toISOString();
    const dateKey = dateKeyCandidate ?? timestamp.slice(0, 10);
    const totalBuyVolume = this.normalizeVolumeDelta(payload.totalBuyVolume);
    const buyOrderCount = this.normalizeCountDelta(payload.buyOrderCount);
    const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(totalBuyVolume);
    let autoStopTriggered = false;

    void updateSchedulerState((state) => {
      const previousDaily = state.dailyBuyVolume;
      const isSameDay = previousDaily?.date === dateKey;
      const existingFirstBalance =
        isSameDay && typeof previousDaily?.firstBalance === 'number'
          ? previousDaily.firstBalance
          : undefined;

      const nextDaily = {
        date: dateKey,
        total: totalBuyVolume,
        alphaPoints,
        nextThresholdDelta,
        tradeCount: buyOrderCount,
        firstBalance: existingFirstBalance,
      } as const;

      const configuredTarget =
        typeof state.settings?.pointsTarget === 'number'
          ? state.settings.pointsTarget
          : DEFAULT_POINTS_TARGET;
      const pointsTargetReached = alphaPoints >= configuredTarget;
      const tradeLimitReached = buyOrderCount >= MAX_SUCCESSFUL_TRADES;
      const shouldAutoStop = state.isEnabled && (pointsTargetReached || tradeLimitReached);
      autoStopTriggered = shouldAutoStop;

      const autoStopMessages: string[] = [];

      if (pointsTargetReached) {
        autoStopMessages.push(
          `Points target reached: ${alphaPoints} ≥ ${configuredTarget}. Automation paused.`,
        );
      }

      if (tradeLimitReached) {
        autoStopMessages.push(SUCCESSFUL_TRADES_LIMIT_MESSAGE);
      }

      const previousTokenSymbol = state.tokenSymbol ?? state.lastResult?.tokenSymbol;
      const resolvedTokenSymbol = previousTokenSymbol;
      const previousDetails = state.lastResult?.details;
      const detailMessages: string[] = [];

      if (previousDetails) {
        detailMessages.push(previousDetails);
      }

      if (autoStopMessages.length > 0) {
        detailMessages.push(...autoStopMessages);
      }

      const mergedDetails =
        detailMessages.length > 0 ? detailMessages.join(' • ') : previousDetails;

      const nextLastResult = {
        timestamp,
        details: mergedDetails,
        averagePrice: state.lastResult?.averagePrice,
        tradeCount: state.lastResult?.tradeCount,
        buyVolumeToday: nextDaily.total,
        alphaPointsToday: nextDaily.alphaPoints,
        buyVolumeToNextPoint: nextDaily.nextThresholdDelta,
        successfulTradesToday: nextDaily.tradeCount,
        tokenSymbol: resolvedTokenSymbol,
        firstBalanceToday: nextDaily.firstBalance,
      } as const;

      return {
        ...state,
        isEnabled: shouldAutoStop ? false : state.isEnabled,
        isRunning: shouldAutoStop ? false : state.isRunning,
        lastError: shouldAutoStop ? undefined : state.lastError,
        tokenSymbol: resolvedTokenSymbol,
        dailyBuyVolume: nextDaily,
        lastResult: nextLastResult,
        requiresLogin: false,
        sessionStoppedAt: shouldAutoStop ? timestamp : state.sessionStoppedAt,
      };
    });

    sendResponse({ acknowledged: true });
    if (autoStopTriggered) {
      void this.schedulerService.clearAlarm();
    }
    return true;
  }

  handleTaskComplete(message: RuntimeMessage, sendResponse: (response: any) => void): boolean {
    if (message.type !== 'TASK_COMPLETE') return false;

    const timestamp = new Date().toISOString();
    const { success, details, meta } = message.payload;
    const normalizedDetails = this.normalizeDetail(details);
    const lastError = success ? undefined : (normalizedDetails ?? 'Unknown error');
    const buyVolumeDelta = this.normalizeVolumeDelta(meta?.buyVolumeDelta);
    const currentBalanceValue = this.normalizeBalance(
      meta?.currentBalance ?? meta?.availableBalanceBeforeOrder,
    );
    const dateKey = timestamp.slice(0, 10);
    const tokenSymbol = this.normalizeTokenSymbol(meta?.tokenSymbol);
    let autoStopTriggered = false;

    if (success && meta?.averagePrice !== undefined) {
      // eslint-disable-next-line no-console
      console.log('[dddd-alpah-extension] Last VWAP result', {
        averagePrice: meta.averagePrice,
        tradeCount: meta.tradeCount,
        buyVolumeDelta,
        tokenSymbol,
        details,
        timestamp,
      });
    }

    void updateSchedulerState((state) => {
      const previousDaily = state.dailyBuyVolume;
      const isSameDay = previousDaily?.date === dateKey;
      const existingTotal =
        isSameDay && typeof previousDaily?.total === 'number' ? previousDaily.total : 0;
      const updatedTotal = existingTotal + buyVolumeDelta;
      const existingTrades =
        isSameDay && typeof previousDaily?.tradeCount === 'number' ? previousDaily.tradeCount : 0;
      const existingFirstBalance =
        isSameDay && typeof previousDaily?.firstBalance === 'number'
          ? previousDaily.firstBalance
          : undefined;
      let nextFirstBalance = existingFirstBalance;

      // 只在余额 > 0 时才设置初始余额
      if (currentBalanceValue !== undefined && currentBalanceValue > 0) {
        if (!isSameDay) {
          nextFirstBalance = currentBalanceValue;
        } else if (nextFirstBalance === undefined) {
          nextFirstBalance = currentBalanceValue;
        }
      } else if (!isSameDay) {
        nextFirstBalance = undefined;
      }

      const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(updatedTotal);
      const previousTokenSymbol = state.tokenSymbol ?? state.lastResult?.tokenSymbol;
      const resolvedTokenSymbol = tokenSymbol ?? previousTokenSymbol;
      const configuredTarget =
        typeof state.settings?.pointsTarget === 'number'
          ? state.settings.pointsTarget
          : DEFAULT_POINTS_TARGET;
      const lastResultTimestamp = state.lastResult?.timestamp;
      const lastResultDateMatches =
        typeof lastResultTimestamp === 'string' && lastResultTimestamp.slice(0, 10) === dateKey;
      const lastSnapshotTrades =
        lastResultDateMatches && typeof state.lastResult?.successfulTradesToday === 'number'
          ? state.lastResult.successfulTradesToday
          : 0;
      const nextTradeCount = Math.max(existingTrades, lastSnapshotTrades);
      const pointsTargetReached = alphaPoints >= configuredTarget;
      const tradeLimitReached = nextTradeCount >= MAX_SUCCESSFUL_TRADES;
      const shouldAutoStop = state.isEnabled && (pointsTargetReached || tradeLimitReached);
      autoStopTriggered = shouldAutoStop;

      const autoStopMessages: string[] = [];

      if (pointsTargetReached) {
        autoStopMessages.push(
          `Points target reached: ${alphaPoints} ≥ ${configuredTarget}. Automation paused.`,
        );
      }

      if (tradeLimitReached) {
        autoStopMessages.push(SUCCESSFUL_TRADES_LIMIT_MESSAGE);
      }

      const detailMessages: string[] = [];
      if (normalizedDetails) {
        detailMessages.push(normalizedDetails);
      }

      if (autoStopMessages.length > 0) {
        detailMessages.push(...autoStopMessages);
      }

      const mergedDetails = detailMessages.length > 0 ? detailMessages.join(' • ') : undefined;

      const nextDaily = {
        date: dateKey,
        total: updatedTotal,
        alphaPoints,
        nextThresholdDelta,
        tradeCount: nextTradeCount,
        firstBalance: nextFirstBalance,
      } as const;

      return {
        ...state,
        isRunning: false,
        isEnabled: shouldAutoStop ? false : state.isEnabled,
        lastRun: timestamp,
        lastError: shouldAutoStop ? undefined : lastError,
        tokenSymbol: resolvedTokenSymbol,
        dailyBuyVolume: nextDaily,
        lastResult: {
          timestamp,
          details: mergedDetails,
          averagePrice: meta?.averagePrice,
          tradeCount: meta?.tradeCount,
          buyVolumeToday: nextDaily.total,
          alphaPointsToday: nextDaily.alphaPoints,
          buyVolumeToNextPoint: nextDaily.nextThresholdDelta,
          successfulTradesToday: nextDaily.tradeCount,
          tokenSymbol: resolvedTokenSymbol,
          firstBalanceToday: nextDaily.firstBalance,
        },
        requiresLogin: false,
        sessionStoppedAt: shouldAutoStop ? timestamp : state.sessionStoppedAt,
      };
    });

    sendResponse({ acknowledged: true });
    if (autoStopTriggered) {
      void this.schedulerService.clearAlarm();
    }
    return true;
  }

  handleTaskError(message: RuntimeMessage, sendResponse: (response: any) => void): boolean {
    if (message.type !== 'TASK_ERROR') return false;

    const normalizedMessage = this.normalizeDetail(message.payload.message);
    void updateSchedulerState((state) => ({
      ...state,
      isRunning: false,
      lastError: normalizedMessage ?? 'Unknown error',
      lastRun: state.lastRun,
      requiresLogin: normalizedMessage === '请先登录币安',
    }));
    sendResponse({ acknowledged: true });
    return true;
  }

  private normalizeVolumeDelta(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  private normalizeCountDelta(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.floor(numeric);
  }

  private normalizeBalance(value: unknown): number | undefined {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return undefined;
    return numeric;
  }

  private normalizeTokenSymbol(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  private normalizeDetail(detail: unknown): string | undefined {
    if (detail === undefined || detail === null) return undefined;
    if (typeof detail === 'string') return detail;

    if (detail && typeof detail === 'object') {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string') return message;

      try {
        return JSON.stringify(detail);
      } catch {
        return String(detail);
      }
    }

    return String(detail);
  }

  /**
   * 处理启动控制消息
   */
  async handleControlStart(
    tokenAddress?: string,
    tabId?: number,
  ): Promise<{ acknowledged: boolean; error?: string }> {
    try {
      const state = await getSchedulerState();
      const todayKey = new Date().toISOString().slice(0, 10);
      let tradesToday = 0;

      if (
        state.dailyBuyVolume?.date === todayKey &&
        typeof state.dailyBuyVolume.tradeCount === 'number'
      ) {
        tradesToday = state.dailyBuyVolume.tradeCount;
      } else if (
        typeof state.lastResult?.successfulTradesToday === 'number' &&
        typeof state.lastResult?.timestamp === 'string' &&
        state.lastResult.timestamp.slice(0, 10) === todayKey
      ) {
        tradesToday = state.lastResult.successfulTradesToday;
      }

      if (tradesToday >= MAX_SUCCESSFUL_TRADES) {
        throw new AutomationMessageError(SUCCESSFUL_TRADES_LIMIT_MESSAGE, 'TRADE_LIMIT_REACHED');
      }

      const sanitizedTokenOverride = this.sanitizeTokenAddress(tokenAddress);
      const sessionStartedAt = new Date().toISOString();

      await updateSchedulerState((current) => {
        const resolvedToken =
          sanitizedTokenOverride ??
          current.settings.tokenAddress ??
          DEFAULT_AUTOMATION.tokenAddress;

        return {
          ...current,
          isEnabled: true,
          sessionStartedAt,
          sessionStoppedAt: undefined,
          settings: {
            ...current.settings,
            tokenAddress: resolvedToken,
          },
        };
      });

      await this.schedulerService.ensureAlarm();
      const sanitizedTabId = this.sanitizeTabId(tabId);
      void this.schedulerService.scheduleImmediateRun({
        tokenAddressOverride: sanitizedTokenOverride,
        targetTabId: sanitizedTabId,
      });

      return { acknowledged: true };
    } catch (error) {
      return {
        acknowledged: false,
        error: this.normalizeError(error),
      };
    }
  }

  /**
   * 处理停止控制消息
   */
  async handleControlStop(): Promise<{ acknowledged: boolean; error?: string }> {
    try {
      const sessionStoppedAt = new Date().toISOString();
      await this.schedulerService.clearAlarm();
      await updateSchedulerState((state) => ({
        ...state,
        isEnabled: false,
        isRunning: false,
        sessionStoppedAt,
      }));

      return { acknowledged: true };
    } catch (error) {
      return {
        acknowledged: false,
        error: this.normalizeError(error),
      };
    }
  }

  /**
   * 处理窗口聚焦消息
   */
  async handleFocusWindow(
    windowId?: number,
    tabId?: number,
  ): Promise<{ acknowledged: boolean; error?: string }> {
    try {
      let targetWindowId: number | undefined | null = windowId ?? null;

      if (tabId !== undefined) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab?.windowId !== undefined) {
            targetWindowId = tab.windowId;
          }

          if (tab?.id !== undefined && tab.active !== true) {
            await chrome.tabs.update(tab.id, { active: true });
          }
        } catch (tabError) {
          console.warn('[MessageHandler] Failed to resolve tab for focus:', tabError);
        }
      }

      if (!targetWindowId) {
        try {
          const lastFocused = await chrome.windows.getLastFocused({ populate: false });
          targetWindowId = lastFocused?.id ?? null;
        } catch (lastFocusedError) {
          console.warn('[MessageHandler] Failed to get last focused window:', lastFocusedError);
        }
      }

      if (!targetWindowId) {
        const windows = await chrome.windows.getAll();
        const focusedWindow = windows.find((win) => win.focused);
        targetWindowId = focusedWindow?.id ?? windows[0]?.id ?? null;
      }

      if (targetWindowId) {
        await chrome.windows.update(targetWindowId, {
          focused: true,
          drawAttention: true,
          state: 'normal',
        });
      }

      return { acknowledged: true };
    } catch (error) {
      console.error('[MessageHandler] Failed to focus window:', error);
      return {
        acknowledged: false,
        error: this.normalizeError(error),
      };
    }
  }

  /**
   * 辅助方法: 清理 token 地址
   */
  private sanitizeTokenAddress(value?: string): string | undefined {
    if (!value) return undefined;
    const match = value.trim().match(/0x[a-fA-F0-9]{40}/u);
    return match ? match[0].toLowerCase() : undefined;
  }

  /**
   * 辅助方法: 清理 tab ID
   */
  private sanitizeTabId(value?: number): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }
    return value;
  }

  /**
   * 辅助方法: 标准化错误消息
   */
  private normalizeError(error: unknown): string {
    if (error instanceof Error) return error.message;

    if (error && typeof error === 'object') {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }

    try {
      return String(error);
    } catch {
      return 'Unknown error';
    }
  }
}
