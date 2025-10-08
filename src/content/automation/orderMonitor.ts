/**
 * 订单监控模块
 * 负责监控挂单状态、检测未成交订单并触发相应警告
 */

import { postRuntimeMessage } from '../../lib/messages.js';
import type { AlertManager } from '../ui/alertManager.js';
import type { DOMController } from '../ui/domController.js';

// 时间常量
const PENDING_ORDER_WARNING_DELAY_MS = 5_000; // 5秒普通警告（买入+卖出）
const PENDING_SELL_ORDER_ALERT_DELAY_MS = 10_000; // 卖出单10秒紧急警报
const PENDING_ORDER_CHECK_INTERVAL_MS = 1_000; // 每秒检查一次

/**
 * 订单信息接口
 */
export interface OrderInfo {
  key: string;
  side: 'buy' | 'sell';
}

/**
 * 订单监控器类
 */
export class OrderMonitor {
  private monitoringEnabled = false;
  private monitorIntervalId?: number;

  // 订单状态追踪
  private pendingOrderTimestamps = new Map<string, number>();
  private pending5SecWarningsShown = new Set<string>();
  private pending10SecWarningsShown = new Set<string>();

  // 自动化控制回调
  private onEmergencyStop?: () => void;

  constructor(
    private readonly domController: DOMController,
    private readonly alertManager: AlertManager,
  ) {}

  /**
   * 设置紧急停止回调
   * @param callback 当卖出单10秒未成交时调用此回调停止自动化
   */
  setEmergencyStopCallback(callback: () => void): void {
    this.onEmergencyStop = callback;
  }

  /**
   * 启用监控
   */
  enableMonitoring(): void {
    this.monitoringEnabled = true;
  }

  /**
   * 禁用监控
   */
  disableMonitoring(): void {
    this.monitoringEnabled = false;
  }

