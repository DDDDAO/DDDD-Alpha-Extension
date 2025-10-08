/**
 * 订单下单模块
 * 负责配置和下达限价单,包括反向订单处理
 */

import type { IntervalMode } from '../../config/defaults.js';
import {
  delay,
  randomIntInRange,
  waitForAnimationFrame,
  waitRandomDelay,
} from '../../lib/timing.js';
import { clampPriceOffsetPercent, parseNumericValue } from '../../lib/validators.js';
import type { DOMController } from '../ui/domController.js';
import type { OrderMonitor } from './orderMonitor.js';

// 常量定义
const ORDER_PLACEMENT_COOLDOWN_MS = 5_000;
const LIMIT_STATE_TIMEOUT_MS = 2_000;
const LIMIT_STATE_POLL_INTERVAL_MS = 100;

/**
 * 订单下单结果
 */
export interface OrderPlacementResult {
  status: 'placed' | 'skipped' | 'cooldown';
  reason?: string;
  buyVolume?: number;
  availableBalanceBeforeOrder?: number;
}

/**
 * 限价单配置参数
 */
export interface LimitOrderParams {
  price: number;
  priceOffsetPercent: number;
  buyPriceOffset: number;
  sellPriceOffset: number;
  availableUsdt: number;
  orderPanel: HTMLElement;
}

/**
 * 订单下单器类
 */
export class OrderPlacer {
  private lastOrderPlacedAt = 0;
  private intervalMode: IntervalMode = 'medium';
  private monitoringEnabled = false;

  constructor(
    private readonly domController: DOMController,
    private readonly orderMonitor?: OrderMonitor,
  ) {}

  /**
   * 设置间隔模式
   */
  setIntervalMode(mode: IntervalMode): void {
    this.intervalMode = mode;
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
   * 确保限价单已下达
   * @param params 订单参数
   * @returns 订单下达结果
   */
  async ensureLimitOrderPlaced(params: {
    price: number;
    priceOffsetPercent: number;
    buyPriceOffset: number;
    sellPriceOffset: number;
  }): Promise<OrderPlacementResult> {
    console.log('[dddd-alpah-extension] ensureLimitOrderPlaced started');

    const openOrdersRoot = this.domController.getOpenOrdersRoot();
    if (!openOrdersRoot) {
      console.error('[dddd-alpah-extension] Open orders root not found');
      throw new Error('Open orders section unavailable.');
    }

    await this.ensureOpenOrdersTabs(openOrdersRoot);

    const orderState = await this.resolveLimitOrderState(openOrdersRoot);
    console.log('[dddd-alpah-extension] Order state:', orderState);

    if (orderState === 'non-empty') {
      return {
        status: 'skipped',
        reason: 'Existing limit orders detected; skipping placement.',
      };
    }

    if (orderState === 'unknown') {
      return { status: 'skipped', reason: 'Unable to verify limit order state.' };
    }

    const now = Date.now();
    const timeSinceLastOrder = now - this.lastOrderPlacedAt;
    console.log('[dddd-alpah-extension] Time since last order:', timeSinceLastOrder, 'ms');

    if (timeSinceLastOrder < ORDER_PLACEMENT_COOLDOWN_MS) {
      return {
        status: 'cooldown',
        reason: 'Waiting for previous order placement to settle.',
      };
    }

    const orderPanel = this.domController.getTradingFormPanel();
    if (!orderPanel) {
      console.error('[dddd-alpah-extension] Trading form panel not found');
      throw new Error('Trading form panel not found.');
    }

    const availableUsdt = await this.extractAvailableUsdt(orderPanel);
    console.log('[dddd-alpah-extension] Available USDT:', availableUsdt);

    if (availableUsdt === null) {
      throw new Error('Unable to determine available USDT balance.');
    }

    if (availableUsdt <= 0) {
      throw new Error('Available USDT balance is zero.');
    }

    const buyVolume = await this.configureLimitOrder({
      price: params.price,
      priceOffsetPercent: params.priceOffsetPercent,
      buyPriceOffset: params.buyPriceOffset,
      sellPriceOffset: params.sellPriceOffset,
      availableUsdt,
      orderPanel,
    });

    this.lastOrderPlacedAt = Date.now();

    return {
      status: 'placed',
      buyVolume,
      availableBalanceBeforeOrder: availableUsdt,
    };
  }

  /**
   * 确保打开订单相关标签页
   */
  private async ensureOpenOrdersTabs(root: HTMLElement): Promise<void> {
    const locale = this.domController.getPageLocale();
    const openOrdersLabel = locale === 'zh-CN' ? '当前委托' : 'Open Orders';
    const limitLabel = locale === 'zh-CN' ? '限价' : 'Limit';

    const openOrdersTab = this.domController.getTabByLabel(root, openOrdersLabel);
    if (openOrdersTab && openOrdersTab.getAttribute('aria-selected') !== 'true') {
      openOrdersTab.click();
      await waitForAnimationFrame();
    }

    const limitTab = this.domController.getTabByLabel(root, limitLabel);
    if (limitTab && limitTab.getAttribute('aria-selected') !== 'true') {
      limitTab.click();
      await waitForAnimationFrame();
    }
  }

  /**
   * 解析限价单状态
   */
  private async resolveLimitOrderState(
    root: HTMLElement,
  ): Promise<'empty' | 'non-empty' | 'unknown'> {
    const deadline = Date.now() + LIMIT_STATE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const state = this.detectLimitOrderState(root);
      if (state !== 'unknown') {
        return state;
      }

      await delay(LIMIT_STATE_POLL_INTERVAL_MS);
    }

    return 'unknown';
  }

