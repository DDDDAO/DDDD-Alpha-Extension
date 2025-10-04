import { DEFAULT_POINTS_FACTOR, DEFAULT_PRICE_OFFSET_PERCENT } from '../config/defaults.js';
import { SELECTORS } from '../config/selectors.js';
import { postRuntimeMessage } from '../lib/messages.js';
const POLLING_INTERVAL_MS = 1_000;
const ORDER_PLACEMENT_COOLDOWN_MS = 15_000;
const LIMIT_STATE_TIMEOUT_MS = 2_000;
const LIMIT_STATE_POLL_INTERVAL_MS = 100;
const STORAGE_KEY = 'alpha-auto-bot::state';
const MIN_PRICE_OFFSET_PERCENT = 0;
const MAX_PRICE_OFFSET_PERCENT = 5;
let pollingTimerId;
let evaluationInProgress = false;
let loginErrorDispatched = false;
let lastOrderPlacedAt = 0;
let runtimeUnavailable = false;
let automationEnabled = false;
let automationStateWatcherInitialized = false;
let priceOffsetPercent = DEFAULT_PRICE_OFFSET_PERCENT;
let pointsFactor = DEFAULT_POINTS_FACTOR;
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RUN_TASK') {
        void handleAutomation().catch((error) => {
            const messageText = error instanceof Error ? error.message : String(error);
            void postRuntimeMessage({
                type: 'TASK_ERROR',
                payload: { message: messageText },
            });
        });
        sendResponse({ acknowledged: true });
        return true;
    }
    if (message.type === 'RUN_TASK_ONCE') {
        void handleManualRun().catch((error) => {
            const messageText = error instanceof Error ? error.message : String(error);
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
        sendResponse({
            acknowledged: Boolean(tokenSymbol),
            tokenSymbol: tokenSymbol ?? null,
        });
        return true;
    }
    if (message.type === 'REQUEST_CURRENT_BALANCE') {
        const panel = getTradingFormPanel();
        let balanceValue = null;
        if (panel) {
            const extracted = extractAvailableUsdt(panel);
            if (extracted !== null && Number.isFinite(extracted)) {
                balanceValue = extracted;
            }
        }
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
async function sendInitialBalanceUpdate() {
    await delay(2_000);
    const tokenSymbol = extractTokenSymbol();
    const panel = getTradingFormPanel();
    let currentBalance;
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
async function handleAutomation() {
    const needsLogin = checkForLoginPrompt();
    if (needsLogin) {
        await dispatchRuntimeMessage({
            type: 'TASK_ERROR',
            payload: { message: 'Login required. Please authenticate manually.' },
        });
        loginErrorDispatched = true;
        return;
    }
    loginErrorDispatched = false;
    if (!automationEnabled) {
        teardownPolling();
        return;
    }
    await ensurePolling();
}
async function handleManualRun() {
    if (evaluationInProgress) {
        throw new Error('Automation is busy; try again shortly.');
    }
    await runEvaluationCycle(false, { placeOrder: false });
}
function checkForLoginPrompt() {
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
async function ensurePolling() {
    if (!isExtensionContextValid()) {
        teardownPolling();
        return;
    }
    if (!automationEnabled) {
        teardownPolling();
        return;
    }
    if (pollingTimerId === undefined) {
        pollingTimerId = window.setInterval(() => {
            void runEvaluationCycle(true, { placeOrder: true });
        }, POLLING_INTERVAL_MS);
    }
    await runEvaluationCycle(true, { placeOrder: true });
}
async function runEvaluationCycle(requireAutomationEnabled = true, options = {}) {
    if (!isExtensionContextValid()) {
        teardownPolling();
        return;
    }
    if (evaluationInProgress) {
        return;
    }
    evaluationInProgress = true;
    try {
        const placeOrder = options.placeOrder !== false;
        if (requireAutomationEnabled && !automationEnabled) {
            teardownPolling();
            return;
        }
        if (checkForLoginPrompt()) {
            if (!loginErrorDispatched) {
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
        await dispatchRuntimeMessage({
            type: 'TASK_COMPLETE',
            payload: result,
        });
    }
    catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        await dispatchRuntimeMessage({
            type: 'TASK_ERROR',
            payload: { message: messageText },
        });
    }
    finally {
        evaluationInProgress = false;
    }
}
async function executePrimaryTask(options = {}) {
    const panel = findTradeHistoryPanel();
    if (!panel) {
        return {
            success: false,
            details: 'Unable to locate limit trade history panel.',
        };
    }
    const trades = extractTradeHistorySamples(panel);
    if (!trades.length) {
        return { success: false, details: 'No limit trade entries detected.' };
    }
    const tokenSymbol = extractTokenSymbol();
    const averagePrice = calculateVolumeWeightedAverage(trades);
    if (averagePrice === null) {
        return { success: false, details: 'Failed to compute average price.' };
    }
    const tradeCount = trades.length;
    const precision = averagePrice < 1 ? 8 : 6;
    const formattedAverage = averagePrice.toFixed(precision);
    const detailParts = [`VWAP across ${tradeCount} trades: ${formattedAverage}`];
    const shouldPlaceOrder = options.placeOrder !== false;
    let orderResult;
    let buyVolumeDelta;
    let successfulTradesDelta;
    let currentBalanceSnapshot;
    if (shouldPlaceOrder) {
        try {
            orderResult = await ensureLimitOrderPlaced({
                price: averagePrice,
                priceOffsetPercent,
            });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, details: `Order placement failed: ${message}` };
        }
        if (orderResult) {
            if (orderResult.status === 'placed') {
                const placedVolume = orderResult.buyVolume;
                if (typeof placedVolume === 'number' && Number.isFinite(placedVolume) && placedVolume > 0) {
                    const scaledVolume = placedVolume * Math.max(1, pointsFactor);
                    buyVolumeDelta = scaledVolume;
                    detailParts.push(`Placed limit and reverse orders. Recorded buy volume: ${scaledVolume.toFixed(2)} USDT.`);
                }
                else {
                    detailParts.push('Placed limit and reverse orders.');
                }
                successfulTradesDelta = 1;
            }
            else {
                const reason = orderResult.reason?.trim();
                if (reason) {
                    detailParts.push(reason);
                }
            }
        }
    }
    else {
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
    console.log('[alpha-auto-bot] Limit VWAP', {
        averagePrice,
        formattedAverage,
        tokenSymbol: tokenSymbol ?? null,
        buyVolumeDelta: buyVolumeDelta ?? null,
        orderStatus: shouldPlaceOrder ? (orderResult?.status ?? 'skipped') : 'manual-skip',
        orderReason: shouldPlaceOrder ? (orderResult?.reason ?? null) : 'manual refresh',
        timestamp: new Date().toISOString(),
    });
    const meta = {
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
    if (orderResult?.availableBalanceBeforeOrder !== undefined &&
        Number.isFinite(orderResult.availableBalanceBeforeOrder)) {
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
async function dispatchRuntimeMessage(message) {
    if (!isExtensionContextValid()) {
        teardownPolling();
        return;
    }
    try {
        await postRuntimeMessage(message);
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[alpha-auto-bot] Failed to post runtime message', error);
        const messageText = error instanceof Error ? error.message : String(error ?? '');
        if (/extension context invalidated/i.test(messageText)) {
            runtimeUnavailable = true;
            teardownPolling();
        }
    }
}
function findTradeHistoryPanel() {
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
function extractTradeHistorySamples(panel, limit = 60) {
    const grid = panel.querySelector('.ReactVirtualized__Grid');
    if (!grid) {
        return [];
    }
    const rowSelector = SELECTORS.tradeHistoryRow ?? '[role="gridcell"]';
    const rowNodes = Array.from(grid.querySelectorAll(rowSelector)).slice(0, limit);
    const entries = [];
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
function extractTokenSymbol() {
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
        const primaryCandidate = orderHeader.querySelector('div.text-\\[20px\\].font-\\[600\\].leading-\\[24px\\].text-PrimaryText');
        const text = primaryCandidate?.textContent?.trim();
        if (text) {
            return text;
        }
        const fallbackNodes = Array.from(orderHeader.querySelectorAll('div'));
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
function calculateVolumeWeightedAverage(trades) {
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
async function ensureLimitOrderPlaced(params) {
    const openOrdersRoot = getOpenOrdersRoot();
    if (!openOrdersRoot) {
        throw new Error('Open orders section unavailable.');
    }
    await ensureOpenOrdersTabs(openOrdersRoot);
    const orderState = await resolveLimitOrderState(openOrdersRoot);
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
    if (now - lastOrderPlacedAt < ORDER_PLACEMENT_COOLDOWN_MS) {
        return {
            status: 'cooldown',
            reason: 'Waiting for previous order placement to settle.',
        };
    }
    const orderPanel = getTradingFormPanel();
    if (!orderPanel) {
        throw new Error('Trading form panel not found.');
    }
    const availableUsdt = extractAvailableUsdt(orderPanel);
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
async function ensureOpenOrdersTabs(root) {
    const openOrdersTab = getTabByLabel(root, 'Open Orders');
    if (openOrdersTab && openOrdersTab.getAttribute('aria-selected') !== 'true') {
        openOrdersTab.click();
        await waitForAnimationFrame();
    }
    const limitTab = getTabByLabel(root, 'Limit');
    if (limitTab && limitTab.getAttribute('aria-selected') !== 'true') {
        limitTab.click();
        await waitForAnimationFrame();
    }
}
function getTabByLabel(root, label) {
    const normalizedLabel = label.trim().toLowerCase();
    const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
    return (tabs.find((tab) => {
        const text = tab.textContent?.trim().toLowerCase();
        if (!text) {
            return false;
        }
        return text === normalizedLabel || text.startsWith(normalizedLabel);
    }) ?? null);
}
async function resolveLimitOrderState(root) {
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
function detectLimitOrderState(root) {
    const container = getLimitOrdersContainer(root);
    if (!container) {
        return 'unknown';
    }
    const emptyNode = findElementWithExactText(container, 'No Ongoing Orders');
    if (emptyNode) {
        return 'empty';
    }
    const rowCandidates = container.querySelectorAll('[data-row-index],[role="row"],table tbody tr');
    for (const candidate of Array.from(rowCandidates)) {
        if (candidate.textContent && candidate.textContent.trim().length > 0) {
            return 'non-empty';
        }
    }
    return 'unknown';
}
function getLimitOrdersContainer(root) {
    const candidates = Array.from(root.querySelectorAll('div'));
    for (const candidate of candidates) {
        const className = candidate.className ?? '';
        if (className.includes('pb-[108px]') &&
            className.includes('flex-col') &&
            className.includes('overflow-auto')) {
            return candidate;
        }
    }
    return null;
}
function getOpenOrdersRoot() {
    const node = document.querySelector('.trd-order');
    return node instanceof HTMLElement ? node : null;
}
function getTradingFormPanel() {
    const node = document.querySelector('.order-5');
    return node instanceof HTMLElement ? node : null;
}
function teardownPolling() {
    if (pollingTimerId !== undefined) {
        clearInterval(pollingTimerId);
        pollingTimerId = undefined;
    }
    evaluationInProgress = false;
}
function isExtensionContextValid() {
    if (runtimeUnavailable) {
        return false;
    }
    return typeof chrome.runtime?.id === 'string' && chrome.runtime.id.length > 0;
}
function initializeAutomationStateWatcher() {
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
function applyAutomationState(value) {
    let nextEnabled = false;
    let nextPriceOffset = DEFAULT_PRICE_OFFSET_PERCENT;
    let nextPointsFactor = DEFAULT_POINTS_FACTOR;
    if (value && typeof value === 'object') {
        const record = value;
        nextEnabled = record.isEnabled === true;
        if (record.settings && typeof record.settings === 'object') {
            const candidate = record.settings.priceOffsetPercent;
            nextPriceOffset = extractPriceOffsetPercent(candidate);
            const factorCandidate = record.settings.pointsFactor;
            nextPointsFactor = extractPointsFactor(factorCandidate);
        }
    }
    automationEnabled = nextEnabled;
    priceOffsetPercent = nextPriceOffset;
    pointsFactor = nextPointsFactor;
    if (!automationEnabled) {
        teardownPolling();
    }
}
function extractPriceOffsetPercent(value) {
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
function extractPointsFactor(value) {
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
function clampPriceOffsetPercent(value) {
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
function clampPointsFactor(value) {
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
async function refreshAutomationState() {
    await new Promise((resolve) => {
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
async function configureLimitOrder(params) {
    const { price, priceOffsetPercent, availableUsdt, orderPanel } = params;
    const clampedOffsetPercent = clampPriceOffsetPercent(priceOffsetPercent);
    const offsetFactor = clampedOffsetPercent / 100;
    const buyPrice = price * (1 + offsetFactor);
    const reversePriceBase = price * (1 - offsetFactor);
    const reversePrice = reversePriceBase > 0 ? reversePriceBase : 0;
    const buyPriceValue = formatNumberFixedDecimals(buyPrice, 8);
    const reversePriceValue = formatNumberFixedDecimals(reversePrice, 8);
    const priceInput = orderPanel.querySelector('#limitPrice');
    if (!priceInput) {
        throw new Error('Limit price input not found.');
    }
    await waitRandomDelay();
    setReactInputValue(priceInput, buyPriceValue);
    await waitForAnimationFrame();
    const toggleChanged = ensureReverseOrderToggle(orderPanel);
    if (toggleChanged) {
        await waitForAnimationFrame();
    }
    await waitRandomDelay();
    const slider = orderPanel.querySelector('input.bn-slider');
    if (!slider) {
        throw new Error('Order amount slider not found.');
    }
    slider.focus();
    slider.value = '100';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForAnimationFrame();
    await waitRandomDelay();
    const reversePriceInput = orderPanel.querySelector('#limitTotal[placeholder="Limit Sell"]');
    if (!reversePriceInput) {
        throw new Error('Reverse order price input not found.');
    }
    setReactInputValue(reversePriceInput, reversePriceValue);
    await waitForAnimationFrame();
    await waitRandomDelay();
    const buyButton = orderPanel.querySelector('button.bn-button__buy');
    if (!buyButton) {
        throw new Error('Buy button not found.');
    }
    buyButton.click();
    scheduleOrderConfirmationClick();
    return availableUsdt;
}
function ensureReverseOrderToggle(orderPanel) {
    const label = findElementWithExactText(orderPanel, 'Reverse Order');
    if (!label) {
        throw new Error('Reverse order toggle not found.');
    }
    let toggle = null;
    if (label.previousElementSibling instanceof HTMLElement &&
        label.previousElementSibling.getAttribute('role') === 'checkbox') {
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
function scheduleOrderConfirmationClick() {
    const ATTEMPT_DURATION_MS = 2_000;
    const ATTEMPT_INTERVAL_MS = 100;
    const INITIAL_DELAY_MS = randomIntInRange(300, 800);
    const runAttempts = () => {
        const start = Date.now();
        const attempt = () => {
            const confirmButton = findOrderConfirmationButton();
            if (confirmButton) {
                confirmButton.click();
                return;
            }
            if (Date.now() - start < ATTEMPT_DURATION_MS) {
                window.setTimeout(attempt, ATTEMPT_INTERVAL_MS);
            }
        };
        attempt();
    };
    window.setTimeout(runAttempts, INITIAL_DELAY_MS);
}
function findOrderConfirmationButton() {
    const candidates = new Set();
    for (const button of Array.from(document.querySelectorAll('dialog button, div[role="dialog"] button'))) {
        candidates.add(button);
    }
    const fallback = document.querySelector('#__APP > div:nth-of-type(3) > div > div > button');
    if (fallback) {
        candidates.add(fallback);
    }
    for (const candidate of candidates) {
        const text = candidate.textContent?.trim().toLowerCase();
        if (text === 'confirm') {
            return candidate;
        }
    }
    return null;
}
function setReactInputValue(input, value) {
    input.focus();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor?.set) {
        descriptor.set.call(input, value);
    }
    else {
        input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}
function waitForAnimationFrame() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}
function formatNumberFixedDecimals(value, fractionDigits) {
    if (!Number.isFinite(value)) {
        return (0).toFixed(fractionDigits);
    }
    return value.toFixed(fractionDigits);
}
function extractAvailableUsdt(orderPanel) {
    const label = findElementWithExactText(orderPanel, 'Available');
    if (!label) {
        return null;
    }
    let sibling = label.nextElementSibling;
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
        sibling = sibling.nextElementSibling;
    }
    return null;
}
function findElementWithExactText(root, text) {
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
function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}
function waitRandomDelay(min = 500, max = 1_000) {
    const duration = randomIntInRange(min, max);
    return delay(duration);
}
function randomIntInRange(min, max) {
    const clampedMin = Math.ceil(min);
    const clampedMax = Math.floor(max);
    return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
}
function parseNumericValue(raw) {
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