  /**
   * 启动监控
   */
  startMonitoring(): void {
    if (this.monitorIntervalId !== undefined) {
      return;
    }

    const runCheck = () => {
      try {
        this.checkPendingLimitOrders();
      } catch {
        // 静默失败
      }
    };

    runCheck();
    this.monitorIntervalId = window.setInterval(runCheck, PENDING_ORDER_CHECK_INTERVAL_MS);
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitorIntervalId !== undefined) {
      window.clearInterval(this.monitorIntervalId);
      this.monitorIntervalId = undefined;
    }
    this.clearAllTracking();
  }

  /**
   * 清除所有订单追踪数据
   */
  private clearAllTracking(): void {
    this.pendingOrderTimestamps.clear();
    this.pending5SecWarningsShown.clear();
    this.pending10SecWarningsShown.clear();
  }

  /**
   * 检查挂单状态
   */
  private checkPendingLimitOrders(): void {
    if (!this.monitoringEnabled) {
      return;
    }

    const root = this.domController.getOpenOrdersRoot();
    if (!root) {
      // 没有订单面板,清除所有追踪
      if (
        this.pendingOrderTimestamps.size > 0 ||
        this.pending5SecWarningsShown.size > 0 ||
        this.pending10SecWarningsShown.size > 0
      ) {
        this.clearAllTracking();
      }
      return;
    }

    const activeOrders = this.extractOpenLimitOrderKeys(root);
    const now = Date.now();
    const activeKeySet = new Set(activeOrders.map((o) => o.key));

    // 添加新订单到追踪
    for (const order of activeOrders) {
      if (!this.pendingOrderTimestamps.has(order.key)) {
        this.pendingOrderTimestamps.set(order.key, now);
        console.log(
          `[dddd-alpha-extension] 开始监控${order.side === 'buy' ? '买入' : '卖出'}限价单: ${order.key}`,
        );
      }
    }

    // 移除已成交的订单
    for (const key of Array.from(this.pendingOrderTimestamps.keys())) {
      if (!activeKeySet.has(key)) {
        this.pendingOrderTimestamps.delete(key);
        this.pending5SecWarningsShown.delete(key);
        this.pending10SecWarningsShown.delete(key);
      }
    }

    // 检查每个订单的等待时间并触发警告
    for (const [key, startedAt] of this.pendingOrderTimestamps.entries()) {
      const order = activeOrders.find((o) => o.key === key);
      if (!order) continue;

      const elapsed = now - startedAt;

      // 5秒警告：买入单和卖出单都显示
      if (elapsed >= PENDING_ORDER_WARNING_DELAY_MS && !this.pending5SecWarningsShown.has(key)) {
        console.warn(
          `[dddd-alpha-extension] ⚠️ 5秒警告：${order.side === 'buy' ? '买入' : '卖出'}限价单未成交 - ${order.key}`,
        );

        // 显示普通警告
        this.alertManager.showPendingOrderWarning(order.side);
        this.pending5SecWarningsShown.add(key);
      }

      // 10秒紧急警告：仅卖出单
      if (
        order.side === 'sell' &&
        elapsed >= PENDING_SELL_ORDER_ALERT_DELAY_MS &&
        !this.pending10SecWarningsShown.has(key)
      ) {
        console.error('[dddd-alpha-extension] 🚨 紧急情况：卖出限价单10秒未成交，自动暂停策略！');

        // 调用紧急停止回调
        if (this.onEmergencyStop) {
          this.onEmergencyStop();
        }

        // 通知后台停止调度
        void postRuntimeMessage({ type: 'CONTROL_STOP' }).catch((error: unknown) => {
          console.warn('[dddd-alpha-extension] Failed to dispatch CONTROL_STOP:', error);
        });

        // 显示紧急警告
        this.alertManager.showUrgentSellAlert();
        this.pending10SecWarningsShown.add(key);
      }
    }
  }

  /**
   * 提取当前所有挂单
   * @param root 订单面板根元素
   * @returns 订单信息数组
   */
  private extractOpenLimitOrderKeys(root: HTMLElement): OrderInfo[] {
    const container = this.domController.getLimitOrdersContainer(root);
    if (!container) {
      return [];
    }

    let rowNodes = Array.from(root.querySelectorAll<HTMLElement>('table tbody tr'));

    if (rowNodes.length === 0) {
      rowNodes = Array.from(
        container.querySelectorAll<HTMLElement>('[data-row-index],[role="row"],table tbody tr'),
      );
    }

    const orders: OrderInfo[] = [];

    for (const row of rowNodes) {
      const normalizedText = this.getNormalizedOrderRowText(row);
      if (!normalizedText) {
        continue;
      }

      const orderSide = this.detectLimitOrderSide(normalizedText);
      if (!orderSide) {
        continue;
      }

      if (!/\d/.test(normalizedText)) {
        continue;
      }

      const signature = this.getOrderRowSignature(row, normalizedText);
      if (!signature) {
        continue;
      }

      orders.push({ key: signature, side: orderSide });
    }

    return orders;
  }

  /**
   * 生成订单行的唯一签名
   * @param row 订单行元素
   * @param normalizedText 规范化的文本内容
   * @returns 订单签名或null
   */
  private getOrderRowSignature(row: HTMLElement, normalizedText: string): string | null {
    const dataRowIndex = row.getAttribute('data-row-index');
    const dataRowId = row.getAttribute('data-row-id');
    const datasetKey = row.dataset?.rowKey;

    const identifier = dataRowIndex ?? dataRowId ?? datasetKey;
    if (identifier && identifier.length > 0) {
      return `${identifier}|${normalizedText}`;
    }

    if (normalizedText.length === 0) {
      return null;
    }

    return normalizedText;
  }

  /**
   * 获取订单行的规范化文本
   * @param row 订单行元素
   * @returns 规范化的文本或null
   */
  private getNormalizedOrderRowText(row: HTMLElement): string | null {
    const text = row.textContent?.trim();
    if (!text) {
      return null;
    }

    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * 检测限价单的买卖方向
   * @param normalizedText 规范化的文本
   * @returns 'buy' | 'sell' | null
   */
  private detectLimitOrderSide(normalizedText: string): 'buy' | 'sell' | null {
    const hasBuy = normalizedText.includes('buy') || normalizedText.includes('买入');
    const hasSell = normalizedText.includes('sell') || normalizedText.includes('卖出');

    if (!hasBuy && !hasSell) {
      return null;
    }

    const hasLimit =
      normalizedText.includes('limit') ||
      normalizedText.includes('限价') ||
      normalizedText.includes('限价单');

    const hasMarket = normalizedText.includes('market') || normalizedText.includes('市价');

    // 只处理限价单,不处理市价单
    if (hasMarket) {
      return null;
    }

    // 如果明确是限价单,或者没有市价关键词,则认为是限价单
    if (hasLimit || !hasMarket) {
      if (hasBuy) {
        return 'buy';
      }
      if (hasSell) {
        return 'sell';
      }
    }

    return null;
  }
}
