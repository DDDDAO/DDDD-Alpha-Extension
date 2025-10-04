import { DEFAULT_POINTS_FACTOR, DEFAULT_PRICE_OFFSET_PERCENT } from '../config/defaults.js';
import { SELECTORS } from '../config/selectors.js';
import { postRuntimeMessage, type RuntimeMessage, type TaskResultMeta } from '../lib/messages.js';

const POLLING_INTERVAL_MS = 1_000;
const ORDER_PLACEMENT_COOLDOWN_MS = 5_000;
const LIMIT_STATE_TIMEOUT_MS = 2_000;
const LIMIT_STATE_POLL_INTERVAL_MS = 100;

const STORAGE_KEY = 'dddd-alpha-extension::state';
const MIN_PRICE_OFFSET_PERCENT = 0;
const MAX_PRICE_OFFSET_PERCENT = 5;

function getPageLocale(): 'en' | 'zh-CN' {
  const href = window.location.href;
  if (href.includes('/zh-CN/')) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Detected locale: zh-CN');
    return 'zh-CN';
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Detected locale: en (default)');
  return 'en';
}

let pollingTimerId: number | undefined;
let evaluationInProgress = false;
let loginErrorDispatched = false;
let lastOrderPlacedAt = 0;
let runtimeUnavailable = false;
let automationEnabled = false;
let automationStateWatcherInitialized = false;
let priceOffsetPercent = DEFAULT_PRICE_OFFSET_PERCENT;
let pointsFactor = DEFAULT_POINTS_FACTOR;

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Received message:', message.type);

  if (message.type === 'RUN_TASK') {
    void handleAutomation().catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpha-extension] RUN_TASK error:', messageText);
      void postRuntimeMessage({
        type: 'TASK_ERROR',
        payload: { message: messageText },
      });
    });

    sendResponse({ acknowledged: true });
    return true;
  }

  if (message.type === 'RUN_TASK_ONCE') {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Starting manual run');
    void handleManualRun().catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpha-extension] RUN_TASK_ONCE error:', messageText);
      void postRuntimeMessage({
        type: 'TASK_ERROR',
        payload: { message: messageText },
      });
    });

    sendResponse({ acknowledged: true });
    return true;
  }

  if (message.type === 'REQUEST_TOKEN_SYMBOL') {
    const tokenSymbol = extractTokenSymbol();
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Token symbol requested:', tokenSymbol);
    sendResponse({
      acknowledged: Boolean(tokenSymbol),
      tokenSymbol: tokenSymbol ?? null,
    });
    return true;
  }

  if (message.type === 'REQUEST_CURRENT_BALANCE') {
    const panel = getTradingFormPanel();
    let balanceValue: number | null = null;
    if (panel) {
      const extracted = extractAvailableUsdt(panel);
      if (extracted !== null && Number.isFinite(extracted)) {
        balanceValue = extracted;
      }
    }

    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Current balance requested:', balanceValue);
    sendResponse({
      acknowledged: balanceValue !== null,
      currentBalance: balanceValue ?? null,
    });
    return true;
  }

  return false;
});

initializeAutomationStateWatcher();
void sendInitialBalanceUpdate();

async function sendInitialBalanceUpdate(): Promise<void> {
  await delay(2_000);

  const tokenSymbol = extractTokenSymbol();
  const panel = getTradingFormPanel();
  let currentBalance: number | undefined;

  if (panel) {
    const extracted = extractAvailableUsdt(panel);
    if (extracted !== null && Number.isFinite(extracted)) {
      currentBalance = extracted;
    }
  }

  if (currentBalance !== undefined || tokenSymbol) {
    await dispatchRuntimeMessage({
      type: 'BALANCE_UPDATE',
      payload: {
        currentBalance,
        tokenSymbol: tokenSymbol ?? undefined,
      },
    });
  }
}

async function handleAutomation(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    '[dddd-alpha-extension] handleAutomation started, automationEnabled:',
    automationEnabled,
  );

  const needsLogin = checkForLoginPrompt();
  if (needsLogin) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpha-extension] Login required detected');
    await dispatchRuntimeMessage({
      type: 'TASK_ERROR',
      payload: { message: 'Login required. Please authenticate manually.' },
    });
    loginErrorDispatched = true;
    return;
  }

  loginErrorDispatched = false;
  if (!automationEnabled) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Automation disabled, tearing down polling');
    teardownPolling();
    return;
  }

  await ensurePolling();
}

