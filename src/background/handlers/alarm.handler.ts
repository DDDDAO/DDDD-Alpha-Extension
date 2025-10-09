/**
 * Alarm 处理器
 * 负责处理 Chrome Alarms 事件
 * 遵循单一职责原则 (SRP): 专注于 Alarm 事件的路由和处理
 */

import { DEFAULT_AUTOMATION } from '../../config/defaults.js';
import type { AirdropMonitorService } from '../services/airdrop-monitor.service.js';
import type { SchedulerService } from '../services/scheduler.service.js';

const UPDATE_ALARM_NAME = 'airdrop-update';

/**
 * Alarm 处理器类
 */
export class AlarmHandler {
  constructor(
    private schedulerService: SchedulerService,
    private airdropMonitorService: AirdropMonitorService,
  ) {}

  /**
   * 处理 Alarm 事件
   * 根据 alarm 名称路由到相应的处理逻辑
   */
  handleAlarm(alarm: chrome.alarms.Alarm): void {
    // 处理自动化调度 alarm
    if (alarm.name === DEFAULT_AUTOMATION.alarmName) {
      console.log('[AlarmHandler] 自动化调度 alarm 触发');
      void this.schedulerService.runCycle();
      return;
    }

    // 处理空投更新 alarm
    if (alarm.name === UPDATE_ALARM_NAME) {
      console.log('[AlarmHandler] 空投更新 alarm 触发');
      void this.airdropMonitorService.fetchAndUpdateAirdrops();
      return;
    }

    // 未知的 alarm
    console.warn('[AlarmHandler] 未知的 alarm:', alarm.name);
  }
}
