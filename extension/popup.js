const STORAGE_KEY = 'alpha-auto-bot::state';
const DEFAULT_PRICE_OFFSET_PERCENT = 0.01;
const DEFAULT_POINTS_FACTOR = 1;
const DEFAULT_POINTS_TARGET = 15;
const MAX_PRICE_OFFSET_PERCENT = 5;
const MAX_POINTS_TARGET = 1000;
const BUILTIN_DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';
const BINANCE_ALPHA_PATTERN = /^https:\/\/www\.binance\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)alpha\/bsc\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/u;

const DEFAULT_BINANCE_ALPHA_URL = 'https://www.binance.com/en/alpha/bsc/0xe6df05ce8c8301223373cf5b969afcb1498c5528';
const DEFAULT_CONTROL_STATE = { isRunning: false, isEnabled: false };
let latestControlState = { ...DEFAULT_CONTROL_STATE };
let latestSchedulerState = null;
let controlsBusy = false;
let activeTabContext = {
  url: null,
  tokenAddress: null,
  tokenSymbol: null,
  currentBalance: null,
  tabId: null,
  isSupported: false
};

const startButton = document.getElementById('control-start');
const stopButton = document.getElementById('control-stop');
const refreshButton = document.getElementById('control-refresh');
const tokenDisplay = document.getElementById('control-token-display');
const tokenSymbolDisplay = document.getElementById('control-token-symbol');
const tokenAddressDisplay = document.getElementById('control-token-address');
const spreadInput = document.getElementById('control-spread');
const pointsFactorInput = document.getElementById('control-points-factor');
const pointsTargetInput = document.getElementById('control-points-target');
const DEFAULT_TOKEN_ADDRESS = BUILTIN_DEFAULT_TOKEN_ADDRESS;

function formatNumber(value, options) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('en-US', options);
}

function extractTokenFromText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const match = trimmed.match(/0x[a-fA-F0-9]{40}/u);
  return match ? match[0].toLowerCase() : null;
}

function extractTokenFromUrl(url) {
  if (typeof url !== 'string') {
    return null;
  }

  const match = url.match(BINANCE_ALPHA_PATTERN);
  if (!match) {
    return null;
  }

  return match[1].toLowerCase();
}

function formatErrorValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    const message = value.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
}

function formatSpreadInputValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return formatSpreadInputValue(DEFAULT_PRICE_OFFSET_PERCENT);
  }

  const fixed = value.toFixed(3);
  const trimmed = fixed.replace(/\.0+$/u, '').replace(/0+$/u, '').replace(/\.$/u, '');
  return trimmed.length > 0 ? trimmed : '0';
}

function clampPriceOffsetPercent(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }

  const clamped = Math.min(Math.max(value, 0), MAX_PRICE_OFFSET_PERCENT);
  return Number(clamped.toFixed(6));
}

function clampPointsFactor(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_FACTOR;
  }

  const floored = Math.floor(value);
  const clamped = Math.min(Math.max(floored, 1), 1000);
  return clamped;
}

function clampPointsTarget(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_TARGET;
  }

  const floored = Math.floor(value);
  const clamped = Math.min(Math.max(floored, 1), MAX_POINTS_TARGET);
  return clamped;
}

function getTokenAddress(state) {
  if (!state || typeof state !== 'object') {
    return DEFAULT_TOKEN_ADDRESS;
  }

  const settings = state.settings;
  if (settings && typeof settings === 'object' && 'tokenAddress' in settings) {
    const raw = settings.tokenAddress;
    if (typeof raw === 'string') {
      const candidate = extractTokenFromText(raw);
      if (candidate) {
        return candidate;
      }
    }
  }

  return DEFAULT_TOKEN_ADDRESS;
}

function getPriceOffsetPercent(state) {
  if (!state || typeof state !== 'object') {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }

  const settings = state.settings;
  if (settings && typeof settings === 'object' && 'priceOffsetPercent' in settings) {
    const raw = settings.priceOffsetPercent;
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(numeric)) {
      return clampPriceOffsetPercent(numeric);
    }
  }

  return DEFAULT_PRICE_OFFSET_PERCENT;
}