async function handleManualRun(): Promise<void> {
  if (evaluationInProgress) {
    throw new Error('Automation is busy; try again shortly.');
  }

  await runEvaluationCycle(false, { placeOrder: false });
}

function checkForLoginPrompt(): boolean {
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

async function ensurePolling(): Promise<void> {
  if (!isExtensionContextValid()) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpha-extension] Extension context invalid, tearing down');
    teardownPolling();
    return;
  }

  if (!automationEnabled) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Automation not enabled, tearing down');
    teardownPolling();
    return;
  }

  if (pollingTimerId === undefined) {
    // eslint-disable-next-line no-console
    console.log(
      '[dddd-alpha-extension] Starting polling with interval:',
      POLLING_INTERVAL_MS,
      'ms',
    );
    pollingTimerId = window.setInterval(() => {
      void runEvaluationCycle(true, { placeOrder: true });
    }, POLLING_INTERVAL_MS);
  }

  await runEvaluationCycle(true, { placeOrder: true });
}

interface EvaluationOptions {
  placeOrder?: boolean;
}

async function runEvaluationCycle(
  requireAutomationEnabled = true,
  options: EvaluationOptions = {},
): Promise<void> {
  if (!isExtensionContextValid()) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpha-extension] Extension context invalid in evaluation cycle');
    teardownPolling();
    return;
  }

  if (evaluationInProgress) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Evaluation already in progress, skipping');
    return;
  }

  evaluationInProgress = true;
  // eslint-disable-next-line no-console
  console.log(
    '[dddd-alpha-extension] Starting evaluation cycle, placeOrder:',
    options.placeOrder !== false,
  );

  try {
    const placeOrder = options.placeOrder !== false;

    if (requireAutomationEnabled && !automationEnabled) {
      // eslint-disable-next-line no-console
      console.log('[dddd-alpha-extension] Automation disabled during evaluation, tearing down');
      teardownPolling();
      return;
    }

    if (checkForLoginPrompt()) {
      if (!loginErrorDispatched) {
        // eslint-disable-next-line no-console
        console.warn('[dddd-alpha-extension] Login prompt detected during evaluation');
        await dispatchRuntimeMessage({
          type: 'TASK_ERROR',
          payload: { message: 'Login required. Please authenticate manually.' },
        });
        loginErrorDispatched = true;
      }
      return;
    }

    loginErrorDispatched = false;

    const result = await executePrimaryTask({ placeOrder });
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Task completed:', result.success, result.details);
    await dispatchRuntimeMessage({
      type: 'TASK_COMPLETE',
      payload: result,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Evaluation cycle error:', messageText);
    await dispatchRuntimeMessage({
      type: 'TASK_ERROR',
      payload: { message: messageText },
    });
  } finally {
    evaluationInProgress = false;
  }
}

interface TaskExecutionOptions {
  placeOrder?: boolean;
}

async function executePrimaryTask(
  options: TaskExecutionOptions = {},
): Promise<{ success: boolean; details?: string; meta?: TaskResultMeta }> {
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] executePrimaryTask started');

  const panel = findTradeHistoryPanel();
  if (!panel) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Trade history panel not found');
    return {
      success: false,
      details: 'Unable to locate limit trade history panel.',
    };
  }

  const trades = extractTradeHistorySamples(panel);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Extracted trades:', trades.length);
  if (!trades.length) {
    return { success: false, details: 'No limit trade entries detected.' };
  }

  const tokenSymbol = extractTokenSymbol();
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Token symbol:', tokenSymbol);

  const averagePrice = calculateVolumeWeightedAverage(trades);
  if (averagePrice === null) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Failed to calculate VWAP');
    return { success: false, details: 'Failed to compute average price.' };
  }

  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Calculated VWAP:', averagePrice);

  const tradeCount = trades.length;
  const precision = averagePrice < 1 ? 8 : 6;
  const formattedAverage = averagePrice.toFixed(precision);
  const detailParts = [`VWAP across ${tradeCount} trades: ${formattedAverage}`];

  const shouldPlaceOrder = options.placeOrder !== false;
  let orderResult: OrderPlacementResult | undefined;
  let buyVolumeDelta: number | undefined;
  let successfulTradesDelta: number | undefined;
  let currentBalanceSnapshot: number | undefined;

  if (shouldPlaceOrder) {
    // eslint-disable-next-line no-console
    console.log(
      '[dddd-alpha-extension] Attempting to place order, priceOffsetPercent:',
      priceOffsetPercent,
    );
    try {
      orderResult = await ensureLimitOrderPlaced({
        price: averagePrice,
        priceOffsetPercent,
      });
      // eslint-disable-next-line no-console
      console.log('[dddd-alpha-extension] Order result:', orderResult.status, orderResult.reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpha-extension] Order placement error:', message);
      return { success: false, details: `Order placement failed: ${message}` };
    }

    if (orderResult) {
      if (orderResult.status === 'placed') {
        const placedVolume = orderResult.buyVolume;
        if (typeof placedVolume === 'number' && Number.isFinite(placedVolume) && placedVolume > 0) {
          const scaledVolume = placedVolume * Math.max(1, pointsFactor);
          buyVolumeDelta = scaledVolume;
          detailParts.push(
            `Placed limit and reverse orders. Recorded buy volume: ${scaledVolume.toFixed(2)} USDT.`,
          );
        } else {
          detailParts.push('Placed limit and reverse orders.');
        }
        successfulTradesDelta = 1;
      } else {
        const reason = orderResult.reason?.trim();
        if (reason) {
          detailParts.push(reason);
        }
      }
    }
  } else {
    detailParts.push('Order placement skipped (manual refresh).');
  }

  if (orderResult?.status === 'placed') {
    await delay(1_500);
  }

  const balancePanel = getTradingFormPanel();
  if (balancePanel) {
    const balanceValue = extractAvailableUsdt(balancePanel);
    if (balanceValue !== null && Number.isFinite(balanceValue)) {
      currentBalanceSnapshot = balanceValue;
    }
  }

  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Limit VWAP', {
    averagePrice,
    formattedAverage,
    tokenSymbol: tokenSymbol ?? null,
    buyVolumeDelta: buyVolumeDelta ?? null,
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

  if (buyVolumeDelta !== undefined) {
    meta.buyVolumeDelta = buyVolumeDelta;
  }

  if (successfulTradesDelta !== undefined) {
    meta.successfulTradesDelta = successfulTradesDelta;
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

async function dispatchRuntimeMessage(message: RuntimeMessage): Promise<void> {
  if (!isExtensionContextValid()) {
    teardownPolling();
    return;
  }

  try {
    await postRuntimeMessage(message);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpha-extension] Failed to post runtime message', error);

    const messageText = error instanceof Error ? error.message : String(error ?? '');
    if (/extension context invalidated/i.test(messageText)) {
      runtimeUnavailable = true;
      teardownPolling();
    }
  }
}