  /**
   * 检测限价单状态
   */
  private detectLimitOrderState(root: HTMLElement): 'empty' | 'non-empty' | 'unknown' {
    const container = this.domController.getLimitOrdersContainer(root);
    if (!container) {
      console.log('[dddd-alpah-extension] Limit orders container not found');
      return 'unknown';
    }

    const locale = this.domController.getPageLocale();
    const emptyLabel = locale === 'zh-CN' ? '无进行中的订单' : 'No Ongoing Orders';
    const emptyNode = this.domController.findElementWithExactText(container, emptyLabel);
    if (emptyNode) {
      console.log('[dddd-alpah-extension] Limit orders container found empty');
      return 'empty';
    }

    const rowCandidates = container.querySelectorAll(
      '[data-row-index],[role="row"],table tbody tr',
    );
    for (const candidate of Array.from(rowCandidates)) {
      if (candidate.textContent && candidate.textContent.trim().length > 0) {
        console.log('[dddd-alpah-extension] Limit orders container found non-empty');
        return 'non-empty';
      }
    }
    console.log('[dddd-alpah-extension] Limit orders container unknown');

    return 'unknown';
  }

  /**
   * 配置限价单
   * @param params 配置参数
   * @returns 买入量
   */
  private async configureLimitOrder(params: LimitOrderParams): Promise<number> {
    const { price, buyPriceOffset, sellPriceOffset, availableUsdt, orderPanel } = params;

    const clampedBuyOffset = clampPriceOffsetPercent(buyPriceOffset);
    const clampedSellOffset = clampPriceOffsetPercent(sellPriceOffset);

    const buyPrice = price * (1 + clampedBuyOffset / 100);
    const sellPrice = price * (1 + clampedSellOffset / 100);
    const safeSellPrice = sellPrice > 0 ? sellPrice : 0;

    const buyPriceValue = this.formatNumberFixedDecimals(buyPrice, 8);
    const sellPriceValue = this.formatNumberFixedDecimals(safeSellPrice, 8);

    await this.ensureLimitOrderMode(orderPanel);

    const delayConfig = this.getConfigureLimitOrderDelay();

    const priceInput = orderPanel.querySelector<HTMLInputElement>('#limitPrice');
    if (!priceInput) {
      throw new Error('Limit price input not found.');
    }
    await waitRandomDelay(delayConfig.min, delayConfig.max);
    this.setReactInputValue(priceInput, buyPriceValue);
    await waitForAnimationFrame();

    const toggleChanged = this.ensureReverseOrderToggle(orderPanel);
    if (toggleChanged) {
      await waitForAnimationFrame();
    }
    await waitRandomDelay(delayConfig.min, delayConfig.max);

    const slider = orderPanel.querySelector<HTMLInputElement>('input.bn-slider');
    if (!slider) {
      throw new Error('Order amount slider not found.');
    }
    console.log('[dddd-alpah-extension] Setting slider to 100%');
    slider.focus();
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForAnimationFrame();
    await waitRandomDelay(delayConfig.min, delayConfig.max);

    const locale = this.domController.getPageLocale();
    const reversePricePlaceholder = locale === 'zh-CN' ? '限价卖出' : 'Limit Sell';
    const reversePriceInput = orderPanel.querySelector<HTMLInputElement>(
      `#limitTotal[placeholder="${reversePricePlaceholder}"]`,
    );
    if (!reversePriceInput) {
      console.error('[dddd-alpah-extension] Reverse order price input not found');
      throw new Error('Reverse order price input not found.');
    }
    console.log('[dddd-alpah-extension] 设置卖出价格:', sellPriceValue);
    this.setReactInputValue(reversePriceInput, sellPriceValue);
    await waitForAnimationFrame();
    await waitRandomDelay(delayConfig.min, delayConfig.max);

    const buyButton = orderPanel.querySelector<HTMLButtonElement>('button.bn-button__buy');
    if (!buyButton) {
      console.error('[dddd-alpah-extension] Buy button not found');
      throw new Error('Buy button not found.');
    }

    console.log('[dddd-alpah-extension] Clicking buy button');
    buyButton.click();
    this.scheduleOrderConfirmationClick();

    return availableUsdt;
  }

