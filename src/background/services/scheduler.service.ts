/**
 * 调度服务
 * 负责自动化任务的调度和管理
 */

import { DEFAULT_AUTOMATION } from '../../config/defaults.js';
import type { RuntimeMessage } from '../../lib/chrome/messages.js';
import {
  getSchedulerState,
  type SchedulerState,
  updateSchedulerState,
} from '../../lib/chrome/storage.js';
import { getTab } from '../../lib/chrome/tabs.js';

const { alarmName, intervalMinutes } = DEFAULT_AUTOMATION;
const MIN_ALARM_INTERVAL_MINUTES = 0.5;
const INITIAL_DELAY_MINUTES = 0.01;

class AutomationMessageError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AutomationMessageError';
  }
}

class ContentScriptUnavailableError extends AutomationMessageError {
  constructor(message = 'Content script unavailable') {
    super(message, 'CONTENT_SCRIPT_UNAVAILABLE');
    this.name = 'ContentScriptUnavailableError';
  }
}

class TabUnavailableError extends AutomationMessageError {
  constructor(message = 'Tab unavailable') {
    super(message, 'TAB_UNAVAILABLE');
    this.name = 'TabUnavailableError';
  }
}

interface RunOptions {
  force?: boolean;
  trigger?: 'schedule' | 'manual';
  tokenAddressOverride?: string;
  targetTabId?: number;
}

export class SchedulerService {
  private immediateRunScheduled = false;

  async bootstrap(): Promise<void> {
    const state = await getSchedulerState();

    if (state.isEnabled) {
      await this.ensureAlarm();
      await updateSchedulerState((current: SchedulerState) => ({
        ...current,
        isRunning: false,
        isEnabled: true,
      }));
      void this.scheduleImmediateRun();
      return;
    }

    await this.clearAlarm();
    await updateSchedulerState((current: SchedulerState) => ({
      ...current,
      isRunning: false,
      isEnabled: false,
    }));
  }

  async ensureAlarm(): Promise<void> {
    const periodInMinutes = Math.max(intervalMinutes, MIN_ALARM_INTERVAL_MINUTES);

    chrome.alarms.create(alarmName, {
      delayInMinutes: INITIAL_DELAY_MINUTES,
      periodInMinutes,
    });
  }

  async clearAlarm(): Promise<void> {
    await new Promise<void>((resolve) => {
      chrome.alarms.clear(alarmName, () => resolve());
    });
  }

  async scheduleImmediateRun(options: RunOptions = {}): Promise<void> {
    if (this.immediateRunScheduled) return;

    this.immediateRunScheduled = true;

    try {
      await this.runCycle(options);
    } catch (error) {
      console.warn('[scheduler] Immediate automation run failed', error);
    } finally {
      this.immediateRunScheduled = false;
    }
  }

  async runCycle(options: RunOptions = {}): Promise<void> {
    const { force = false, trigger = 'schedule', tokenAddressOverride, targetTabId } = options;
    const state = await getSchedulerState();

    if (!force && !state.isEnabled) {
      if (state.isRunning) {
        await updateSchedulerState((current: SchedulerState) => ({
          ...current,
          isRunning: false,
        }));
      }
      return;
    }

    await updateSchedulerState((current: SchedulerState) => ({
      ...current,
      isRunning: true,
      lastError: undefined,
      isEnabled: force ? current.isEnabled : true,
    }));

    try {
      const effectiveToken =
        this.sanitizeTokenAddress(tokenAddressOverride) ??
        state.settings?.tokenAddress ??
        DEFAULT_AUTOMATION.tokenAddress;

      let tab: chrome.tabs.Tab | undefined;

      if (typeof targetTabId === 'number' && Number.isFinite(targetTabId)) {
        const existingTab = await getTab(targetTabId).catch(() => undefined);
        if (existingTab?.id !== undefined) {
          const existingToken =
            typeof existingTab.url === 'string'
              ? this.sanitizeTokenAddress(existingTab.url)
              : undefined;
          if (existingToken === effectiveToken) {
            tab = existingTab;
          }
        }
      }

      if (!tab) {
        tab = await this.findActiveBinanceAlphaTab(effectiveToken);
      }

      if (!tab?.id) {
        throw new Error(
          'No valid Binance Alpha tab found. Please open the token page in your browser.',
        );
      }

      const runtimeMessage: RuntimeMessage =
        trigger === 'manual' ? { type: 'RUN_TASK_ONCE' } : { type: 'RUN_TASK' };
      await this.sendMessageToTab(tab.id, runtimeMessage);
    } catch (error) {
      let message: string;

      if (error instanceof ContentScriptUnavailableError) {
        message = '未能连接到 Binance Alpha 页面，请确认页面已完全加载或刷新页面后重试。';
      } else if (error instanceof TabUnavailableError) {
        message = '目标页面已关闭或跳转，请重新打开对应的 Binance Alpha 页面后重试。';
      } else {
        message = error instanceof Error ? error.message : String(error);
      }

      await updateSchedulerState((state: SchedulerState) => ({
        ...state,
        isRunning: false,
        lastError: message,
        lastRun: new Date().toISOString(),
      }));
    }
  }

  private sanitizeTokenAddress(value?: string): string | undefined {
    if (!value) return undefined;
    const match = value.trim().match(/0x[a-fA-F0-9]{40}/u);
    return match ? match[0].toLowerCase() : undefined;
  }

  private async findActiveBinanceAlphaTab(
    tokenAddress: string,
  ): Promise<chrome.tabs.Tab | undefined> {
    const BINANCE_ALPHA_PATTERN =
      /^https:\/\/www\.binance\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)alpha\/bsc\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/u;

    const allTabs = await chrome.tabs.query({});

    const activeTabs = allTabs.filter((tab) => tab.active && tab.url);
    for (const tab of activeTabs) {
      if (!tab.url) continue;
      const match = tab.url.match(BINANCE_ALPHA_PATTERN);
      if (match && match[1].toLowerCase() === tokenAddress.toLowerCase()) {
        return tab;
      }
    }

    const currentWindowTabs = allTabs.filter((tab) => tab.url);
    for (const tab of currentWindowTabs) {
      if (!tab.url) continue;
      const match = tab.url.match(BINANCE_ALPHA_PATTERN);
      if (match && match[1].toLowerCase() === tokenAddress.toLowerCase()) {
        return tab;
      }
    }

    return undefined;
  }

  private async sendMessageToTab(tabId: number, message: RuntimeMessage): Promise<void> {
    const MAX_ATTEMPTS = 12;
    const RECEIVING_END_MISSING_PATTERN = /Receiving end does not exist/i;
    const TAB_UNAVAILABLE_PATTERN = /(No tab with id|The tab was closed|Tab .* not found)/i;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
              reject(runtimeError);
              return;
            }
            if (response?.acknowledged) {
              resolve();
              return;
            }
            resolve();
          });
        });
        return;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        const receivingEndMissing = RECEIVING_END_MISSING_PATTERN.test(messageText);
        const tabMissing = TAB_UNAVAILABLE_PATTERN.test(messageText);
        const canRetry = attempt < MAX_ATTEMPTS && receivingEndMissing;

        if (canRetry) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt + 250));
          continue;
        }

        if (receivingEndMissing) {
          throw new ContentScriptUnavailableError(messageText);
        }

        if (tabMissing) {
          throw new TabUnavailableError(messageText);
        }

        throw new AutomationMessageError(messageText, 'MESSAGE_FAILED');
      }
    }
  }
}