interface TradeHistorySample {
  time: string;
  price: number;
  quantity: number;
}

function findTradeHistoryPanel(): HTMLElement | null {
  if (SELECTORS.tradeHistoryPanel) {
    const node = document.querySelector(SELECTORS.tradeHistoryPanel);
    if (node instanceof HTMLElement) {
      return node;
    }
  }

  const fallbackPanel = document.querySelector('[class*="order-4"]');
  if (fallbackPanel instanceof HTMLElement) {
    return fallbackPanel;
  }

  const grids = Array.from(document.querySelectorAll('.ReactVirtualized__Grid'));
  for (const grid of grids) {
    const host = grid.closest('[class*="order-4"]');
    if (host instanceof HTMLElement) {
      return host;
    }
  }

  return null;
}

function extractTradeHistorySamples(panel: HTMLElement, limit = 60): TradeHistorySample[] {
  const grid = panel.querySelector('.ReactVirtualized__Grid');
  if (!grid) {
    return [];
  }

  const rowSelector = SELECTORS.tradeHistoryRow ?? '[role="gridcell"]';
  const rowNodes = Array.from(grid.querySelectorAll(rowSelector)).slice(0, limit);

  const entries: TradeHistorySample[] = [];
  for (const node of rowNodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const columns = Array.from(node.querySelectorAll('div'));
    if (columns.length < 3) {
      continue;
    }

    const time = columns[0].textContent?.trim() ?? '';
    const priceText = columns[1].textContent ?? '';
    const quantityText = columns[2].textContent ?? '';

    const price = parseNumericValue(priceText);
    const quantity = parseNumericValue(quantityText);

    if (price === null || quantity === null) {
      continue;
    }

    entries.push({ time, price, quantity });
  }

  return entries;
}

