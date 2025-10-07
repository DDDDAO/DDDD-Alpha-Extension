import {
  DEFAULT_BUY_PRICE_OFFSET_PERCENT,
  DEFAULT_INTERVAL_MODE,
  DEFAULT_POINTS_FACTOR,
  DEFAULT_POINTS_TARGET,
  DEFAULT_PRICE_OFFSET_PERCENT,
  DEFAULT_SELL_PRICE_OFFSET_PERCENT,
  FAST_MODE_MAX_DELAY,
  FAST_MODE_MIN_DELAY,
  type IntervalMode,
  MAX_SUCCESSFUL_TRADES,
  MEDIUM_MODE_MAX_DELAY,
  MEDIUM_MODE_MIN_DELAY,
  SUCCESSFUL_TRADES_LIMIT_MESSAGE,
} from '../config/defaults.js';
import { SELECTORS } from '../config/selectors.js';
import { STORAGE_KEY, TOKEN_DIRECTORY_STORAGE_KEY } from '../config/storageKey.js';
import { calculateAlphaPointStats } from '../lib/alphaPoints.js';
import { md5 } from '../lib/md5.js';
import {
  type FetchOrderHistoryResponse,
  type OrderHistorySnapshotPayload,
  postRuntimeMessage,
  type RuntimeMessage,
  type TaskResultMeta,
} from '../lib/messages.js';
import {
  type BinanceOrderHistoryResponse,
  buildOrderHistoryUrl,
  mergeOrderHistoryData,
  summarizeOrderHistoryData,
} from '../lib/orderHistory.js';

const ORDER_PLACEMENT_COOLDOWN_MS = 5_000;
const LIMIT_STATE_TIMEOUT_MS = 2_000;
const LIMIT_STATE_POLL_INTERVAL_MS = 100;
const PENDING_ORDER_WARNING_DELAY_MS = 5_000;
const PENDING_ORDER_CHECK_INTERVAL_MS = 1_000;
const PENDING_ORDER_WARNING_ELEMENT_ID = 'dddd-alpha-pending-order-warning';

const MIN_PRICE_OFFSET_PERCENT = -5;
const MAX_PRICE_OFFSET_PERCENT = 5;

function getCookieValue(name: string): string | null {
  const pattern = new RegExp(`(?:^|;\\s*)${name}=([^;]*)`);
  const match = document.cookie.match(pattern);
  if (!match) {
    return null;
  }

  const value = match[1];
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveCsrfToken(): string | null {
  const cookieValue = getCookieValue('cr00');
  if (!cookieValue) {
    return null;
  }
  return md5(cookieValue);
}

function getPageLocale(): 'en' | 'zh-CN' {
  const href = window.location.href;
  if (href.includes('/zh-CN/')) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Detected locale: zh-CN');
    return 'zh-CN';
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Detected locale: en (default)');
  return 'en';
}

function invalidateTokenDirectoryCache(): void {
  cachedAlphaMultiplierMap = null;
  cachedAlphaMultiplierTimestamp = 0;
}

function extractTokenDirectory(value: unknown): Record<string, TokenDirectoryRecord> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const container = value as TokenDirectoryContainer;
  const directoryCandidate = container.directory ?? value;

  if (!directoryCandidate || typeof directoryCandidate !== 'object') {
    return null;
  }

  return directoryCandidate as Record<string, TokenDirectoryRecord>;
}

async function getAlphaMultiplierMap(): Promise<Record<string, number>> {
  const now = Date.now();
  if (
    cachedAlphaMultiplierMap &&
    now - cachedAlphaMultiplierTimestamp < MULTIPLIER_CACHE_DURATION_MS
  ) {
    return cachedAlphaMultiplierMap;
  }

  const directory = await new Promise<Record<string, TokenDirectoryRecord> | null>((resolve) => {
    chrome.storage.local.get(TOKEN_DIRECTORY_STORAGE_KEY, (result) => {
      resolve(extractTokenDirectory(result[TOKEN_DIRECTORY_STORAGE_KEY]));
    });
  });

  const alphaMap: Record<string, number> = {};

  if (directory) {
    for (const entry of Object.values(directory)) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const alphaIdRaw = typeof entry.alphaId === 'string' ? entry.alphaId.trim() : '';
      if (alphaIdRaw.length === 0) {
        continue;
      }

      const multiplierRaw = entry.mulPoint;
      const multiplier =
        typeof multiplierRaw === 'number' ? multiplierRaw : Number(multiplierRaw ?? NaN);
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        continue;
      }

      alphaMap[alphaIdRaw.toUpperCase()] = multiplier;
    }
  }

  cachedAlphaMultiplierMap = alphaMap;
  cachedAlphaMultiplierTimestamp = now;
  return alphaMap;
}

function lookupAlphaMultiplier(alphaMap: Record<string, number>, alphaId: string): number {
  if (alphaId.length === 0) {
    return 1;
  }

  const candidate = alphaMap[alphaId.toUpperCase()];
  if (!Number.isFinite(candidate) || candidate === undefined || candidate <= 0) {
    return 1;
  }

  return candidate;
}

