import {
  DEFAULT_AUTOMATION,
  DEFAULT_POINTS_FACTOR,
  DEFAULT_POINTS_TARGET,
  DEFAULT_PRICE_OFFSET_PERCENT,
} from '../config/defaults.js';
import { STORAGE_KEY } from '../config/storageKey.js';

export interface TaskResultSnapshot {
  timestamp: string;
  details?: string;
  averagePrice?: number;
  tradeCount?: number;
  buyVolumeToday?: number;
  alphaPointsToday?: number;
  buyVolumeToNextPoint?: number;
  successfulTradesToday?: number;
  tokenSymbol?: string;
  firstBalanceToday?: number;
}

export type PriceOffsetMode = 'bullish' | 'sideways' | 'custom';

export interface SchedulerSettings {
  priceOffsetPercent: number;
  priceOffsetMode: PriceOffsetMode;
  buyPriceOffset: number;
  sellPriceOffset: number;
  tokenAddress: string;
  pointsFactor: number;
  pointsTarget: number;
}

export interface SchedulerState {
  lastRun?: string;
  lastError?: string;
  lastResult?: TaskResultSnapshot;
  isRunning: boolean;
  isEnabled: boolean;
  tokenSymbol?: string;
  dailyBuyVolume?: {
    date: string;
    total: number;
    alphaPoints?: number;
    nextThresholdDelta?: number;
    tradeCount?: number;
    firstBalance?: number;
  };
  settings: SchedulerSettings;
  requiresLogin?: boolean;
  sessionStartedAt?: string;
  sessionStoppedAt?: string;
}

const DEFAULT_SETTINGS: SchedulerSettings = {
  priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
  priceOffsetMode: 'sideways',
  buyPriceOffset: 0.01,
  sellPriceOffset: 0.01,
  tokenAddress: DEFAULT_AUTOMATION.tokenAddress,
  pointsFactor: DEFAULT_POINTS_FACTOR,
  pointsTarget: DEFAULT_POINTS_TARGET,
};

const MIN_PRICE_OFFSET_PERCENT = -5;
const MAX_PRICE_OFFSET_PERCENT = 5;
const MIN_POINTS_FACTOR = 1;
const MAX_POINTS_FACTOR = 1000;
const MIN_POINTS_TARGET = 1;
const MAX_POINTS_TARGET = 1000;

export async function getSchedulerState(): Promise<SchedulerState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY] as Partial<SchedulerState> | undefined;
      const fallback: SchedulerState = {
        isRunning: false,
        isEnabled: false,
        settings: { ...DEFAULT_SETTINGS },
        requiresLogin: false,
      };

      if (!stored) {
        resolve(fallback);
        return;
      }

      const storedSettings = (stored.settings ?? {}) as Partial<SchedulerSettings>;
      const settings: SchedulerSettings = {
        priceOffsetPercent: normalizePriceOffsetPercent(
          storedSettings.priceOffsetPercent ?? DEFAULT_SETTINGS.priceOffsetPercent,
        ),
        priceOffsetMode: normalizePriceOffsetMode(
          storedSettings.priceOffsetMode ?? DEFAULT_SETTINGS.priceOffsetMode,
        ),
        buyPriceOffset: normalizePriceOffsetPercent(
          storedSettings.buyPriceOffset ?? DEFAULT_SETTINGS.buyPriceOffset,
        ),
        sellPriceOffset: normalizePriceOffsetPercent(
          storedSettings.sellPriceOffset ?? DEFAULT_SETTINGS.sellPriceOffset,
        ),
        tokenAddress: normalizeTokenAddress(
          storedSettings.tokenAddress ?? DEFAULT_SETTINGS.tokenAddress,
        ),
        pointsFactor: normalizePointsFactor(
          storedSettings.pointsFactor ?? DEFAULT_SETTINGS.pointsFactor,
        ),
        pointsTarget: normalizePointsTarget(
          storedSettings.pointsTarget ?? DEFAULT_SETTINGS.pointsTarget,
        ),
      };

      resolve({
        ...fallback,
        ...stored,
        isRunning: stored.isRunning ?? false,
        isEnabled: stored.isEnabled ?? false,
        settings,
        requiresLogin: stored.requiresLogin === true,
      });
    });
  });
}

function normalizePriceOffsetMode(value: unknown): PriceOffsetMode {
  if (value === 'bullish' || value === 'sideways' || value === 'custom') {
    return value;
  }
  return DEFAULT_SETTINGS.priceOffsetMode;
}

function normalizePriceOffsetPercent(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.priceOffsetPercent;
  }

  return clamp(parsed);
}

function normalizeTokenAddress(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_SETTINGS.tokenAddress;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return DEFAULT_SETTINGS.tokenAddress;
  }

  const match = trimmed.match(/0x[a-fA-F0-9]{40}/u);
  return match ? match[0].toLowerCase() : DEFAULT_SETTINGS.tokenAddress;
}

function normalizePointsFactor(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampPointsFactor(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.pointsFactor;
  }

  return clampPointsFactor(parsed);
}

function normalizePointsTarget(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampPointsTarget(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.pointsTarget;
  }

  return clampPointsTarget(parsed);
}

function clamp(candidate: number): number {
  if (candidate < MIN_PRICE_OFFSET_PERCENT) {
    return MIN_PRICE_OFFSET_PERCENT;
  }

  if (candidate > MAX_PRICE_OFFSET_PERCENT) {
    return MAX_PRICE_OFFSET_PERCENT;
  }

  return Number(candidate.toFixed(6));
}

function clampPointsFactor(candidate: number): number {
  if (!Number.isFinite(candidate)) {
    return DEFAULT_SETTINGS.pointsFactor;
  }

  const floored = Math.floor(candidate);

  if (floored < MIN_POINTS_FACTOR) {
    return MIN_POINTS_FACTOR;
  }

  if (floored > MAX_POINTS_FACTOR) {
    return MAX_POINTS_FACTOR;
  }

  return floored;
}

function clampPointsTarget(candidate: number): number {
  if (!Number.isFinite(candidate)) {
    return DEFAULT_SETTINGS.pointsTarget;
  }

  const floored = Math.floor(candidate);

  if (floored < MIN_POINTS_TARGET) {
    return MIN_POINTS_TARGET;
  }

  if (floored > MAX_POINTS_TARGET) {
    return MAX_POINTS_TARGET;
  }

  return floored;
}

export async function setSchedulerState(state: SchedulerState): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}

export async function updateSchedulerState(
  mutation: (current: SchedulerState) => SchedulerState,
): Promise<void> {
  const current = await getSchedulerState();
  await setSchedulerState(mutation(current));
}