function extractTokenSymbol(): string | null {
  const selector = SELECTORS.tokenSymbol;
  if (selector) {
    const node = document.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) {
      return text;
    }
  }

  const orderHeader = document.querySelector('.order-1');
  if (orderHeader instanceof HTMLElement) {
    const primaryCandidate = orderHeader.querySelector(
      'div.text-\\[20px\\].font-\\[600\\].leading-\\[24px\\].text-PrimaryText',
    );
    const text = primaryCandidate?.textContent?.trim();
    if (text) {
      return text;
    }

    const fallbackNodes = Array.from(orderHeader.querySelectorAll<HTMLElement>('div'));
    for (const candidate of fallbackNodes) {
      const className = typeof candidate.className === 'string' ? candidate.className : '';
      if (className.includes('text-[20px]') && className.includes('font-[600]')) {
        const candidateText = candidate.textContent?.trim();
        if (candidateText) {
          return candidateText;
        }
      }
    }
  }

  return null;
}

function calculateVolumeWeightedAverage(trades: TradeHistorySample[]): number | null {
  let weightedSum = 0;
  let volumeSum = 0;

  for (const trade of trades) {
    if (!Number.isFinite(trade.price) || !Number.isFinite(trade.quantity)) {
      continue;
    }

    weightedSum += trade.price * trade.quantity;
    volumeSum += trade.quantity;
  }

  if (volumeSum === 0) {
    return null;
  }

  return weightedSum / volumeSum;
}
type OrderPlacementStatus = 'placed' | 'skipped' | 'cooldown';

interface OrderPlacementResult {
  status: OrderPlacementStatus;
  reason?: string;
  buyVolume?: number;
  availableBalanceBeforeOrder?: number;
}

async function ensureLimitOrderPlaced(params: {
  price: number;
  priceOffsetPercent: number;
}): Promise<OrderPlacementResult> {
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] ensureLimitOrderPlaced started');

  const openOrdersRoot = getOpenOrdersRoot();
  if (!openOrdersRoot) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Open orders root not found');
    throw new Error('Open orders section unavailable.');
  }

  await ensureOpenOrdersTabs(openOrdersRoot);

  const orderState = await resolveLimitOrderState(openOrdersRoot);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Order state:', orderState);

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
  const timeSinceLastOrder = now - lastOrderPlacedAt;
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Time since last order:', timeSinceLastOrder, 'ms');

  if (timeSinceLastOrder < ORDER_PLACEMENT_COOLDOWN_MS) {
    return {
      status: 'cooldown',
      reason: 'Waiting for previous order placement to settle.',
    };
  }

  const orderPanel = getTradingFormPanel();
  if (!orderPanel) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Trading form panel not found');
    throw new Error('Trading form panel not found.');
  }

  const availableUsdt = extractAvailableUsdt(orderPanel);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Available USDT:', availableUsdt);

  if (availableUsdt === null) {
    throw new Error('Unable to determine available USDT balance.');
  }

  if (availableUsdt <= 0) {
    throw new Error('Available USDT balance is zero.');
  }

  const buyVolume = await configureLimitOrder({
    price: params.price,
    priceOffsetPercent: params.priceOffsetPercent,
    availableUsdt,
    orderPanel,
  });

  lastOrderPlacedAt = Date.now();

  return {
    status: 'placed',
    buyVolume,
    availableBalanceBeforeOrder: availableUsdt,
  };
}

async function ensureOpenOrdersTabs(root: HTMLElement): Promise<void> {
  const locale = getPageLocale();
  const openOrdersLabel = locale === 'zh-CN' ? '当前委托' : 'Open Orders';
  const limitLabel = locale === 'zh-CN' ? '限价' : 'Limit';

  const openOrdersTab = getTabByLabel(root, openOrdersLabel);
  if (openOrdersTab && openOrdersTab.getAttribute('aria-selected') !== 'true') {
    openOrdersTab.click();
    await waitForAnimationFrame();
  }

  const limitTab = getTabByLabel(root, limitLabel);
  if (limitTab && limitTab.getAttribute('aria-selected') !== 'true') {
    limitTab.click();
    await waitForAnimationFrame();
  }
}

