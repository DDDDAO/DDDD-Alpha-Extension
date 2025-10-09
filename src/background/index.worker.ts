/**
 * Background Worker 入口
 * 负责初始化服务并路由消息
 *
 * 重构目标：
 * - 清晰的服务初始化
 * - 简洁的消息路由
 * - 符合单一职责原则
 */

import type { RuntimeMessage } from '../lib/messages.js';
import { AlarmHandler } from './handlers/alarm.handler.js';
import { MessageHandler } from './handlers/message.handler.js';
import { AirdropMonitorService } from './services/airdrop-monitor.service.js';
import { HeaderModifierService } from './services/header-modifier.service.js';
import { SchedulerService } from './services/scheduler.service.js';

// ============================================================
// 服务初始化
// ============================================================

const schedulerService = new SchedulerService();
const airdropMonitorService = new AirdropMonitorService();
const headerModifierService = new HeaderModifierService();

// ============================================================
// 处理器初始化
// ============================================================

const messageHandler = new MessageHandler(schedulerService);
const alarmHandler = new AlarmHandler(schedulerService, airdropMonitorService);

// ============================================================
// Bootstrap - 启动时初始化
// ============================================================

// 先注册请求头修改规则，然后再启动依赖它的服务
(async () => {
  await headerModifierService.registerRules();
  void schedulerService.bootstrap();
  airdropMonitorService.startMonitoring();
})();

// ============================================================
// 生命周期事件监听
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  // 先注册请求头修改规则，然后再启动依赖它的服务
  void (async () => {
    await headerModifierService.registerRules();
    void schedulerService.bootstrap();
    airdropMonitorService.startMonitoring();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Browser startup');
  // 先注册请求头修改规则，然后再启动依赖它的服务
  void (async () => {
    await headerModifierService.registerRules();
    void schedulerService.bootstrap();
    airdropMonitorService.startMonitoring();
  })();
});

// ============================================================
// Alarm 事件监听
// ============================================================

chrome.alarms.onAlarm.addListener((alarm) => {
  alarmHandler.handleAlarm(alarm);
});

// ============================================================
// 消息路由
// ============================================================

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  // 基础消息处理 (来自 content script)
  if (message.type === 'BALANCE_UPDATE') {
    return messageHandler.handleBalanceUpdate(message, sendResponse);
  }

  if (message.type === 'ORDER_HISTORY_SNAPSHOT') {
    return messageHandler.handleOrderHistorySnapshot(message, sendResponse);
  }

  if (message.type === 'TASK_COMPLETE') {
    return messageHandler.handleTaskComplete(message, sendResponse);
  }

  if (message.type === 'TASK_ERROR') {
    return messageHandler.handleTaskError(message, sendResponse);
  }

  // 控制消息处理 (来自 popup)
  if (message.type === 'CONTROL_START') {
    const tokenAddress = 'payload' in message ? message.payload?.tokenAddress : undefined;
    const tabId = 'payload' in message ? message.payload?.tabId : undefined;
    void messageHandler.handleControlStart(tokenAddress, tabId).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  if (message.type === 'CONTROL_STOP') {
    void messageHandler.handleControlStop().then((response) => {
      sendResponse(response);
    });
    return true;
  }

  if (message.type === 'FOCUS_WINDOW') {
    const targetWindowId = sender.tab?.windowId;
    const targetTabId = sender.tab?.id;
    void messageHandler.handleFocusWindow(targetWindowId, targetTabId).then((response) => {
      sendResponse(response);
    });
    return true;
  }

  // 空投监控消息处理 (来自 popup)
  if (message.type === 'UPDATE_AIRDROP_NOW') {
    console.log('[Background] 收到立即更新空投数据请求');
    void airdropMonitorService
      .fetchAndUpdateAirdrops()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[Background] 更新空投数据失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'GET_AIRDROP_DATA') {
    console.log('[Background] 收到获取空投数据请求');
    const AIRDROP_STORAGE_KEY = 'dddd-alpha-airdrop-data';
    chrome.storage.local.get(AIRDROP_STORAGE_KEY, (result) => {
      const data = result[AIRDROP_STORAGE_KEY];
      if (data?.timestamp) {
        const age = Date.now() - data.timestamp;
        console.log(`[Background] 返回缓存数据，数据年龄: ${Math.round(age / 1000)}秒`);
        sendResponse({ success: true, data });
      } else {
        console.log('[Background] 无缓存数据，触发更新');
        void airdropMonitorService.fetchAndUpdateAirdrops();
        sendResponse({ success: false, message: '正在获取数据...' });
      }
    });
    return true;
  }

  return false;
});