async function performOrderHistoryRequest(
  targetUrl: string,
  csrfToken?: string | null,
): Promise<FetchOrderHistoryResponse> {
  if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
    return {
      success: false,
      message: 'Invalid order history URL',
    } satisfies FetchOrderHistoryResponse;
  }

  const resolvedToken = csrfToken && csrfToken.length > 0 ? csrfToken : resolveCsrfToken();
  if (!resolvedToken) {
    return {
      success: false,
      message: '请先登录币安',
    } satisfies FetchOrderHistoryResponse;
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        clienttype: 'web',
        csrftoken: resolvedToken,
        Accept: 'application/json, text/plain, */*',
      },
    });

    const status = response.status;
    let data: unknown = null;

    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch (parseError) {
      // eslint-disable-next-line no-console
      console.warn(
        '[dddd-alpah-extension] Failed to parse order history response JSON',
        parseError,
      );
    }

    if (!response.ok) {
      return {
        success: false,
        status,
        data,
        message: `Order history request failed with status ${status}`,
      } satisfies FetchOrderHistoryResponse;
    }

    return {
      success: true,
      status,
      data,
    } satisfies FetchOrderHistoryResponse;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Order history fetch failed:', messageText);
    return {
      success: false,
      message: messageText,
    } satisfies FetchOrderHistoryResponse;
  }
}

/**
 * 获取所有页面的订单历史数据
 */
async function fetchAllOrderHistoryPages(
  csrfToken: string,
  now = new Date(),
): Promise<unknown[] | null> {
  const allResponses: unknown[] = [];
  let currentPage = 1;
  const maxPages = 10; // 最多查询10页，防止无限循环

  while (currentPage <= maxPages) {
    const targetUrl = buildOrderHistoryUrl(now, currentPage);
    // eslint-disable-next-line no-console
    console.log(`[dddd-alpha-extension] Fetching order history page ${currentPage}`);

    const response = await performOrderHistoryRequest(targetUrl, csrfToken);

    if (!response.success || !response.data) {
      if (currentPage === 1) {
        // 第一页就失败了，返回null
        return null;
      }
      // 后续页面失败，返回已获取的数据
      break;
    }

    allResponses.push(response.data);

    // 检查是否还有更多数据
    type ResponseData = { data?: unknown[] };
    const data = response.data as ResponseData;
    if (data?.data && Array.isArray(data.data)) {
      const itemCount = data.data.length;
      // eslint-disable-next-line no-console
      console.log(`[dddd-alpha-extension] Page ${currentPage} returned ${itemCount} items`);

      if (itemCount < 100) {
        // 返回的数据少于100条，说明已经是最后一页了
        break;
      }
    } else {
      break;
    }

    currentPage++;
  }

  // eslint-disable-next-line no-console
  console.log(`[dddd-alpha-extension] Fetched ${allResponses.length} pages of order history`);
  return allResponses;
}

async function refreshOrderHistorySnapshotForAutomation(): Promise<OrderHistorySnapshotPayload | null> {
  try {
    const csrfToken = resolveCsrfToken();
    if (!csrfToken) {
      // eslint-disable-next-line no-console
      console.warn('[dddd-alpah-extension] Unable to resolve csrf token for order history refresh');
      if (!loginErrorDispatched) {
        await dispatchRuntimeMessage({
          type: 'TASK_ERROR',
          payload: { message: '请先登录币安' },
        });
        loginErrorDispatched = true;
      }
      return null;
    }

    const now = new Date();
    const allResponses = await fetchAllOrderHistoryPages(csrfToken, now);
    loginErrorDispatched = false;

    if (!allResponses || allResponses.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[dddd-alpah-extension] No order history data fetched');
      return null;
    }

    // 合并所有页面的数据
    const mergedItems = mergeOrderHistoryData(allResponses as BinanceOrderHistoryResponse[]);
    const mergedResponse = {
      code: '000000',
      message: null,
      data: mergedItems,
    };

    const alphaMap = await getAlphaMultiplierMap();
    const summary = summarizeOrderHistoryData(mergedResponse, (alphaId) =>
      lookupAlphaMultiplier(alphaMap, alphaId),
    );

    const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(
      summary.totalBuyVolume,
    );
    const snapshot: OrderHistorySnapshotPayload = {
      date: new Date().toISOString().slice(0, 10),
      totalBuyVolume: summary.totalBuyVolume,
      buyOrderCount: summary.buyOrderCount,
      alphaPoints,
      nextThresholdDelta,
      fetchedAt: Date.now(),
      source: 'automation',
    };

    await dispatchRuntimeMessage({
      type: 'ORDER_HISTORY_SNAPSHOT',
      payload: snapshot,
    });

    return snapshot;
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Failed to refresh order history snapshot:', messageText);
    return null;
  }
}

let evaluationInProgress = false;
let loginErrorDispatched = false;
let lastOrderPlacedAt = 0;
let runtimeUnavailable = false;
let automationEnabled = false;
let automationStateWatcherInitialized = false;
let priceOffsetPercent = DEFAULT_PRICE_OFFSET_PERCENT;
let buyPriceOffset = DEFAULT_BUY_PRICE_OFFSET_PERCENT;
let sellPriceOffset = DEFAULT_SELL_PRICE_OFFSET_PERCENT;
let pointsFactor = DEFAULT_POINTS_FACTOR;
let pointsTarget = DEFAULT_POINTS_TARGET;
let intervalMode: IntervalMode = DEFAULT_INTERVAL_MODE;
let nextEvaluationTimeoutId: number | undefined;
let automationLoopActive = false;
let pendingBuyOrderMonitorId: number | undefined;
let pendingOrderWarningVisible = false;
let monitoringEnabled = false;

const MULTIPLIER_CACHE_DURATION_MS = 5 * 60_000;