function getPointsFactor(state) {
  if (!state || typeof state !== 'object') {
    return DEFAULT_POINTS_FACTOR;
  }

  const settings = state.settings;
  if (settings && typeof settings === 'object' && 'pointsFactor' in settings) {
    const raw = settings.pointsFactor;
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(numeric)) {
      return clampPointsFactor(numeric);
    }
  }

  return DEFAULT_POINTS_FACTOR;
}

function getPointsTarget(state) {
  if (!state || typeof state !== 'object') {
    return DEFAULT_POINTS_TARGET;
  }

  const settings = state.settings;
  if (settings && typeof settings === 'object' && 'pointsTarget' in settings) {
    const raw = settings.pointsTarget;
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(numeric)) {
      return clampPointsTarget(numeric);
    }
  }

  return DEFAULT_POINTS_TARGET;
}

function spreadValuesDiffer(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }

  return Math.abs(a - b) > 1e-6;
}

function pointsFactorValuesDiffer(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }

  return Math.floor(a) !== Math.floor(b);
}

function pointsTargetValuesDiffer(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }

  return Math.floor(a) !== Math.floor(b);
}

async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY];
}

function normalizeControlState(state) {
  if (!state) {
    return { ...DEFAULT_CONTROL_STATE };
  }

  return {
    isRunning: Boolean(state.isRunning),
    isEnabled: state.isEnabled === true
  };
}

function applyControlState(controlState) {
  const state = controlState ?? DEFAULT_CONTROL_STATE;
  const canOperate = activeTabContext.isSupported === true;

  if (startButton) {
    startButton.disabled = controlsBusy || state.isEnabled || !canOperate;
  }

  if (stopButton) {
    stopButton.disabled = controlsBusy || !state.isEnabled;
  }

  if (refreshButton) {
    refreshButton.disabled = controlsBusy || state.isRunning || !canOperate;
  }

  if (spreadInput) {
    spreadInput.disabled = controlsBusy;
  }

  if (pointsFactorInput) {
    pointsFactorInput.disabled = controlsBusy;
  }

  if (pointsTargetInput) {
    pointsTargetInput.disabled = controlsBusy;
  }
}

function setControlsBusy(flag) {
  controlsBusy = flag;
  applyControlState(latestControlState);
}

async function handleControl(action) {
  setControlsBusy(true);
  let errorMessage;

  try {
    await action();
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Control request failed', error);
  } finally {
    setControlsBusy(false);
    await render();

    if (errorMessage) {
      const messageEl = document.getElementById('summary-message');
      if (messageEl) {
        messageEl.textContent = `Control request failed: ${errorMessage}`;
      }
    }
  }
}

async function dispatchControlMessage(type, payload) {
  const message = payload === undefined ? { type } : { type, payload };
  const response = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (result) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(runtimeError);
        return;
      }

      resolve(result);
    });
  });

  if (!response || response.acknowledged !== true) {
    const errorText = response?.error ? String(response.error) : 'Unable to reach background script.';
    throw new Error(errorText);
  }
}

async function handleSpreadChange() {
  if (!spreadInput) {
    return;
  }

  const rawValue = Number.parseFloat(spreadInput.value);
  if (Number.isNaN(rawValue)) {
    const fallbackValue = getPriceOffsetPercent(latestSchedulerState);
    spreadInput.value = formatSpreadInputValue(fallbackValue);
    return;
  }

  const sanitizedValue = clampPriceOffsetPercent(rawValue);
  spreadInput.value = formatSpreadInputValue(sanitizedValue);

  const currentValue = getPriceOffsetPercent(latestSchedulerState);
  if (!spreadValuesDiffer(currentValue, sanitizedValue)) {
    return;
  }

  try {
    await persistSchedulerSettings({ priceOffsetPercent: sanitizedValue });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Failed to persist price offset', error);

    const messageEl = document.getElementById('summary-message');
    if (messageEl) {
      const message = error instanceof Error ? error.message : String(error);
      messageEl.textContent = `Unable to save price offset: ${message}`;
    }
  }
}