  /**
   * 确保处于限价单模式
   */
  private async ensureLimitOrderMode(orderPanel: HTMLElement): Promise<void> {
    const buyTab = this.domController.findOrderPanelTab(orderPanel, '#bn-tab-0.bn-tab__buySell');
    if (!buyTab) {
      console.error('[dddd-alpah-extension] Buy tab not found');
      throw new Error('Buy tab not found.');
    }

    if (buyTab.getAttribute('aria-selected') !== 'true') {
      console.log('[dddd-alpah-extension] Selecting buy tab');
      buyTab.click();
      await waitForAnimationFrame();
      await waitRandomDelay(200, 400);
    }

    const limitTab =
      this.domController.findOrderPanelTab(orderPanel, '#bn-tab-limit') ??
      this.domController.findOrderPanelTab(orderPanel, '#bn-tab-LIMIT');
    if (!limitTab) {
      console.error('[dddd-alpah-extension] Limit tab not found');
      throw new Error('Limit tab not found.');
    }

    if (limitTab.getAttribute('aria-selected') !== 'true') {
      console.log('[dddd-alpah-extension] Selecting limit tab');
      limitTab.click();
      await waitForAnimationFrame();
      await waitRandomDelay(200, 400);
    }
  }

  /**
   * 确保反向订单开关打开
   */
  private ensureReverseOrderToggle(orderPanel: HTMLElement): boolean {
    const locale = this.domController.getPageLocale();
    const labelText = locale === 'zh-CN' ? '反向订单' : 'Reverse Order';
    const label = this.domController.findElementWithExactText(orderPanel, labelText);
    if (!label) {
      throw new Error(
        '反向订单开关没找到,通常是因为币安网页没有更新导致的,强制刷新一下页面 (Windows/Linux: Ctrl+Shift+R, Mac: Cmd+Shift+R)',
      );
    }

    let toggle: HTMLElement | null = null;
    if (
      label.previousElementSibling instanceof HTMLElement &&
      label.previousElementSibling.getAttribute('role') === 'checkbox'
    ) {
      toggle = label.previousElementSibling;
    }

    if (!toggle) {
      toggle = label.parentElement?.querySelector('[role="checkbox"]') ?? null;
    }

    if (!(toggle instanceof HTMLElement)) {
      throw new Error(
        '反向订单开关没找到,通常是因为币安网页没有更新导致的,强制刷新一下页面 (Windows/Linux: Ctrl+Shift+R, Mac: Cmd+Shift+R)',
      );
    }

    const isChecked = toggle.getAttribute('aria-checked') === 'true';
    if (!isChecked) {
      toggle.click();
    }

    return !isChecked;
  }