interface TokenDirectoryRecord {
  mulPoint?: number | string | null;
  alphaId?: string | null;
}

interface TokenDirectoryContainer {
  directory?: Record<string, TokenDirectoryRecord>;
}

let cachedAlphaMultiplierMap: Record<string, number> | null = null;
let cachedAlphaMultiplierTimestamp = 0;
const pendingOrderTimestamps = new Map<string, number>();
const pendingOrderWarningsShown = new Set<string>();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Received message:', message.type);

  if (message.type === 'RUN_TASK') {
    void handleAutomation().catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpah-extension] RUN_TASK error:', messageText);
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
    console.log('[dddd-alpah-extension] Starting manual run');
    void handleManualRun().catch((error: unknown) => {
      const messageText = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpah-extension] RUN_TASK_ONCE error:', messageText);
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
    console.log('[dddd-alpah-extension] Token symbol requested:', tokenSymbol);
    sendResponse({
      acknowledged: Boolean(tokenSymbol),
      tokenSymbol: tokenSymbol ?? null,
    });
    return true;
  }

  if (message.type === 'REQUEST_CURRENT_BALANCE') {
    void (async () => {
      const panel = getTradingFormPanel();
      let balanceValue: number | null = null;
      if (panel) {
        const extracted = await extractAvailableUsdt(panel);
        if (extracted !== null && Number.isFinite(extracted)) {
          balanceValue = extracted;
        }
      }

      // eslint-disable-next-line no-console
      console.log('[dddd-alpah-extension] Current balance requested:', balanceValue);
      sendResponse({
        acknowledged: balanceValue !== null,
        currentBalance: balanceValue ?? null,
      });
    })();
    return true;
  }

  if (message.type === 'FETCH_ORDER_HISTORY') {
    void (async () => {
      const csrfToken = resolveCsrfToken();
      if (!csrfToken) {
        sendResponse({
          success: false,
          message: '无法获取 CSRF token，请确保已登录',
        } satisfies FetchOrderHistoryResponse);
        return;
      }

      const now = new Date();
      const allResponses = await fetchAllOrderHistoryPages(csrfToken, now);

      if (!allResponses || allResponses.length === 0) {
        sendResponse({
          success: false,
          message: '无法获取订单历史数据',
        } satisfies FetchOrderHistoryResponse);
        return;
      }

      // 合并所有页面的数据
      const mergedItems = mergeOrderHistoryData(allResponses as BinanceOrderHistoryResponse[]);
      const mergedResponse = {
        code: '000000',
        message: null,
        data: mergedItems,
      };

      // eslint-disable-next-line no-console
      console.log(
        `[dddd-alpha-extension] Order history fetched successfully, total items: ${mergedItems.length}`,
      );

      sendResponse({
        success: true,
        status: 200,
        data: mergedResponse,
      } satisfies FetchOrderHistoryResponse);
    })();

    return true;
  }

  return false;
});

initializeAutomationStateWatcher();
void sendInitialBalanceUpdate();
// 不要立即启动监控，等待下单后再启动
// startPendingOrderMonitor();

async function sendInitialBalanceUpdate(): Promise<void> {
  // 延迟5秒,确保页面有足够时间加载余额
  await delay(5_000);

  const tokenSymbol = extractTokenSymbol();
  const panel = getTradingFormPanel();
  let currentBalance: number | undefined;

  if (panel) {
    const extracted = await extractAvailableUsdt(panel);
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
    '[dddd-alpah-extension] handleAutomation started, automationEnabled:',
    automationEnabled,
  );

  const needsLogin = checkForLoginPrompt();
  if (needsLogin) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpah-extension] Login required detected');
    await dispatchRuntimeMessage({
      type: 'TASK_ERROR',
      payload: { message: '请先登录币安' },
    });
    loginErrorDispatched = true;
    return;
  }

  loginErrorDispatched = false;
  if (!automationEnabled) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Automation disabled, tearing down polling');
    teardownPolling();
    return;
  }

  await ensurePolling();
}