async function handlePointsFactorChange() {
  if (!pointsFactorInput) {
    return;
  }

  const rawValue = Number.parseFloat(pointsFactorInput.value);
  if (Number.isNaN(rawValue)) {
    const fallback = getPointsFactor(latestSchedulerState);
    pointsFactorInput.value = String(fallback);
    return;
  }

  const sanitizedValue = clampPointsFactor(rawValue);
  pointsFactorInput.value = String(sanitizedValue);

  const currentValue = getPointsFactor(latestSchedulerState);
  if (!pointsFactorValuesDiffer(currentValue, sanitizedValue)) {
    return;
  }

  try {
    await persistSchedulerSettings({ pointsFactor: sanitizedValue });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Failed to persist points factor', error);

    const messageEl = document.getElementById('summary-message');
    if (messageEl) {
      const message = error instanceof Error ? error.message : String(error);
      messageEl.textContent = `Unable to save points factor: ${message}`;
    }
  }
}

async function handlePointsTargetChange() {
  if (!pointsTargetInput) {
    return;
  }

  const rawValue = Number.parseFloat(pointsTargetInput.value);
  if (Number.isNaN(rawValue)) {
    const fallback = getPointsTarget(latestSchedulerState);
    pointsTargetInput.value = String(fallback);
    return;
  }

  const sanitizedValue = clampPointsTarget(rawValue);
  pointsTargetInput.value = String(sanitizedValue);

  const currentValue = getPointsTarget(latestSchedulerState);
  if (!pointsTargetValuesDiffer(currentValue, sanitizedValue)) {
    return;
  }

  try {
    await persistSchedulerSettings({ pointsTarget: sanitizedValue });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Failed to persist points target', error);

    const messageEl = document.getElementById('summary-message');
    if (messageEl) {
      const message = error instanceof Error ? error.message : String(error);
      messageEl.textContent = `Unable to save points target: ${message}`;
    }
  }
}

if (startButton) {
  startButton.addEventListener('click', () => {
    void handleControl(async () => {
      if (!activeTabContext.isSupported || !activeTabContext.tokenAddress) {
        throw new Error('Open a Binance Alpha token page in the active tab to start automation.');
      }

      const payload = {
        tokenAddress: activeTabContext.tokenAddress
      };

      if (typeof activeTabContext.tabId === 'number') {
        payload.tabId = activeTabContext.tabId;
      }

      await dispatchControlMessage('CONTROL_START', payload);
    });
  });
}

if (stopButton) {
  stopButton.addEventListener('click', () => {
    void handleControl(() => dispatchControlMessage('CONTROL_STOP'));
  });
}

if (refreshButton) {
  refreshButton.addEventListener('click', () => {
    void handleControl(async () => {
      if (!activeTabContext.isSupported || !activeTabContext.tokenAddress) {
        throw new Error('Open a Binance Alpha token page in the active tab before refreshing.');
      }

      const payload = {
        tokenAddress: activeTabContext.tokenAddress
      };

      if (typeof activeTabContext.tabId === 'number') {
        payload.tabId = activeTabContext.tabId;
      }

      await dispatchControlMessage('MANUAL_REFRESH', payload);
    });
  });
}

if (spreadInput) {
  spreadInput.addEventListener('change', () => {
    void handleSpreadChange();
  });
}

if (pointsFactorInput) {
  pointsFactorInput.addEventListener('change', () => {
    void handlePointsFactorChange();
  });
}

if (pointsTargetInput) {
  pointsTargetInput.addEventListener('change', () => {
    void handlePointsTargetChange();
  });
}

async function persistSchedulerSettings(settingsPatch) {
  const baseState =
    latestSchedulerState ??
    (await loadState()) ?? {
      isRunning: false,
      isEnabled: false,
      settings: {
        priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        pointsFactor: DEFAULT_POINTS_FACTOR,
        pointsTarget: DEFAULT_POINTS_TARGET
      }
    };

  const baseSettings =
    baseState.settings && typeof baseState.settings === 'object'
      ? baseState.settings
      : {
          priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
          tokenAddress: DEFAULT_TOKEN_ADDRESS,
          pointsFactor: DEFAULT_POINTS_FACTOR,
          pointsTarget: DEFAULT_POINTS_TARGET
        };

  const nextState = {
    ...baseState,
    settings: {
      priceOffsetPercent: getPriceOffsetPercent({ settings: baseSettings }),
      tokenAddress: getTokenAddress({ settings: baseSettings }),
      pointsFactor: getPointsFactor({ settings: baseSettings }),
      pointsTarget: getPointsTarget({ settings: baseSettings }),
      ...settingsPatch
    }
  };

  latestSchedulerState = nextState;

  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: nextState }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