function getTabByLabel(root: HTMLElement, label: string): HTMLElement | null {
  const normalizedLabel = label.trim().toLowerCase();
  const tabs = Array.from(root.querySelectorAll<HTMLElement>('[role="tab"]'));
  return (
    tabs.find((tab) => {
      const text = tab.textContent?.trim().toLowerCase();
      if (!text) {
        return false;
      }
      return text === normalizedLabel || text.startsWith(normalizedLabel);
    }) ?? null
  );
}

async function resolveLimitOrderState(
  root: HTMLElement,
): Promise<'empty' | 'non-empty' | 'unknown'> {
  const deadline = Date.now() + LIMIT_STATE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const state = detectLimitOrderState(root);
    if (state !== 'unknown') {
      return state;
    }

    await delay(LIMIT_STATE_POLL_INTERVAL_MS);
  }

  return 'unknown';
}

function detectLimitOrderState(root: HTMLElement): 'empty' | 'non-empty' | 'unknown' {
  const container = getLimitOrdersContainer(root);
  if (!container) {
    console.log('[dddd-alpha-extension] Limit orders container not found');
    return 'unknown';
  }

  const locale = getPageLocale();
  const emptyLabel = locale === 'zh-CN' ? '无进行中的订单' : 'No Ongoing Orders';
  const emptyNode = findElementWithExactText(container, emptyLabel);
  if (emptyNode) {
    console.log('[dddd-alpha-extension] Limit orders container found empty');
    return 'empty';
  }

  const rowCandidates = container.querySelectorAll('[data-row-index],[role="row"],table tbody tr');
  for (const candidate of Array.from(rowCandidates)) {
    if (candidate.textContent && candidate.textContent.trim().length > 0) {
      console.log('[dddd-alpha-extension] Limit orders container found non-empty');
      return 'non-empty';
    }
  }
  console.log('[dddd-alpha-extension] Limit orders container unknown');

  return 'unknown';
}

function getLimitOrdersContainer(root: HTMLElement): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('div'));
  for (const candidate of candidates) {
    const className = candidate.className ?? '';
    if (
      className.includes('pb-[108px]') &&
      className.includes('flex-col') &&
      className.includes('overflow-auto')
    ) {
      return candidate;
    }
  }
  return null;
}

function getOpenOrdersRoot(): HTMLElement | null {
  const node = document.querySelector('.trd-order');
  return node instanceof HTMLElement ? node : null;
}

function getTradingFormPanel(): HTMLElement | null {
  const node = document.querySelector('.order-5');
  return node instanceof HTMLElement ? node : null;
}

function teardownPolling(): void {
  if (pollingTimerId !== undefined) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Tearing down polling');
    clearInterval(pollingTimerId);
    pollingTimerId = undefined;
  }

  evaluationInProgress = false;
}

function isExtensionContextValid(): boolean {
  if (runtimeUnavailable) {
    return false;
  }

  return typeof chrome.runtime?.id === 'string' && chrome.runtime.id.length > 0;
}

function initializeAutomationStateWatcher(): void {
  if (automationStateWatcherInitialized) {
    return;
  }

  automationStateWatcherInitialized = true;
  void refreshAutomationState();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !(STORAGE_KEY in changes)) {
      return;
    }

    const newValue = changes[STORAGE_KEY]?.newValue;
    applyAutomationState(newValue);
  });
}

function applyAutomationState(value: unknown): void {
  let nextEnabled = false;
  let nextPriceOffset = DEFAULT_PRICE_OFFSET_PERCENT;
  let nextPointsFactor = DEFAULT_POINTS_FACTOR;

  if (value && typeof value === 'object') {
    const record = value as { isEnabled?: unknown; settings?: unknown };
    nextEnabled = record.isEnabled === true;

    if (record.settings && typeof record.settings === 'object') {
      const candidate = (record.settings as { priceOffsetPercent?: unknown }).priceOffsetPercent;
      nextPriceOffset = extractPriceOffsetPercent(candidate);

      const factorCandidate = (record.settings as { pointsFactor?: unknown }).pointsFactor;
      nextPointsFactor = extractPointsFactor(factorCandidate);
    }
  }

  const stateChanged =
    automationEnabled !== nextEnabled ||
    priceOffsetPercent !== nextPriceOffset ||
    pointsFactor !== nextPointsFactor;

  if (stateChanged) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpha-extension] Automation state updated:', {
      enabled: nextEnabled,
      priceOffsetPercent: nextPriceOffset,
      pointsFactor: nextPointsFactor,
    });
  }

  automationEnabled = nextEnabled;
  priceOffsetPercent = nextPriceOffset;
  pointsFactor = nextPointsFactor;

  if (!automationEnabled) {
    teardownPolling();
  }
}