async function handleManualRun(): Promise<void> {
  if (evaluationInProgress) {
    return;
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
    console.warn('[dddd-alpah-extension] Extension context invalid, skipping evaluation');
    teardownPolling();
    return;
  }

  if (!automationEnabled) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Automation not enabled, skipping evaluation');
    return;
  }

  if (evaluationInProgress || nextEvaluationTimeoutId !== undefined) {
    return;
  }

  if (!automationLoopActive) {
    scheduleNextAutomationCycle(0);
    return;
  }

  scheduleNextAutomationCycle();
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
    console.warn('[dddd-alpah-extension] Extension context invalid in evaluation cycle');
    teardownPolling();
    return;
  }

  if (evaluationInProgress) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Evaluation already in progress, skipping');
    return;
  }

  evaluationInProgress = true;
  // eslint-disable-next-line no-console
  console.log(
    '[dddd-alpah-extension] Starting evaluation cycle, placeOrder:',
    options.placeOrder !== false,
  );

  try {
    const placeOrder = options.placeOrder !== false;

    if (requireAutomationEnabled && !automationEnabled) {
      // eslint-disable-next-line no-console
      console.log('[dddd-alpah-extension] Automation disabled during evaluation, tearing down');
      teardownPolling();
      return;
    }

    if (checkForLoginPrompt()) {
      if (!loginErrorDispatched) {
        // eslint-disable-next-line no-console
        console.warn('[dddd-alpah-extension] Login prompt detected during evaluation');
        await dispatchRuntimeMessage({
          type: 'TASK_ERROR',
          payload: { message: '请先登录币安' },
        });
        loginErrorDispatched = true;
      }
      return;
    }

    loginErrorDispatched = false;

    const result = await executePrimaryTask({ placeOrder });
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Task completed:', result.success, result.details);
    await dispatchRuntimeMessage({
      type: 'TASK_COMPLETE',
      payload: result,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Evaluation cycle error:', messageText);
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
  console.log('[dddd-alpah-extension] executePrimaryTask started');

  const panel = findTradeHistoryPanel();
  if (!panel) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Trade history panel not found');
    return {
      success: false,
      details: 'Unable to locate limit trade history panel.',
    };
  }

  const trades = extractTradeHistorySamples(panel);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Extracted trades:', trades.length);
  if (!trades.length) {
    return { success: false, details: 'No limit trade entries detected.' };
  }

  const tokenSymbol = extractTokenSymbol();
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Token symbol:', tokenSymbol);

  const averagePrice = calculateVolumeWeightedAverage(trades);
  if (averagePrice === null) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Failed to calculate VWAP');
    return { success: false, details: 'Failed to compute average price.' };
  }

  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Calculated VWAP:', averagePrice);

  const tradeCount = trades.length;
  const precision = averagePrice < 1 ? 8 : 6;
  const formattedAverage = averagePrice.toFixed(precision);
  const detailParts = [`VWAP across ${tradeCount} trades: ${formattedAverage}`];

  let shouldPlaceOrder = options.placeOrder !== false;
  let orderSkipReason: 'manual' | 'points' | 'limit' | null = shouldPlaceOrder ? null : 'manual';
  let latestOrderHistorySnapshot: OrderHistorySnapshotPayload | null = null;
  let orderResult: OrderPlacementResult | undefined;
  let currentBalanceSnapshot: number | undefined;

  try {
    latestOrderHistorySnapshot = await refreshOrderHistorySnapshotForAutomation();
    if (latestOrderHistorySnapshot) {
      // eslint-disable-next-line no-console
      console.log('[dddd-alpah-extension] Order history snapshot', latestOrderHistorySnapshot);

      if (latestOrderHistorySnapshot.buyOrderCount >= MAX_SUCCESSFUL_TRADES) {
        detailParts.push(SUCCESSFUL_TRADES_LIMIT_MESSAGE);
        shouldPlaceOrder = false;
        orderSkipReason = 'limit';
      } else if (latestOrderHistorySnapshot.alphaPoints >= pointsTarget) {
        if (shouldPlaceOrder) {
          detailParts.push(
            `Points target reached (${latestOrderHistorySnapshot.alphaPoints} ≥ ${pointsTarget}). Order placement skipped.`,
          );
        }
        shouldPlaceOrder = false;
        orderSkipReason = 'points';
      }
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(
      '[dddd-alpah-extension] Failed to refresh order history before placement:',
      messageText,
    );
  }

  if (shouldPlaceOrder) {
    // eslint-disable-next-line no-console
    console.log(
      '[dddd-alpah-extension] Attempting to place order, priceOffsetPercent:',
      priceOffsetPercent,
    );
    try {
      orderResult = await ensureLimitOrderPlaced({
        price: averagePrice,
        priceOffsetPercent,
        buyPriceOffset,
        sellPriceOffset,
      });
      // eslint-disable-next-line no-console
      console.log('[dddd-alpah-extension] Order result:', orderResult.status, orderResult.reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpah-extension] Order placement error:', message);
      return { success: false, details: `Order placement failed: ${message}` };
    }

    if (orderResult) {
      if (orderResult.status === 'placed') {
        detailParts.push('Placed limit and reverse orders.');
      } else {
        const reason = orderResult.reason?.trim();
        if (reason) {
          detailParts.push(reason);
        }
      }
    }
  } else if (orderSkipReason === 'manual') {
    detailParts.push('Order placement skipped (manual refresh).');
  }

  if (orderResult?.status === 'placed') {
    await delay(1_000);
  }

  const balancePanel = getTradingFormPanel();
  if (balancePanel) {
    const balanceValue = await extractAvailableUsdt(balancePanel);
    if (balanceValue !== null && Number.isFinite(balanceValue)) {
      currentBalanceSnapshot = balanceValue;
    }
  }

  // eslint-disable-next-line no-console
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

async function dispatchRuntimeMessage(message: RuntimeMessage): Promise<void> {
  if (!isExtensionContextValid()) {
    teardownPolling();
    return;
  }

  try {
    await postRuntimeMessage(message);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[dddd-alpah-extension] Failed to post runtime message', error);

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
  buyPriceOffset: number;
  sellPriceOffset: number;
}): Promise<OrderPlacementResult> {
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] ensureLimitOrderPlaced started');

  const openOrdersRoot = getOpenOrdersRoot();
  if (!openOrdersRoot) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Open orders root not found');
    throw new Error('Open orders section unavailable.');
  }

  await ensureOpenOrdersTabs(openOrdersRoot);

  const orderState = await resolveLimitOrderState(openOrdersRoot);
  // eslint-disable-next-line no-console
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
  const timeSinceLastOrder = now - lastOrderPlacedAt;
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Time since last order:', timeSinceLastOrder, 'ms');

  if (timeSinceLastOrder < ORDER_PLACEMENT_COOLDOWN_MS) {
    return {
      status: 'cooldown',
      reason: 'Waiting for previous order placement to settle.',
    };
  }

  const orderPanel = getTradingFormPanel();
  if (!orderPanel) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Trading form panel not found');
    throw new Error('Trading form panel not found.');
  }

  const availableUsdt = await extractAvailableUsdt(orderPanel);
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Available USDT:', availableUsdt);

  if (availableUsdt === null) {
    throw new Error('Unable to determine available USDT balance.');
  }

  if (availableUsdt <= 0) {
    throw new Error('Available USDT balance is zero.');
  }

  const buyVolume = await configureLimitOrder({
    price: params.price,
    priceOffsetPercent: params.priceOffsetPercent,
    buyPriceOffset: params.buyPriceOffset,
    sellPriceOffset: params.sellPriceOffset,
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
    console.log('[dddd-alpah-extension] Limit orders container not found');
    return 'unknown';
  }

  const locale = getPageLocale();
  const emptyLabel = locale === 'zh-CN' ? '无进行中的订单' : 'No Ongoing Orders';
  const emptyNode = findElementWithExactText(container, emptyLabel);
  if (emptyNode) {
    console.log('[dddd-alpah-extension] Limit orders container found empty');
    return 'empty';
  }

  const rowCandidates = container.querySelectorAll('[data-row-index],[role="row"],table tbody tr');
  for (const candidate of Array.from(rowCandidates)) {
    if (candidate.textContent && candidate.textContent.trim().length > 0) {
      console.log('[dddd-alpah-extension] Limit orders container found non-empty');
      return 'non-empty';
    }
  }
  console.log('[dddd-alpah-extension] Limit orders container unknown');

  return 'unknown';
}