async function refreshActiveTabContext() {
  const previousContext = activeTabContext;
  try {
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (results) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(results);
      });
    });

    const [currentTab] = tabs;
    const url = typeof currentTab?.url === 'string' ? currentTab.url : null;
    const tokenAddress = url ? extractTokenFromUrl(url) : null;
    const tabId = typeof currentTab?.id === 'number' ? currentTab.id : null;
    let tokenSymbol = null;
    let currentBalance = null;

    if (tabId !== null && tokenAddress) {
      [tokenSymbol, currentBalance] = await Promise.all([
        requestTokenSymbolFromTab(tabId),
        requestCurrentBalanceFromTab(tabId)
      ]);
    }

    if (!tokenSymbol && previousContext.tokenAddress === tokenAddress && previousContext.tokenSymbol) {
      tokenSymbol = previousContext.tokenSymbol;
    }

    if (
      (currentBalance === null || Number.isNaN(currentBalance)) &&
      previousContext.tokenAddress === tokenAddress &&
      typeof previousContext.currentBalance === 'number'
    ) {
      currentBalance = previousContext.currentBalance;
    }

    activeTabContext = {
      url,
      tokenAddress,
      tokenSymbol,
      currentBalance,
      tabId,
      isSupported: Boolean(tokenAddress)
    };
  } catch (error) {
    activeTabContext = {
      url: null,
      tokenAddress: null,
      tokenSymbol: null,
      currentBalance: null,
      tabId: null,
      isSupported: false
    };

    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Unable to inspect active tab URL', error);
  }
}

async function requestTokenSymbolFromTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_TOKEN_SYMBOL' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const value = typeof response?.tokenSymbol === 'string' ? response.tokenSymbol.trim() : '';
      resolve(value.length > 0 ? value : null);
    });
  });
}

async function requestCurrentBalanceFromTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_CURRENT_BALANCE' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const value = typeof response?.currentBalance === 'number' ? response.currentBalance : null;
      if (value === null || Number.isNaN(value)) {
        resolve(null);
        return;
      }

      resolve(value);
    });
  });
}