  /**
   * 安排订单确认按钮点击
   */
  private scheduleOrderConfirmationClick(): void {
    const ATTEMPT_DURATION_MS = 2_000;
    const ATTEMPT_INTERVAL_MS = 100;
    const INITIAL_DELAY_MS = randomIntInRange(500, 800);

    console.log(
      '[dddd-alpah-extension] Scheduling confirmation click with delay:',
      INITIAL_DELAY_MS,
      'ms',
    );

    const runAttempts = () => {
      const start = Date.now();
      let attemptCount = 0;

      const attempt = () => {
        attemptCount++;
        const confirmButton = this.domController.findOrderConfirmationButton();
        if (confirmButton) {
          console.log(
            '[dddd-alpah-extension] Confirm button found after',
            attemptCount,
            'attempts, clicking',
          );
          confirmButton.click();

          // 点击确认按钮后,启动订单监控
          window.setTimeout(() => {
            if (this.monitoringEnabled && this.orderMonitor) {
              this.orderMonitor.enableMonitoring();
              this.orderMonitor.startMonitoring();
              console.log(
                '[dddd-alpah-extension] Order monitoring enabled after confirmation click',
              );
            }
          }, 500); // 等待500ms让订单出现在列表中

          return;
        }

        if (Date.now() - start < ATTEMPT_DURATION_MS) {
          window.setTimeout(attempt, ATTEMPT_INTERVAL_MS);
        } else {
          console.warn(
            '[dddd-alpah-extension] Confirm button not found after',
            attemptCount,
            'attempts',
          );
        }
      };

      attempt();
    };

    window.setTimeout(runAttempts, INITIAL_DELAY_MS);
  }

  /**
   * 提取可用USDT余额
   */
  private async extractAvailableUsdt(orderPanel: HTMLElement): Promise<number | null> {
    await this.ensureLimitOrderMode(orderPanel);

    const locale = this.domController.getPageLocale();
    const labelText = locale === 'zh-CN' ? '可用' : 'Available';
    const label = this.domController.findElementWithExactText(orderPanel, labelText);

    if (!label) {
      return null;
    }

    let sibling = label.nextElementSibling as HTMLElement | null;
    while (sibling) {
      const text = sibling.textContent?.trim();
      if (text) {
        const normalized = text.replace(/[^0-9.,-]/g, '');
        if (normalized) {
          const value = parseNumericValue(normalized);
          if (value !== null) {
            return value;
          }
        }
      }
      sibling = sibling.nextElementSibling as HTMLElement | null;
    }

    return null;
  }

  /**
   * 设置React输入框的值
   */
  private setReactInputValue(input: HTMLInputElement, value: string): void {
    input.focus();

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * 格式化数字为固定小数位数
   */
  private formatNumberFixedDecimals(value: number, fractionDigits: number): string {
    if (!Number.isFinite(value)) {
      return (0).toFixed(fractionDigits);
    }

    return value.toFixed(fractionDigits);
  }

  /**
   * 获取配置限价单时的延迟配置
   */
  private getConfigureLimitOrderDelay(): { min: number; max: number } {
    if (this.intervalMode === 'fast') {
      return { min: 300, max: 600 };
    }
    return { min: 500, max: 1_000 };
  }
}