function getLimitOrdersContainer(root: HTMLElement): HTMLElement | null {
  const tables = root.querySelectorAll('table tbody');
  if (tables.length > 0) {
    for (const tbody of Array.from(tables)) {
      const rows = tbody.querySelectorAll('tr');
      if (rows.length > 0) {
        const hasContent = Array.from(rows).some((row) => {
          const text = row.textContent?.trim();
          return text && text.length > 0;
        });
        if (hasContent) {
          let container = tbody.parentElement;
          if (container) {
            container = container.parentElement;
          }
          return (
            container instanceof HTMLElement ? container : tbody.parentElement
          ) as HTMLElement;
        }
      }
    }
  }

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

  const rowCandidates = root.querySelectorAll('[data-row-index],[role="row"]');
  if (rowCandidates.length > 0) {
    let parent = rowCandidates[0].parentElement;
    while (parent && parent !== root) {
      if (parent instanceof HTMLElement && parent.classList.contains('overflow-auto')) {
        return parent;
      }
      parent = parent.parentElement;
    }
  }

  for (const candidate of candidates) {
    const className = candidate.className ?? '';
    if (className.includes('flex-col') && className.includes('overflow')) {
      const hasOrderContent = candidate.querySelector('[role="row"],[data-row-index]');
      if (hasOrderContent) {
        return candidate;
      }
    }
  }

  return null;
}

function getOpenOrdersRoot(): HTMLElement | null {
  const node = document.querySelector('.trd-order');
  return node instanceof HTMLElement ? node : null;
}

function startPendingOrderMonitor(): void {
  if (pendingBuyOrderMonitorId !== undefined) {
    return;
  }

  const runCheck = () => {
    try {
      checkPendingLimitOrders();
    } catch {
      // 静默失败
    }
  };

  runCheck();
  pendingBuyOrderMonitorId = window.setInterval(runCheck, PENDING_ORDER_CHECK_INTERVAL_MS);
}

function checkPendingLimitOrders(): void {
  if (!monitoringEnabled) {
    return;
  }

  const root = getOpenOrdersRoot();
  if (!root) {
    if (pendingOrderTimestamps.size > 0 || pendingOrderWarningsShown.size > 0) {
      pendingOrderTimestamps.clear();
      pendingOrderWarningsShown.clear();
    }
    return;
  }

  const activeOrders = extractOpenLimitOrderKeys(root);
  const now = Date.now();
  const activeKeySet = new Set(activeOrders.map((o) => o.key));

  for (const order of activeOrders) {
    if (!pendingOrderTimestamps.has(order.key)) {
      pendingOrderTimestamps.set(order.key, now);
    }
  }

  for (const key of Array.from(pendingOrderTimestamps.keys())) {
    if (!activeKeySet.has(key)) {
      pendingOrderTimestamps.delete(key);
      pendingOrderWarningsShown.delete(key);
    }
  }

  for (const [key, startedAt] of pendingOrderTimestamps.entries()) {
    if (now - startedAt >= PENDING_ORDER_WARNING_DELAY_MS && !pendingOrderWarningsShown.has(key)) {
      const order = activeOrders.find((o) => o.key === key);
      if (order) {
        showPendingOrderWarning(order.side);
        pendingOrderWarningsShown.add(key);
      }
    }
  }
}

interface OrderInfo {
  key: string;
  side: 'buy' | 'sell';
}

function extractOpenLimitOrderKeys(root: HTMLElement): OrderInfo[] {
  const container = getLimitOrdersContainer(root);
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
    const normalizedText = getNormalizedOrderRowText(row);
    if (!normalizedText) {
      continue;
    }

    const orderSide = detectLimitOrderSide(normalizedText);
    if (!orderSide) {
      continue;
    }

    if (!/\d/.test(normalizedText)) {
      continue;
    }

    const signature = getOrderRowSignature(row, normalizedText);
    if (!signature) {
      continue;
    }

    orders.push({ key: signature, side: orderSide });
  }

  return orders;
}