function extractPriceOffsetPercent(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }

  if (typeof value === 'number') {
    return clampPriceOffsetPercent(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }

  return clampPriceOffsetPercent(parsed);
}

const MIN_POINTS_FACTOR = 1;
const MAX_POINTS_FACTOR = 1000;

function extractPointsFactor(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_POINTS_FACTOR;
  }

  if (typeof value === 'number') {
    return clampPointsFactor(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_POINTS_FACTOR;
  }

  return clampPointsFactor(parsed);
}

function clampPriceOffsetPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }

  if (value < MIN_PRICE_OFFSET_PERCENT) {
    return MIN_PRICE_OFFSET_PERCENT;
  }

  if (value > MAX_PRICE_OFFSET_PERCENT) {
    return MAX_PRICE_OFFSET_PERCENT;
  }

  return value;
}

function clampPointsFactor(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_FACTOR;
  }

  const floored = Math.floor(value);

  if (floored < MIN_POINTS_FACTOR) {
    return MIN_POINTS_FACTOR;
  }

  if (floored > MAX_POINTS_FACTOR) {
    return MAX_POINTS_FACTOR;
  }

  return floored;
}

async function refreshAutomationState(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve();
        return;
      }

      applyAutomationState(result[STORAGE_KEY]);
      resolve();
    });
  });
}

async function configureLimitOrder(params: {
  price: number;
  priceOffsetPercent: number;
  availableUsdt: number;
  orderPanel: HTMLElement;
}): Promise<number> {
  const { price, priceOffsetPercent, availableUsdt, orderPanel } = params;

  const clampedOffsetPercent = clampPriceOffsetPercent(priceOffsetPercent);
  const offsetFactor = clampedOffsetPercent / 100;
  const buyPrice = price * (1 + offsetFactor);
  const reversePriceBase = price * (1 - offsetFactor);
  const reversePrice = reversePriceBase > 0 ? reversePriceBase : 0;
  const buyPriceValue = formatNumberFixedDecimals(buyPrice, 8);
  const reversePriceValue = formatNumberFixedDecimals(reversePrice, 8);

  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Configuring order:', {
    basePrice: price,
    offsetPercent: clampedOffsetPercent,
    buyPrice: buyPriceValue,
    reversePrice: reversePriceValue,
    availableUsdt,
  });

  const priceInput = orderPanel.querySelector<HTMLInputElement>('#limitPrice');
  if (!priceInput) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Limit price input not found');
    throw new Error('Limit price input not found.');
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Setting buy price:', buyPriceValue);
  await waitRandomDelay();
  setReactInputValue(priceInput, buyPriceValue);
  await waitForAnimationFrame();

  const toggleChanged = ensureReverseOrderToggle(orderPanel);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Reverse order toggle changed:', toggleChanged);
  if (toggleChanged) {
    await waitForAnimationFrame();
  }
  await waitRandomDelay();

  const slider = orderPanel.querySelector<HTMLInputElement>('input.bn-slider');
  if (!slider) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Order amount slider not found');
    throw new Error('Order amount slider not found.');
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Setting slider to 100%');
  slider.focus();
  slider.value = '100';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  await waitForAnimationFrame();
  await waitRandomDelay();

  const locale = getPageLocale();
  const reversePricePlaceholder = locale === 'zh-CN' ? '限价卖出' : 'Limit Sell';
  const reversePriceInput = orderPanel.querySelector<HTMLInputElement>(
    `#limitTotal[placeholder="${reversePricePlaceholder}"]`,
  );
  if (!reversePriceInput) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Reverse order price input not found');
    throw new Error('Reverse order price input not found.');
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Setting reverse price:', reversePriceValue);
  setReactInputValue(reversePriceInput, reversePriceValue);
  await waitForAnimationFrame();
  await waitRandomDelay();

  const buyButton = orderPanel.querySelector<HTMLButtonElement>('button.bn-button__buy');
  if (!buyButton) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpha-extension] Buy button not found');
    throw new Error('Buy button not found.');
  }

  // eslint-disable-next-line no-console
  console.log('[dddd-alpha-extension] Clicking buy button');
  buyButton.click();
  scheduleOrderConfirmationClick();

  return availableUsdt;
}

