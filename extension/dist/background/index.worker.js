import { DEFAULT_AUTOMATION, DEFAULT_POINTS_TARGET, resolveTargetUrl } from '../config/defaults.js';
import { getSchedulerState, updateSchedulerState } from '../lib/storage.js';
import { getTab, locateOrCreateTab } from '../lib/tabs.js';
const { alarmName, intervalMinutes } = DEFAULT_AUTOMATION;
const MIN_ALARM_INTERVAL_MINUTES = 0.5;
const INITIAL_DELAY_MINUTES = 0.01;
let immediateRunScheduled = false;
void bootstrapScheduler();
chrome.runtime.onInstalled.addListener(() => {
    void bootstrapScheduler();
});
chrome.runtime.onStartup.addListener(() => {
    void bootstrapScheduler();
});
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== alarmName) {
        return;
    }
    void runAutomationCycle();
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'BALANCE_UPDATE') {
        const currentBalanceValue = normalizeBalance(message.payload?.currentBalance);
        const tokenSymbol = normalizeTokenSymbol(message.payload?.tokenSymbol);
        const timestamp = new Date().toISOString();
        const dateKey = timestamp.slice(0, 10);
        void updateSchedulerState((state) => {
            const previousDaily = state.dailyBuyVolume;
            const isSameDay = previousDaily?.date === dateKey;
            const previousTokenSymbol = state.tokenSymbol ?? state.lastResult?.tokenSymbol;
            const resolvedTokenSymbol = tokenSymbol ?? previousTokenSymbol;
            if (currentBalanceValue === undefined) {
                return state;
            }
            const existingFirstBalance = isSameDay && typeof previousDaily?.firstBalance === 'number'
                ? previousDaily.firstBalance
                : undefined;
            const existingCurrentBalance = isSameDay && typeof previousDaily?.currentBalance === 'number'
                ? previousDaily.currentBalance
                : undefined;
            const existingTotal = isSameDay && typeof previousDaily?.total === 'number' ? previousDaily.total : 0;
            const existingTrades = isSameDay && typeof previousDaily?.tradeCount === 'number' ? previousDaily.tradeCount : 0;
            const existingTotalCost = isSameDay && typeof previousDaily?.totalCost === 'number' ? previousDaily.totalCost : 0;
            const existingAlphaPoints = isSameDay && typeof previousDaily?.alphaPoints === 'number' ? previousDaily.alphaPoints : 0;
            const existingNextThresholdDelta = isSameDay && typeof previousDaily?.nextThresholdDelta === 'number'
                ? previousDaily.nextThresholdDelta
                : 2;
            let nextFirstBalance = existingFirstBalance;
            let nextCurrentBalance = currentBalanceValue;
            let nextTotalCost = existingTotalCost;
            if (!isSameDay) {
                nextFirstBalance = currentBalanceValue;
                nextCurrentBalance = currentBalanceValue;
                nextTotalCost = 0;
            }
            else if (nextFirstBalance === undefined) {
                nextFirstBalance = currentBalanceValue;
            }
            if (typeof nextFirstBalance === 'number' &&
                Number.isFinite(nextFirstBalance) &&
                typeof nextCurrentBalance === 'number' &&
                Number.isFinite(nextCurrentBalance)) {
                const difference = nextFirstBalance - nextCurrentBalance;
                nextTotalCost = difference > 0 ? difference : 0;
            }
            const costRatio = typeof nextFirstBalance === 'number' &&
                Number.isFinite(nextFirstBalance) &&
                nextFirstBalance > 0
                ? nextTotalCost / nextFirstBalance
                : undefined;
            const nextDaily = {
                date: dateKey,
                total: existingTotal,
                alphaPoints: existingAlphaPoints,
                nextThresholdDelta: existingNextThresholdDelta,
                tradeCount: existingTrades,
                firstBalance: nextFirstBalance,
                totalCost: nextTotalCost,
                currentBalance: nextCurrentBalance,
            };
            return {
                ...state,
                tokenSymbol: resolvedTokenSymbol,
                dailyBuyVolume: nextDaily,
                lastResult: state.lastResult
                    ? {
                        ...state.lastResult,
                        firstBalanceToday: nextDaily.firstBalance,
                        totalCostToday: nextDaily.totalCost,
                        costRatioToday: costRatio,
                        currentBalanceToday: nextDaily.currentBalance,
                    }
                    : undefined,
            };
        });
        sendResponse({ acknowledged: true });
        return true;
    }
    if (message.type === 'TASK_COMPLETE') {
        const timestamp = new Date().toISOString();
        const { success, details, meta } = message.payload;
        const normalizedDetails = normalizeDetail(details);
        const lastError = success ? undefined : (normalizedDetails ?? 'Unknown error');
        const buyVolumeDelta = normalizeVolumeDelta(meta?.buyVolumeDelta);
        const tradeDelta = normalizeCountDelta(meta?.successfulTradesDelta);
        const currentBalanceValue = normalizeBalance(meta?.currentBalance ?? meta?.availableBalanceBeforeOrder);
        const dateKey = timestamp.slice(0, 10);
        const tokenSymbol = normalizeTokenSymbol(meta?.tokenSymbol);
        let autoStopTriggered = false;
        let autoStopMessage;
        if (success && meta?.averagePrice !== undefined) {
            // eslint-disable-next-line no-console
            console.log('[alpha-auto-bot] Last VWAP result', {
                averagePrice: meta.averagePrice,
                tradeCount: meta.tradeCount,
                buyVolumeDelta,
                successfulTradesDelta: tradeDelta,
                tokenSymbol,
                details,
                timestamp,
            });
        }
        void updateSchedulerState((state) => {
            const previousDaily = state.dailyBuyVolume;
            const isSameDay = previousDaily?.date === dateKey;
            const existingTotal = isSameDay && typeof previousDaily?.total === 'number' ? previousDaily.total : 0;
            const updatedTotal = existingTotal + buyVolumeDelta;
            const existingTrades = isSameDay && typeof previousDaily?.tradeCount === 'number' ? previousDaily.tradeCount : 0;
            const updatedTrades = existingTrades + tradeDelta;
            const existingFirstBalance = isSameDay && typeof previousDaily?.firstBalance === 'number'
                ? previousDaily.firstBalance
                : undefined;
            const existingTotalCost = isSameDay && typeof previousDaily?.totalCost === 'number' ? previousDaily.totalCost : 0;
            const existingCurrentBalance = isSameDay && typeof previousDaily?.currentBalance === 'number'
                ? previousDaily.currentBalance
                : undefined;
            let nextFirstBalance = existingFirstBalance;
            let nextCurrentBalance = existingCurrentBalance;
            let nextTotalCost = existingTotalCost;
            if (currentBalanceValue !== undefined) {
                if (!isSameDay) {
                    nextFirstBalance = currentBalanceValue;
                    nextTotalCost = 0;
                }
                else if (nextFirstBalance === undefined) {
                    nextFirstBalance = currentBalanceValue;
                }
                nextCurrentBalance = currentBalanceValue;
            }
            else if (!isSameDay) {
                nextFirstBalance = undefined;
                nextCurrentBalance = undefined;
                nextTotalCost = 0;
            }
            if (typeof nextFirstBalance === 'number' &&
                Number.isFinite(nextFirstBalance) &&
                typeof nextCurrentBalance === 'number' &&
                Number.isFinite(nextCurrentBalance)) {
                const difference = nextFirstBalance - nextCurrentBalance;
                nextTotalCost = difference > 0 ? difference : 0;
            }
            const costRatio = typeof nextFirstBalance === 'number' &&
                Number.isFinite(nextFirstBalance) &&
                nextFirstBalance > 0
                ? nextTotalCost / nextFirstBalance
                : undefined;
            const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(updatedTotal);
            const previousTokenSymbol = state.tokenSymbol ?? state.lastResult?.tokenSymbol;
            const resolvedTokenSymbol = tokenSymbol ?? previousTokenSymbol;
            const configuredTarget = typeof state.settings?.pointsTarget === 'number'
                ? state.settings.pointsTarget
                : DEFAULT_POINTS_TARGET;
            const shouldAutoStop = state.isEnabled && alphaPoints >= configuredTarget;
            autoStopTriggered = shouldAutoStop;
            if (shouldAutoStop) {
                autoStopMessage = `Points target reached: ${alphaPoints} ≥ ${configuredTarget}. Automation paused.`;
            }
            const detailMessages = [];
            if (normalizedDetails) {
                detailMessages.push(normalizedDetails);
            }
            if (autoStopMessage) {
                detailMessages.push(autoStopMessage);
            }
            const mergedDetails = detailMessages.length > 0 ? detailMessages.join(' • ') : undefined;
            const nextDaily = {
                date: dateKey,
                total: updatedTotal,
                alphaPoints,
                nextThresholdDelta,
                tradeCount: updatedTrades,
                firstBalance: nextFirstBalance,
                totalCost: nextTotalCost,
                currentBalance: nextCurrentBalance,
            };
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
                    totalCostToday: nextDaily.totalCost,
                    costRatioToday: costRatio,
                    currentBalanceToday: nextDaily.currentBalance,
                },
            };
        });
        sendResponse({ acknowledged: true });
        if (autoStopTriggered) {
            void clearAutomationAlarm();
        }
        return true;
    }
    if (message.type === 'TASK_ERROR') {
        const normalizedMessage = normalizeDetail(message.payload.message);
        void updateSchedulerState((state) => ({
            ...state,
            isRunning: false,
            lastError: normalizedMessage ?? 'Unknown error',
            lastRun: state.lastRun,
        }));
        sendResponse({ acknowledged: true });
        return true;
    }
    if (message.type === 'CONTROL_START') {
        const tokenAddress = 'payload' in message ? message.payload?.tokenAddress : undefined;
        const tabId = 'payload' in message ? message.payload?.tabId : undefined;
        void (async () => {
            try {
                await handleControlStart(tokenAddress, tabId);
                sendResponse({ acknowledged: true });
            }
            catch (error) {
                sendResponse({ acknowledged: false, error: normalizeError(error) });
            }
        })();
        return true;
    }
    if (message.type === 'CONTROL_STOP') {
        void (async () => {
            try {
                await handleControlStop();
                sendResponse({ acknowledged: true });
            }
            catch (error) {
                sendResponse({ acknowledged: false, error: normalizeError(error) });
            }
        })();
        return true;
    }
    if (message.type === 'MANUAL_REFRESH') {
        const tokenAddress = 'payload' in message ? message.payload?.tokenAddress : undefined;
        const tabId = 'payload' in message ? message.payload?.tabId : undefined;
        void (async () => {
            try {
                await handleManualRefresh(tokenAddress, tabId);
                sendResponse({ acknowledged: true });
            }
            catch (error) {
                sendResponse({ acknowledged: false, error: normalizeError(error) });
            }
        })();
        return true;
    }
    return false;
});
async function bootstrapScheduler() {
    const state = await getSchedulerState();
    if (state.isEnabled) {
        await ensureAlarm();
        await updateSchedulerState((current) => ({
            ...current,
            isRunning: false,
            isEnabled: true,
        }));
        void scheduleImmediateRun();
        return;
    }
    await clearAutomationAlarm();
    await updateSchedulerState((current) => ({
        ...current,
        isRunning: false,
        isEnabled: false,
    }));
}
async function ensureAlarm() {
    const periodInMinutes = Math.max(intervalMinutes, MIN_ALARM_INTERVAL_MINUTES);
    chrome.alarms.create(alarmName, {
        delayInMinutes: INITIAL_DELAY_MINUTES,
        periodInMinutes,
    });
}
async function scheduleImmediateRun(options = {}) {
    if (immediateRunScheduled) {
        return;
    }
    immediateRunScheduled = true;
    try {
        await runAutomationCycle(options);
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[alpha-auto-bot] Immediate automation run failed', error);
    }
    finally {
        immediateRunScheduled = false;
    }
}
async function runAutomationCycle(options = {}) {
    const { force = false, trigger = 'schedule', tokenAddressOverride, targetTabId } = options;
    const state = await getSchedulerState();
    if (!force && !state.isEnabled) {
        if (state.isRunning) {
            await updateSchedulerState((current) => ({
                ...current,
                isRunning: false,
            }));
        }
        return;
    }
    await updateSchedulerState((current) => ({
        ...current,
        isRunning: true,
        lastError: undefined,
        isEnabled: force ? current.isEnabled : true,
    }));
    try {
        const effectiveToken = sanitizeTokenAddress(tokenAddressOverride) ??
            state.settings?.tokenAddress ??
            DEFAULT_AUTOMATION.tokenAddress;
        const targetUrl = resolveTargetUrl(effectiveToken);
        let tab;
        if (typeof targetTabId === 'number' && Number.isFinite(targetTabId)) {
            const existingTab = await getTab(targetTabId).catch(() => undefined);
            if (existingTab?.id !== undefined) {
                const existingToken = typeof existingTab.url === 'string' ? sanitizeTokenAddress(existingTab.url) : undefined;
                if (!existingToken || existingToken === effectiveToken) {
                    tab = existingTab;
                }
            }
        }
        if (!tab) {
            tab = await locateOrCreateTab({ url: targetUrl });
        }
        if (!tab?.id) {
            throw new Error('Failed to locate or open the automation tab.');
        }
        const runtimeMessage = trigger === 'manual' ? { type: 'RUN_TASK_ONCE' } : { type: 'RUN_TASK' };
        await sendMessageToTab(tab.id, runtimeMessage);
    }
    catch (error) {
        const message = normalizeError(error);
        await updateSchedulerState((state) => ({
            ...state,
            isRunning: false,
            lastError: message,
            lastRun: new Date().toISOString(),
        }));
    }
}
async function handleControlStart(tokenAddress, tabId) {
    await updateSchedulerState((state) => {
        const sanitizedToken = sanitizeTokenAddress(tokenAddress) ??
            state.settings.tokenAddress ??
            DEFAULT_AUTOMATION.tokenAddress;
        return {
            ...state,
            isEnabled: true,
            settings: {
                ...state.settings,
                tokenAddress: sanitizedToken,
            },
        };
    });
    await ensureAlarm();
    const sanitizedToken = sanitizeTokenAddress(tokenAddress);
    void scheduleImmediateRun({
        tokenAddressOverride: sanitizedToken,
        targetTabId: sanitizeTabId(tabId),
    });
}
async function handleControlStop() {
    await clearAutomationAlarm();
    await updateSchedulerState((state) => ({
        ...state,
        isEnabled: false,
        isRunning: false,
    }));
}
async function handleManualRefresh(tokenAddress, tabId) {
    if (tokenAddress) {
        await updateSchedulerState((state) => ({
            ...state,
            settings: {
                ...state.settings,
                tokenAddress: sanitizeTokenAddress(tokenAddress) ?? state.settings.tokenAddress,
            },
        }));
    }
    await runAutomationCycle({
        force: true,
        trigger: 'manual',
        tokenAddressOverride: tokenAddress,
        targetTabId: sanitizeTabId(tabId),
    });
}
async function clearAutomationAlarm() {
    await new Promise((resolve) => {
        chrome.alarms.clear(alarmName, () => resolve());
    });
}
function sanitizeTokenAddress(value) {
    if (!value) {
        return undefined;
    }
    const match = value.trim().match(/0x[a-fA-F0-9]{40}/u);
    return match ? match[0].toLowerCase() : undefined;
}
function sanitizeTabId(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }
    return value;
}
const MAX_MESSAGE_ATTEMPTS = 12;
async function sendMessageToTab(tabId, message, attempt = 1) {
    try {
        await new Promise((resolve, reject) => {
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
    }
    catch (error) {
        const messageText = normalizeError(error);
        const canRetry = attempt < MAX_MESSAGE_ATTEMPTS && /Receiving end does not exist/i.test(messageText);
        if (canRetry) {
            await delay(250 * attempt + 250);
            await sendMessageToTab(tabId, message, attempt + 1);
            return;
        }
        throw new Error(messageText);
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}
function normalizeVolumeDelta(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    return numeric;
}
function normalizeCountDelta(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    return Math.floor(numeric);
}
function normalizeBalance(value) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return undefined;
    }
    return numeric;
}
function normalizeTokenSymbol(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    return trimmed;
}
function calculateAlphaPointStats(volume) {
    if (!Number.isFinite(volume) || volume <= 0) {
        return { points: 0, nextThresholdDelta: 2 };
    }
    if (volume < 2) {
        return { points: 0, nextThresholdDelta: 2 - volume };
    }
    const rawPoints = Math.floor(Math.log2(volume));
    const points = rawPoints > 0 ? rawPoints : 0;
    const nextThreshold = Math.pow(2, points + 1);
    const delta = Math.max(0, nextThreshold - volume);
    return {
        points,
        nextThresholdDelta: delta,
    };
}
function normalizeError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object') {
        const message = error.message;
        if (typeof message === 'string' && message.trim().length > 0) {
            return message;
        }
    }
    try {
        return String(error);
    }
    catch {
        return 'Unknown error';
    }
}
function normalizeDetail(detail) {
    if (detail === undefined || detail === null) {
        return undefined;
    }
    if (typeof detail === 'string') {
        return detail;
    }
    if (detail && typeof detail === 'object') {
        const message = detail.message;
        if (typeof message === 'string') {
            return message;
        }
        try {
            return JSON.stringify(detail);
        }
        catch {
            return String(detail);
        }
    }
    return String(detail);
}