function getOrderRowSignature(row: HTMLElement, normalizedText: string): string | null {
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

function getNormalizedOrderRowText(row: HTMLElement): string | null {
  const text = row.textContent?.trim();
  if (!text) {
    return null;
  }

  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectLimitOrderSide(normalizedText: string): 'buy' | 'sell' | null {
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

  // 只处理限价单，不处理市价单
  if (hasMarket) {
    return null;
  }

  // 如果明确是限价单，或者没有市价关键词，则认为是限价单
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

function playNotificationSound(): void {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playBeep = (frequency: number, when: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      const now = when;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.4, now + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.4, now + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    const currentTime = audioContext.currentTime;
    playBeep(880, currentTime + 0.05, 0.15);
    playBeep(1046.5, currentTime + 0.25, 0.15);
    playBeep(1318.5, currentTime + 0.45, 0.2);
  } catch {
    try {
      const audio = new Audio(
        'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTcIGWi77eefTRAMUKfj8LZjHAY4kdfy',
      );
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }
}

function showPendingOrderWarning(side: 'buy' | 'sell'): void {
  if (pendingOrderWarningVisible) {
    return;
  }

  const body = document.body;
  if (!body) {
    return;
  }

  playNotificationSound();

  const existing = document.getElementById(PENDING_ORDER_WARNING_ELEMENT_ID);
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = PENDING_ORDER_WARNING_ELEMENT_ID;
  container.style.position = 'fixed';
  container.style.top = '24px';
  container.style.right = '24px';
  container.style.zIndex = '2147483647';
  container.style.background = 'rgba(17, 24, 39, 0.94)';
  container.style.color = '#ffffff';
  container.style.padding = '16px';
  container.style.borderRadius = '12px';
  container.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.45)';
  container.style.maxWidth = '320px';
  container.style.fontFamily =
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif';

  const title = document.createElement('div');
  const orderTypeText = side === 'buy' ? '买入' : '卖出';
  title.textContent = `${orderTypeText}限价单超过 5 秒未成交`;
  title.style.fontSize = '16px';
  title.style.fontWeight = '600';
  title.style.marginBottom = '8px';

  const description = document.createElement('div');
  description.textContent = '请检查当前委托，避免被夹并及时调整价格。';
  description.style.fontSize = '14px';
  description.style.lineHeight = '1.6';
  description.style.marginBottom = '12px';

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.textContent = '我知道了';
  actionButton.style.background = '#f0b90b';
  actionButton.style.color = '#1b1f23';
  actionButton.style.border = 'none';
  actionButton.style.borderRadius = '8px';
  actionButton.style.padding = '8px 14px';
  actionButton.style.fontWeight = '600';
  actionButton.style.cursor = 'pointer';

  const dismiss = () => {
    if (!pendingOrderWarningVisible) {
      return;
    }

    pendingOrderWarningVisible = false;
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  };

  actionButton.addEventListener('click', dismiss);
  container.addEventListener('click', (event) => {
    if (event.target === container) {
      dismiss();
    }
  });

  container.appendChild(title);
  container.appendChild(description);
  container.appendChild(actionButton);

  body.appendChild(container);
  pendingOrderWarningVisible = true;

  window.setTimeout(dismiss, 20_000);
}

function getTradingFormPanel(): HTMLElement | null {
  const node = document.querySelector('.order-5');
  return node instanceof HTMLElement ? node : null;
}

function teardownPolling(): void {
  if (nextEvaluationTimeoutId !== undefined) {
    clearTimeout(nextEvaluationTimeoutId);
    nextEvaluationTimeoutId = undefined;
  }

  automationLoopActive = false;
  evaluationInProgress = false;
}

function getRandomAutomationDelay(): number {
  let minDelay: number;
  let maxDelay: number;

  if (intervalMode === 'fast') {
    minDelay = FAST_MODE_MIN_DELAY;
    maxDelay = FAST_MODE_MAX_DELAY;
  } else {
    minDelay = MEDIUM_MODE_MIN_DELAY;
    maxDelay = MEDIUM_MODE_MAX_DELAY;
  }

  const spread = maxDelay - minDelay;
  const offset = Math.random() * spread;
  return Math.floor(minDelay + offset);
}

function scheduleNextAutomationCycle(delayMs?: number): void {
  if (!automationEnabled) {
    return;
  }

  const delay = typeof delayMs === 'number' && delayMs >= 0 ? delayMs : getRandomAutomationDelay();

  if (nextEvaluationTimeoutId !== undefined) {
    clearTimeout(nextEvaluationTimeoutId);
  }

  automationLoopActive = true;
  nextEvaluationTimeoutId = window.setTimeout(() => {
    nextEvaluationTimeoutId = undefined;

    if (!automationEnabled || !isExtensionContextValid()) {
      return;
    }

    void runEvaluationCycle(true, { placeOrder: true }).finally(() => {
      if (automationEnabled) {
        scheduleNextAutomationCycle();
      }
    });
  }, delay);
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
    if (areaName !== 'local') {
      return;
    }

    if (STORAGE_KEY in changes) {
      const newValue = changes[STORAGE_KEY]?.newValue;
      applyAutomationState(newValue);
    }

    if (TOKEN_DIRECTORY_STORAGE_KEY in changes) {
      invalidateTokenDirectoryCache();
    }
  });
}

function applyAutomationState(value: unknown): void {
  let nextEnabled = false;
  let nextPriceOffset = DEFAULT_PRICE_OFFSET_PERCENT;
  let nextBuyPriceOffset = DEFAULT_BUY_PRICE_OFFSET_PERCENT;
  let nextSellPriceOffset = DEFAULT_SELL_PRICE_OFFSET_PERCENT;
  let nextPointsFactor = DEFAULT_POINTS_FACTOR;
  let nextPointsTarget = DEFAULT_POINTS_TARGET;
  let nextIntervalMode: IntervalMode = DEFAULT_INTERVAL_MODE;

  if (value && typeof value === 'object') {
    const record = value as { isEnabled?: unknown; settings?: unknown };
    nextEnabled = record.isEnabled === true;

    if (record.settings && typeof record.settings === 'object') {
      const candidate = (record.settings as { priceOffsetPercent?: unknown }).priceOffsetPercent;
      nextPriceOffset = extractPriceOffsetPercent(candidate, DEFAULT_PRICE_OFFSET_PERCENT);

      const buyOffsetCandidate = (record.settings as { buyPriceOffset?: unknown }).buyPriceOffset;
      nextBuyPriceOffset = extractPriceOffsetPercent(
        buyOffsetCandidate,
        DEFAULT_BUY_PRICE_OFFSET_PERCENT,
      );

      const sellOffsetCandidate = (record.settings as { sellPriceOffset?: unknown })
        .sellPriceOffset;
      nextSellPriceOffset = extractPriceOffsetPercent(
        sellOffsetCandidate,
        DEFAULT_SELL_PRICE_OFFSET_PERCENT,
      );

      const factorCandidate = (record.settings as { pointsFactor?: unknown }).pointsFactor;
      nextPointsFactor = extractPointsFactor(factorCandidate);

      const targetCandidate = (record.settings as { pointsTarget?: unknown }).pointsTarget;
      nextPointsTarget = extractPointsTarget(targetCandidate);

      const intervalCandidate = (record.settings as { intervalMode?: unknown }).intervalMode;
      nextIntervalMode = extractIntervalMode(intervalCandidate);
    }
  }

  const stateChanged =
    automationEnabled !== nextEnabled ||
    priceOffsetPercent !== nextPriceOffset ||
    buyPriceOffset !== nextBuyPriceOffset ||
    sellPriceOffset !== nextSellPriceOffset ||
    pointsFactor !== nextPointsFactor ||
    pointsTarget !== nextPointsTarget ||
    intervalMode !== nextIntervalMode;

  if (stateChanged) {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Automation state updated:', {
      enabled: nextEnabled,
      priceOffsetPercent: nextPriceOffset,
      buyPriceOffset: nextBuyPriceOffset,
      sellPriceOffset: nextSellPriceOffset,
      pointsFactor: nextPointsFactor,
      pointsTarget: nextPointsTarget,
      intervalMode: nextIntervalMode,
    });
  }

  automationEnabled = nextEnabled;
  priceOffsetPercent = nextPriceOffset;
  buyPriceOffset = nextBuyPriceOffset;
  sellPriceOffset = nextSellPriceOffset;
  pointsFactor = nextPointsFactor;
  pointsTarget = nextPointsTarget;
  intervalMode = nextIntervalMode;

  if (!automationEnabled) {
    teardownPolling();
  }
}