async function render() {
  const messageEl = document.getElementById('summary-message');
  const gridEl = document.getElementById('summary-grid');
  const priceEl = document.getElementById('summary-price');
  const dailyVolumeEl = document.getElementById('summary-daily-volume');
  const firstBalanceEl = document.getElementById('summary-first-balance');
  const currentBalanceEl = document.getElementById('summary-current-balance');
  const totalCostEl = document.getElementById('summary-total-cost');
  const costRatioEl = document.getElementById('summary-cost-ratio');
  const alphaPointsEl = document.getElementById('summary-alpha-points');
  const alphaNextEl = document.getElementById('summary-alpha-next');
  const successfulTradesEl = document.getElementById('summary-successful-trades');
  const timestampEl = document.getElementById('summary-timestamp');

  if (
    !messageEl ||
    !gridEl ||
    !priceEl ||
    !dailyVolumeEl ||
    !firstBalanceEl ||
    !currentBalanceEl ||
    !totalCostEl ||
    !costRatioEl ||
    !alphaPointsEl ||
    !alphaNextEl ||
    !successfulTradesEl ||
    !timestampEl
  ) {
    return;
  }

  gridEl.style.display = 'none';

  try {
    await refreshActiveTabContext();

    const state = await loadState();
    latestSchedulerState = state ?? null;

    const activeTokenAddress = activeTabContext.tokenAddress;
    let symbolFromState = null;

    if (activeTokenAddress) {
      const storedTokenAddress =
        state?.settings && typeof state.settings.tokenAddress === 'string'
          ? extractTokenFromText(state.settings.tokenAddress)
          : null;

      if (storedTokenAddress && storedTokenAddress === activeTokenAddress) {
        if (state && typeof state.tokenSymbol === 'string') {
          symbolFromState = state.tokenSymbol;
        } else if (state?.lastResult && typeof state.lastResult.tokenSymbol === 'string') {
          symbolFromState = state.lastResult.tokenSymbol;
        }
      }
    }

    if (tokenDisplay) {
      tokenDisplay.classList.remove('token-display--invalid');

      if (activeTabContext.isSupported && activeTabContext.tokenAddress) {
        const resolvedSymbol = activeTabContext.tokenSymbol ?? symbolFromState;
        if (tokenSymbolDisplay) {
          tokenSymbolDisplay.textContent = resolvedSymbol ?? '—';
        }
        if (tokenAddressDisplay) {
          tokenAddressDisplay.textContent = activeTabContext.tokenAddress;
        }
      } else if (activeTabContext.url) {
        if (tokenSymbolDisplay) {
          tokenSymbolDisplay.textContent = '—';
        }
        if (tokenAddressDisplay) {
          tokenAddressDisplay.innerHTML = `<a href="${DEFAULT_BINANCE_ALPHA_URL}" target="_blank" rel="noopener noreferrer">Open a Binance Alpha token page</a>`;
        }
        tokenDisplay.classList.add('token-display--invalid');
      } else {
        if (tokenSymbolDisplay) {
          tokenSymbolDisplay.textContent = '—';
        }
        if (tokenAddressDisplay) {
          tokenAddressDisplay.innerHTML = `<a href="${DEFAULT_BINANCE_ALPHA_URL}" target="_blank" rel="noopener noreferrer">Open a Binance Alpha token page</a>`;
        }
        tokenDisplay.classList.add('token-display--invalid');
      }
    }

    if (spreadInput) {
      const offsetValue = getPriceOffsetPercent(state);
      spreadInput.value = formatSpreadInputValue(offsetValue);
    }

    if (pointsFactorInput) {
      const factorValue = getPointsFactor(state);
      pointsFactorInput.value = String(factorValue);
    }

    const pointsTargetValue = getPointsTarget(state);

    if (pointsTargetInput) {
      pointsTargetInput.value = String(pointsTargetValue);
    }

    latestControlState = normalizeControlState(state);
    applyControlState(latestControlState);

    const statusParts = [];
    if (!activeTabContext.isSupported) {
      statusParts.push('Active tab unsupported. Open a Binance Alpha token page to enable controls.');
    }

    const fallbackCurrentBalance =
      typeof activeTabContext.currentBalance === 'number' && Number.isFinite(activeTabContext.currentBalance)
        ? activeTabContext.currentBalance
        : null;

    if (!state) {
      statusParts.push('No automation data yet. Trigger a run to capture VWAP.');
      messageEl.textContent = statusParts.join(' • ');
      priceEl.textContent = '—';
      dailyVolumeEl.textContent = '—';
      firstBalanceEl.textContent = '—';
      currentBalanceEl.textContent = formatNumber(fallbackCurrentBalance, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      totalCostEl.textContent = '—';
      costRatioEl.textContent = '—';
      alphaPointsEl.textContent = '—';
      alphaNextEl.textContent = '—';
      successfulTradesEl.textContent = '—';
      timestampEl.textContent = '—';
      gridEl.style.display = 'grid';
      gridEl.style.rowGap = '4px';
      return;
    }

    if (latestControlState.isEnabled) {
      statusParts.push(latestControlState.isRunning ? 'Automation running' : 'Automation idle');
    } else {
      statusParts.push('Automation paused');
    }

    if (state.lastError) {
      statusParts.push(`Last error: ${formatErrorValue(state.lastError)}`);
    }

    const snapshot = state.lastResult;

    if (!snapshot) {
      statusParts.push('No VWAP snapshots yet.');
      messageEl.textContent = statusParts.join(' • ');
      return;
    }

    statusParts.push('Latest VWAP snapshot below.');
    messageEl.textContent = statusParts.join(' • ');

    priceEl.textContent = formatNumber(snapshot.averagePrice, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8
    });

    const todayKey = new Date().toISOString().slice(0, 10);
    let todaysVolume;
    if (state.dailyBuyVolume && state.dailyBuyVolume.date === todayKey) {
      todaysVolume = state.dailyBuyVolume.total;
    } else if (typeof snapshot.buyVolumeToday === 'number') {
      todaysVolume = snapshot.buyVolumeToday;
    }

    dailyVolumeEl.textContent = formatNumber(todaysVolume, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let todaysFirstBalance;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.firstBalance === 'number'
    ) {
      todaysFirstBalance = state.dailyBuyVolume.firstBalance;
    } else if (typeof snapshot.firstBalanceToday === 'number') {
      todaysFirstBalance = snapshot.firstBalanceToday;
    }

    firstBalanceEl.textContent = formatNumber(todaysFirstBalance, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let currentBalance = fallbackCurrentBalance ?? undefined;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.currentBalance === 'number'
    ) {
      currentBalance = state.dailyBuyVolume.currentBalance;
    } else if (typeof snapshot.currentBalanceToday === 'number') {
      currentBalance = snapshot.currentBalanceToday;
    }

    currentBalanceEl.textContent = formatNumber(currentBalance, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let todaysTotalCost;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.totalCost === 'number'
    ) {
      todaysTotalCost = state.dailyBuyVolume.totalCost;
    } else if (typeof snapshot.totalCostToday === 'number') {
      todaysTotalCost = snapshot.totalCostToday;
    }

    if (
      (todaysTotalCost === undefined || !Number.isFinite(todaysTotalCost)) &&
      typeof todaysFirstBalance === 'number' &&
      Number.isFinite(todaysFirstBalance) &&
      typeof currentBalance === 'number' &&
      Number.isFinite(currentBalance)
    ) {
      const difference = todaysFirstBalance - currentBalance;
      todaysTotalCost = difference > 0 ? difference : 0;
    }

    totalCostEl.textContent = formatNumber(todaysTotalCost, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let todaysCostRatio;
    if (
      typeof todaysFirstBalance === 'number' &&
      Number.isFinite(todaysFirstBalance) &&
      todaysFirstBalance > 0 &&
      typeof todaysTotalCost === 'number' &&
      Number.isFinite(todaysTotalCost)
    ) {
      todaysCostRatio = todaysTotalCost / todaysFirstBalance;
    } else if (typeof snapshot.costRatioToday === 'number') {
      todaysCostRatio = snapshot.costRatioToday;
    }

    if (typeof todaysCostRatio === 'number' && Number.isFinite(todaysCostRatio)) {
      costRatioEl.textContent = `${(todaysCostRatio * 100).toFixed(2)}%`;
    } else {
      costRatioEl.textContent = '—';
    }

    let todaysAlphaPoints;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.alphaPoints === 'number'
    ) {
      todaysAlphaPoints = state.dailyBuyVolume.alphaPoints;
    } else if (typeof snapshot.alphaPointsToday === 'number') {
      todaysAlphaPoints = snapshot.alphaPointsToday;
    }

    if (typeof todaysAlphaPoints === 'number' && Number.isFinite(todaysAlphaPoints)) {
      alphaPointsEl.textContent = todaysAlphaPoints.toString();
      if (todaysAlphaPoints >= pointsTargetValue) {
        statusParts.push(
          `Points target reached (${todaysAlphaPoints} ≥ ${pointsTargetValue}). Automation paused.`
        );
      }
    } else {
      alphaPointsEl.textContent = '—';
    }

    let nextPointDelta;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.nextThresholdDelta === 'number'
    ) {
      nextPointDelta = state.dailyBuyVolume.nextThresholdDelta;
    } else if (typeof snapshot.buyVolumeToNextPoint === 'number') {
      nextPointDelta = snapshot.buyVolumeToNextPoint;
    }

    alphaNextEl.textContent = formatNumber(nextPointDelta, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    let successfulTrades;
    if (
      state.dailyBuyVolume &&
      state.dailyBuyVolume.date === todayKey &&
      typeof state.dailyBuyVolume.tradeCount === 'number'
    ) {
      successfulTrades = state.dailyBuyVolume.tradeCount;
    } else if (typeof snapshot.successfulTradesToday === 'number') {
      successfulTrades = snapshot.successfulTradesToday;
    }

    if (typeof successfulTrades === 'number' && Number.isFinite(successfulTrades)) {
      successfulTradesEl.textContent = successfulTrades.toString();
    } else {
      successfulTradesEl.textContent = '—';
    }
    timestampEl.textContent = snapshot.timestamp
      ? new Date(snapshot.timestamp).toLocaleString()
      : '—';

    gridEl.style.display = 'grid';
    gridEl.style.rowGap = '4px';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    messageEl.textContent = `Unable to load VWAP data: ${message}`;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[STORAGE_KEY]) {
    return;
  }

  void render();
});

void render();