function ensureReverseOrderToggle(orderPanel: HTMLElement): boolean {
  const locale = getPageLocale();
  const labelText = locale === 'zh-CN' ? '反向订单' : 'Reverse Order';
  const label = findElementWithExactText(orderPanel, labelText);
  if (!label) {
    throw new Error('Reverse order toggle not found.');
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
    throw new Error('Reverse order toggle not found.');
  }

  const isChecked = toggle.getAttribute('aria-checked') === 'true';
  if (!isChecked) {
    toggle.click();
  }

  return !isChecked;
}

function scheduleOrderConfirmationClick(): void {
  const ATTEMPT_DURATION_MS = 2_000;
  const ATTEMPT_INTERVAL_MS = 100;
  const INITIAL_DELAY_MS = randomIntInRange(300, 800);

  // eslint-disable-next-line no-console
  console.log(
    '[dddd-alpha-extension] Scheduling confirmation click with delay:',
    INITIAL_DELAY_MS,
    'ms',
  );

  const runAttempts = () => {
    const start = Date.now();
    let attemptCount = 0;

    const attempt = () => {
      attemptCount++;
      const confirmButton = findOrderConfirmationButton();
      if (confirmButton) {
        // eslint-disable-next-line no-console
        console.log(
          '[dddd-alpha-extension] Confirm button found after',
          attemptCount,
          'attempts, clicking',
        );
        confirmButton.click();
        return;
      }

      if (Date.now() - start < ATTEMPT_DURATION_MS) {
        window.setTimeout(attempt, ATTEMPT_INTERVAL_MS);
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          '[dddd-alpha-extension] Confirm button not found after',
          attemptCount,
          'attempts',
        );
      }
    };

    attempt();
  };

  window.setTimeout(runAttempts, INITIAL_DELAY_MS);
}

function findOrderConfirmationButton(): HTMLButtonElement | null {
  const candidates = new Set<HTMLButtonElement>();
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>('dialog button, div[role="dialog"] button'),
  )) {
    candidates.add(button);
  }

  const fallback = document.querySelector<HTMLButtonElement>(
    '#__APP > div:nth-of-type(3) > div > div > button',
  );
  if (fallback) {
    candidates.add(fallback);
  }

  for (const candidate of candidates) {
    const text = candidate.textContent?.trim().toLowerCase();
    const locale = getPageLocale();
    const confirmLabel = locale === 'zh-CN' ? '确认' : 'Confirm';
    if (text === confirmLabel) {
      return candidate;
    }
  }

  return null;
}

function setReactInputValue(input: HTMLInputElement, value: string): void {
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

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function formatNumberFixedDecimals(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) {
    return (0).toFixed(fractionDigits);
  }

  return value.toFixed(fractionDigits);
}

function extractAvailableUsdt(orderPanel: HTMLElement): number | null {
  const locale = getPageLocale();
  const labelText = locale === 'zh-CN' ? '可用' : 'Available';
  const label = findElementWithExactText(orderPanel, labelText);

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

function findElementWithExactText(root: ParentNode, text: string): HTMLElement | null {
  const target = text.trim();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    if (node.textContent?.trim() === target) {
      return node;
    }
  }

  return null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function waitRandomDelay(min = 500, max = 1_000): Promise<void> {
  const duration = randomIntInRange(min, max);
  return delay(duration);
}

function randomIntInRange(min: number, max: number): number {
  const clampedMin = Math.ceil(min);
  const clampedMax = Math.floor(max);
  return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}

function parseNumericValue(raw: string): number | null {
  const sanitized = raw.replace(/[,\s]/g, '');
  if (!sanitized) {
    return null;
  }

  const match = sanitized.match(/^(-?\d+(?:\.\d+)?)([KMB]?)$/i);
  if (!match) {
    return null;
  }

  let value = Number(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const suffix = match[2]?.toUpperCase() ?? '';
  switch (suffix) {
    case 'K':
      value *= 1_000;
      break;
    case 'M':
      value *= 1_000_000;
      break;
    case 'B':
      value *= 1_000_000_000;
      break;
    default:
      break;
  }

  return value;
}