function extractPriceOffsetPercent(value: unknown, fallback: number): number {
  if (value === undefined || value === null) {
    return clampPriceOffsetPercent(fallback);
  }

  if (typeof value === 'number') {
    return clampPriceOffsetPercent(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return clampPriceOffsetPercent(fallback);
  }

  return clampPriceOffsetPercent(parsed);
}

const MIN_POINTS_FACTOR = 1;
const MAX_POINTS_FACTOR = 1000;
const MIN_POINTS_TARGET = 1;
const MAX_POINTS_TARGET = 1000;

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

function extractPointsTarget(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_POINTS_TARGET;
  }

  if (typeof value === 'number') {
    return clampPointsTarget(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_POINTS_TARGET;
  }

  return clampPointsTarget(parsed);
}

function clampPointsTarget(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_TARGET;
  }

  const floored = Math.floor(value);

  if (floored < MIN_POINTS_TARGET) {
    return MIN_POINTS_TARGET;
  }

  if (floored > MAX_POINTS_TARGET) {
    return MAX_POINTS_TARGET;
  }

  return floored;
}

function extractIntervalMode(value: unknown): IntervalMode {
  if (value === 'fast' || value === 'medium') {
    return value;
  }
  return DEFAULT_INTERVAL_MODE;
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
  buyPriceOffset: number;
  sellPriceOffset: number;
  availableUsdt: number;
  orderPanel: HTMLElement;
}): Promise<number> {
  const { price, buyPriceOffset, sellPriceOffset, availableUsdt, orderPanel } = params;

  const clampedBuyOffset = clampPriceOffsetPercent(buyPriceOffset);
  const clampedSellOffset = clampPriceOffsetPercent(sellPriceOffset);

  const buyPrice = price * (1 + clampedBuyOffset / 100);
  const sellPrice = price * (1 + clampedSellOffset / 100);
  const safeSellPrice = sellPrice > 0 ? sellPrice : 0;

  const buyPriceValue = formatNumberFixedDecimals(buyPrice, 8);
  const sellPriceValue = formatNumberFixedDecimals(safeSellPrice, 8);

  await ensureLimitOrderMode(orderPanel);

  const delayConfig = getConfigureLimitOrderDelay();

  const priceInput = orderPanel.querySelector<HTMLInputElement>('#limitPrice');
  if (!priceInput) {
    throw new Error('Limit price input not found.');
  }
  await waitRandomDelay(delayConfig.min, delayConfig.max);
  setReactInputValue(priceInput, buyPriceValue);
  await waitForAnimationFrame();

  const toggleChanged = ensureReverseOrderToggle(orderPanel);
  if (toggleChanged) {
    await waitForAnimationFrame();
  }
  await waitRandomDelay(delayConfig.min, delayConfig.max);

  const slider = orderPanel.querySelector<HTMLInputElement>('input.bn-slider');
  if (!slider) {
    throw new Error('Order amount slider not found.');
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Setting slider to 100%');
  slider.focus();
  slider.value = '100';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  await waitForAnimationFrame();
  await waitRandomDelay(delayConfig.min, delayConfig.max);

  const locale = getPageLocale();
  const reversePricePlaceholder = locale === 'zh-CN' ? '限价卖出' : 'Limit Sell';
  const reversePriceInput = orderPanel.querySelector<HTMLInputElement>(
    `#limitTotal[placeholder="${reversePricePlaceholder}"]`,
  );
  if (!reversePriceInput) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Reverse order price input not found');
    throw new Error('Reverse order price input not found.');
  }
  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] 设置卖出价格:', sellPriceValue);
  setReactInputValue(reversePriceInput, sellPriceValue);
  await waitForAnimationFrame();
  await waitRandomDelay(delayConfig.min, delayConfig.max);

  const buyButton = orderPanel.querySelector<HTMLButtonElement>('button.bn-button__buy');
  if (!buyButton) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Buy button not found');
    throw new Error('Buy button not found.');
  }

  // eslint-disable-next-line no-console
  console.log('[dddd-alpah-extension] Clicking buy button');
  buyButton.click();
  scheduleOrderConfirmationClick();

  return availableUsdt;
}

async function ensureLimitOrderMode(orderPanel: HTMLElement): Promise<void> {
  const buyTab = findOrderPanelTab(orderPanel, '#bn-tab-0.bn-tab__buySell');
  if (!buyTab) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Buy tab not found');
    throw new Error('Buy tab not found.');
  }

  if (buyTab.getAttribute('aria-selected') !== 'true') {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Selecting buy tab');
    buyTab.click();
    await waitForAnimationFrame();
    await waitRandomDelay(200, 400);
  }

  const limitTab =
    findOrderPanelTab(orderPanel, '#bn-tab-limit') ??
    findOrderPanelTab(orderPanel, '#bn-tab-LIMIT');
  if (!limitTab) {
    // eslint-disable-next-line no-console
    console.error('[dddd-alpah-extension] Limit tab not found');
    throw new Error('Limit tab not found.');
  }

  if (limitTab.getAttribute('aria-selected') !== 'true') {
    // eslint-disable-next-line no-console
    console.log('[dddd-alpah-extension] Selecting limit tab');
    limitTab.click();
    await waitForAnimationFrame();
    await waitRandomDelay(200, 400);
  }
}

function findOrderPanelTab(orderPanel: HTMLElement, selector: string): HTMLElement | null {
  const scoped = orderPanel.querySelector<HTMLElement>(selector);
  if (scoped) {
    return scoped;
  }

  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const candidate of candidates) {
    if (orderPanel.contains(candidate)) {
      return candidate;
    }
  }

  return null;
}

function ensureReverseOrderToggle(orderPanel: HTMLElement): boolean {
  const locale = getPageLocale();
  const labelText = locale === 'zh-CN' ? '反向订单' : 'Reverse Order';
  const label = findElementWithExactText(orderPanel, labelText);
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

function scheduleOrderConfirmationClick(): void {
  const ATTEMPT_DURATION_MS = 2_000;
  const ATTEMPT_INTERVAL_MS = 100;
  const INITIAL_DELAY_MS = randomIntInRange(500, 800);

  // eslint-disable-next-line no-console
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
      const confirmButton = findOrderConfirmationButton();
      if (confirmButton) {
        // eslint-disable-next-line no-console
        console.log(
          '[dddd-alpah-extension] Confirm button found after',
          attemptCount,
          'attempts, clicking',
        );
        confirmButton.click();

        // 点击确认按钮后，启动订单监控
        window.setTimeout(() => {
          if (!monitoringEnabled) {
            monitoringEnabled = true;
            startPendingOrderMonitor();
            // eslint-disable-next-line no-console
            console.log('[dddd-alpah-extension] Order monitoring enabled after confirmation click');
          }
        }, 500); // 等待500ms让订单出现在列表中

        return;
      }

      if (Date.now() - start < ATTEMPT_DURATION_MS) {
        window.setTimeout(attempt, ATTEMPT_INTERVAL_MS);
      } else {
        // eslint-disable-next-line no-console
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

async function extractAvailableUsdt(orderPanel: HTMLElement): Promise<number | null> {
  await ensureLimitOrderMode(orderPanel);

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

function getConfigureLimitOrderDelay(): { min: number; max: number } {
  if (intervalMode === 'fast') {
    return { min: 300, max: 600 };
  }
  return { min: 500, max: 1_000 };
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
