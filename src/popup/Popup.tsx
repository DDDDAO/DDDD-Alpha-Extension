import {
  BellOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  InputNumber,
  List,
  Radio,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_BUY_PRICE_OFFSET_PERCENT,
  DEFAULT_SELL_PRICE_OFFSET_PERCENT,
  MAX_SUCCESSFUL_TRADES,
  SUCCESSFUL_TRADES_LIMIT_MESSAGE,
} from '../config/defaults.js';
import {
  PLUGIN_DESC_CLOSED_KEY,
  STORAGE_KEY,
  TOKEN_DIRECTORY_STORAGE_KEY,
} from '../config/storageKey.js';
import { useI18nUrl } from '../i18n/useI18nUrl';
import type { ProcessedAirdrop } from '../lib/airdrop.js';
import { AIRDROP_STORAGE_KEY } from '../lib/airdrop.js';
import { calculateAlphaPointStats } from '../lib/alphaPoints.js';
import type {
  FetchOrderHistoryResponse,
  OrderHistorySnapshotPayload,
  RuntimeMessage,
} from '../lib/messages.js';
import { postRuntimeMessage } from '../lib/messages.js';
import { buildOrderHistoryUrl, summarizeOrderHistoryData } from '../lib/orderHistory.js';
import type { PriceOffsetMode, SchedulerState } from '../lib/storage';
import { LanguageSwitcher } from './LanguageSwitcher';

const { Text, Link, Title } = Typography;
const GITHUB_REPO_URL = 'https://github.com/DDDDAO/DDDD-Alpha-Extension';
const GITHUB_MARK_URL = chrome.runtime.getURL('github-mark.svg');
const POPUP_LOGO_URL = chrome.runtime.getURL('logo2.png');
const TG_LOGO_URL = chrome.runtime.getURL('tg_logo.svg');
const LOGO_WITH_NAME_URL = chrome.runtime.getURL('logo_with_name.svg');

const DEFAULT_PRICE_OFFSET_PERCENT = 0.01;
const DEFAULT_POINTS_FACTOR = 1;
const DEFAULT_POINTS_TARGET = 15;
const BUILTIN_DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';
const BINANCE_ALPHA_PATTERN =
  /^https:\/\/www\.binance\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)alpha\/bsc\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/u;

const TOKEN_LIST_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';

// 稳定性相关常量
const STABILITY_FEED_URL = 'https://alpha123.uk/stability/stability_feed_v2.json';
const STABILITY_UPDATE_INTERVAL = 30000; // 30秒更新一次
const MAX_SPREAD_THRESHOLD = 2.0; // 价差基点阈值

// 空投提醒相关常量
const AIRDROP_UPDATE_INTERVAL = 60000; // 60秒更新一次（popup打开时）
const TOKEN_DIRECTORY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10分钟更新一次

interface TokenDirectoryEntry {
  symbol: string;
  contractAddress: string;
  iconUrl: string | null;
  mulPoint: number | null;
  alphaId?: string | null;
}

interface TokenListItem {
  symbol: string;
  contractAddress: string;
  iconUrl: string;
  mulPoint: number;
  alphaId: string;
}

interface TokenListResponse {
  code?: string;
  data?: TokenListItem[] | null;
}

interface TokenDirectoryCachePayload {
  directory?: Record<string, TokenDirectoryEntry>;
  updatedAt?: number;
}

function extractStoredTokenDirectory(value: unknown): Record<string, TokenDirectoryEntry> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const container = value as TokenDirectoryCachePayload;
  const directoryCandidate = container.directory ?? value;

  if (!directoryCandidate || typeof directoryCandidate !== 'object') {
    return null;
  }

  return directoryCandidate as Record<string, TokenDirectoryEntry>;
}

const FALLBACK_TOKEN_DIRECTORY: Record<string, TokenDirectoryEntry> = {
  AOP: {
    symbol: 'AOP',
    contractAddress: '0xd5df4d260d7a0145f655bcbf3b398076f21016c7',
    iconUrl: null,
    mulPoint: null,
  },
  ALEO: {
    symbol: 'ALEO',
    contractAddress: '0x6cfffa5bfd4277a04d83307feedfe2d18d944dd2',
    iconUrl: null,
    mulPoint: null,
  },
  NUMI: {
    symbol: 'NUMI',
    contractAddress: '0xc61eb549acf4a05ed6e3fe0966f5e213b23541ce',
    iconUrl: null,
    mulPoint: null,
  },
  ZEUS: {
    symbol: 'ZEUS',
    contractAddress: '0xa2be3e48170a60119b5f0400c65f65f3158fbeee',
    iconUrl: null,
    mulPoint: null,
  },
  KOGE: {
    symbol: 'KOGE',
    contractAddress: '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
    iconUrl: null,
    mulPoint: null,
  },
  STAR: {
    symbol: 'STAR',
    contractAddress: '0x8fce7206e3043dd360f115afa956ee31b90b787c',
    iconUrl: null,
    mulPoint: null,
  },
  POP: {
    symbol: 'POP',
    contractAddress: '0xa3cfb853339b77f385b994799b015cb04b208fe6',
    iconUrl: null,
    mulPoint: null,
  },
  FROGGIE: {
    symbol: 'FROGGIE',
    contractAddress: '0xa45f5eb48cecd034751651aeeda6271bd5df8888',
    iconUrl: null,
    mulPoint: null,
  },
};

interface StabilityItem {
  n: string; // 币种名称
  p: number; // 价格
  st: string; // 稳定性状态
  md: number; // 4倍天数
  spr: number; // 价差基点
}

interface StabilityFeed {
  lastUpdated: number;
  items: StabilityItem[];
}

interface ActiveTabContext {
  url: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  currentBalance: number | null;
  tabId: number | null;
  isSupported: boolean;
}

function formatSessionDuration(durationMs: number | null, locale: string): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return '—';
  }

  const totalSeconds = Math.floor(durationMs / 1000);

  if (totalSeconds < 60) {
    if (locale.startsWith('zh')) {
      return `${totalSeconds} 秒`;
    }

    const label = totalSeconds === 1 ? 'second' : 'seconds';
    return `${totalSeconds} ${label}`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    if (locale.startsWith('zh')) {
      return `${minutes} 分钟`;
    }

    const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
    return `${minutes} ${minuteLabel}`;
  }

  if (locale.startsWith('zh')) {
    return `${minutes} 分 ${seconds} 秒`;
  }

  const minuteLabel = minutes === 1 ? 'minute' : 'minutes';
  const secondLabel = seconds === 1 ? 'second' : 'seconds';
  return `${minutes} ${minuteLabel} ${seconds} ${secondLabel}`;
}

export function Popup(): React.ReactElement {
  const { t, i18n } = useTranslation();
  const { getBinanceAlphaUrl } = useI18nUrl();
  const [state, setState] = useState<SchedulerState | null>(null);
  const [tokenDirectory, setTokenDirectory] = useState<Record<string, TokenDirectoryEntry>>({
    ...FALLBACK_TOKEN_DIRECTORY,
  });
  const [activeTab, setActiveTab] = useState<ActiveTabContext>({
    url: null,
    tokenAddress: null,
    tokenSymbol: null,
    currentBalance: null,
    tabId: null,
    isSupported: false,
  });
  const [controlsBusy, setControlsBusy] = useState(false);
  const [resettingInitialBalance, setResettingInitialBalance] = useState(false);
  const [priceOffsetMode, setPriceOffsetMode] = useState<PriceOffsetMode>('sideways');
  const [buyPriceOffset, setBuyPriceOffset] = useState('0.01');
  const [sellPriceOffset, setSellPriceOffset] = useState('-0.01');
  const [localPointsFactor, setLocalPointsFactor] = useState('1');
  const [localPointsTarget, setLocalPointsTarget] = useState('15');
  const [stableCoins, setStableCoins] = useState<StabilityItem[]>([]);
  const [stabilityLoading, setStabilityLoading] = useState(false);
  const [airdropToday, setAirdropToday] = useState<ProcessedAirdrop[]>([]);
  const [airdropForecast, setAirdropForecast] = useState<ProcessedAirdrop[]>([]);
  const [airdropLoading, setAirdropLoading] = useState(false);
  const [orderHistoryError, setOrderHistoryError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [pluginDescClosed, setPluginDescClosed] = useState(false);

  const isEditingPointsFactor = useRef(false);
  const isEditingPointsTarget = useRef(false);
  const isEditingBuyPriceOffset = useRef(false);
  const isEditingSellPriceOffset = useRef(false);
  const settingsUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const orderHistoryRequestState = useRef<{
    tabId: number | null;
    status: 'idle' | 'pending' | 'success';
  }>({
    tabId: null,
    status: 'idle',
  });
  const hasRequestedAveragePrice = useRef(false);

  const pointsFactorId = useId();
  const pointsTargetId = useId();

  const normalizedActiveTokenAddress = activeTab.tokenAddress?.toLowerCase() ?? null;
  const tokenEntries = useMemo(() => Object.values(tokenDirectory), [tokenDirectory]);
  const tokenDirectoryAlphaIdMap = useMemo(() => {
    const map: Record<string, TokenDirectoryEntry> = {};
    for (const entry of Object.values(tokenDirectory)) {
      if (!entry) {
        continue;
      }

      const alphaIdRaw = typeof entry.alphaId === 'string' ? entry.alphaId.trim() : '';
      if (alphaIdRaw.length === 0) {
        continue;
      }

      map[alphaIdRaw.toUpperCase()] = entry;
    }

    return map;
  }, [tokenDirectory]);
  const tokenInfoByAddress = useMemo(
    () =>
      normalizedActiveTokenAddress
        ? tokenEntries.find((entry) => entry.contractAddress === normalizedActiveTokenAddress)
        : undefined,
    [normalizedActiveTokenAddress, tokenEntries],
  );

  const requestTokenSymbolFromTab = useCallback(async (tabId: number): Promise<string | null> => {
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
  }, []);

  const requestCurrentBalanceFromTab = useCallback(
    async (tabId: number): Promise<number | null> => {
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'REQUEST_CURRENT_BALANCE' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          const value =
            typeof response?.currentBalance === 'number' ? response.currentBalance : null;
          if (value === null || Number.isNaN(value)) {
            resolve(null);
            return;
          }
          resolve(value);
        });
      });
    },
    [],
  );

  const fetchTokenDirectory = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(TOKEN_LIST_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const payload: TokenListResponse = await response.json();
      if (payload.code !== '000000' || !Array.isArray(payload.data)) {
        throw new Error('Unexpected token list response structure');
      }

      const nextDirectory: Record<string, TokenDirectoryEntry> = {
        ...FALLBACK_TOKEN_DIRECTORY,
      };

      for (const token of payload.data) {
        const rawSymbol = typeof token.symbol === 'string' ? token.symbol.trim() : '';
        const rawAddress =
          typeof token.contractAddress === 'string' ? token.contractAddress.trim() : '';

        if (rawSymbol.length === 0 || !/^0x[a-fA-F0-9]{40}$/u.test(rawAddress)) {
          continue;
        }

        const normalizedSymbol = rawSymbol.toUpperCase();
        const contractAddress = rawAddress.toLowerCase();
        const iconUrl =
          typeof token.iconUrl === 'string' && token.iconUrl.trim().length > 0
            ? token.iconUrl.trim()
            : null;

        let mulPoint: number | null = null;
        if (typeof token.mulPoint === 'number') {
          mulPoint = Number.isFinite(token.mulPoint) ? clampPointsFactor(token.mulPoint) : null;
        } else if (typeof token.mulPoint === 'string') {
          const parsed = Number(token.mulPoint.trim());
          mulPoint = Number.isFinite(parsed) ? clampPointsFactor(parsed) : null;
        }

        if (mulPoint !== null && mulPoint <= 0) {
          mulPoint = null;
        }

        const rawAlphaId = typeof token.alphaId === 'string' ? token.alphaId.trim() : '';
        const alphaId = rawAlphaId.length > 0 ? rawAlphaId.toUpperCase() : null;

        nextDirectory[normalizedSymbol] = {
          symbol: normalizedSymbol,
          contractAddress,
          iconUrl,
          mulPoint,
          alphaId,
        };
      }

      setTokenDirectory(nextDirectory);
      await chrome.storage.local.set({
        [TOKEN_DIRECTORY_STORAGE_KEY]: {
          directory: nextDirectory,
          updatedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error('Failed to fetch token list:', error);
    }
  }, []);

  // 获取稳定币种数据
  const fetchStableCoins = useCallback(async (): Promise<void> => {
    try {
      setStabilityLoading(true);
      const response = await fetch(STABILITY_FEED_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: StabilityFeed = await response.json();

      // 筛选：只保留稳定性为"stable"的币种，完全移除"moderate"和"unstable"，并排除KOGE
      const filtered = data.items
        .filter((item) => {
          // 只保留稳定性为 "green:stable" 的币种
          const isStable = item.st === 'green:stable';
          const isLowSpread = item.spr <= MAX_SPREAD_THRESHOLD;
          // 排除KOGE币种
          const coinSymbol = item.n.replace('/USDT', '').trim().toUpperCase();
          const isNotKOGE = coinSymbol !== 'KOGE';
          return isStable && isLowSpread && isNotKOGE;
        })
        .sort((a, b) => a.spr - b.spr) // 按价差从小到大排序
        .slice(0, 5); // 最多显示5个

      setStableCoins(filtered);
    } catch (error) {
      console.error('获取稳定币种失败:', error);
      setStableCoins([]);
    } finally {
      setStabilityLoading(false);
    }
  }, []);

  // 【最简方案】直接从 Service Worker 的 storage 中读取数据
  // Service Worker 会每 30 分钟自动更新空投数据
  const fetchAirdrops = useCallback(async (): Promise<void> => {
    try {
      setAirdropLoading(true);
      console.log('[Popup] 🔄 从 storage 加载空投数据...');

      // 从 storage 读取 Service Worker 已获取的数据
      const result = await chrome.storage.local.get(AIRDROP_STORAGE_KEY);
      const cachedData = result[AIRDROP_STORAGE_KEY];

      if (!cachedData || !cachedData.timestamp) {
        console.log('[Popup] 📭 无缓存数据，请求 Service Worker 立即更新...');

        // 通知 Service Worker 立即更新数据
        await chrome.runtime.sendMessage({ type: 'UPDATE_AIRDROP_NOW' });

        // 等待 1 秒后重新读取
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const retryResult = await chrome.storage.local.get(AIRDROP_STORAGE_KEY);
        const retryData = retryResult[AIRDROP_STORAGE_KEY];

        if (retryData?.today) {
          setAirdropToday(retryData.today);
          setAirdropForecast(retryData.forecast || []);
          console.log('[Popup] ✅ 数据加载成功（重试）');
        } else {
          setAirdropToday([]);
          setAirdropForecast([]);
          console.log('[Popup] ⚠️ 仍无数据');
        }
        return;
      }

      // 检查数据新鲜度（5分钟内的数据视为新鲜）
      const dataAge = Date.now() - cachedData.timestamp;
      const isFresh = dataAge < 5 * 60 * 1000;

      console.log(
        `[Popup] 📦 缓存数据年龄: ${Math.round(dataAge / 1000)}秒 ${isFresh ? '✅' : '⚠️ 过期'}`,
      );

      // 使用缓存数据
      setAirdropToday(cachedData.today || []);
      setAirdropForecast(cachedData.forecast || []);

      console.log('[Popup] 今日空投:', cachedData.today?.length || 0, '个');
      console.log('[Popup] 预告空投:', cachedData.forecast?.length || 0, '个');
      console.log('[Popup] ✅ 数据加载成功');

      // 如果数据过期，在后台触发更新（不阻塞 UI）
      if (!isFresh) {
        console.log('[Popup] 🔄 后台触发数据更新...');
        chrome.runtime.sendMessage({ type: 'UPDATE_AIRDROP_NOW' }).catch((err) => {
          console.warn('[Popup] 触发更新失败:', err);
        });
      }
    } catch (error) {
      console.error('[Popup] ❌ 加载失败:', error);
      setAirdropToday([]);
      setAirdropForecast([]);
    } finally {
      setAirdropLoading(false);
    }
  }, []);

  // Load initial state
  const loadState = useCallback(async (): Promise<void> => {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    setState(result[STORAGE_KEY] ?? null);
  }, []);

  const refreshActiveTab = useCallback(async (): Promise<void> => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const [currentTab] = tabs;
      const url = currentTab?.url ?? null;
      const tokenAddress = url ? extractTokenFromUrl(url) : null;
      const tabId = typeof currentTab?.id === 'number' ? currentTab.id : null;

      let tokenSymbol: string | null = null;
      let currentBalance: number | null = null;

      if (tabId !== null && tokenAddress) {
        [tokenSymbol, currentBalance] = await Promise.all([
          requestTokenSymbolFromTab(tabId),
          requestCurrentBalanceFromTab(tabId),
        ]);
      }

      setActiveTab({
        url,
        tokenAddress,
        tokenSymbol,
        currentBalance,
        tabId,
        isSupported: Boolean(tokenAddress),
      });
    } catch {
      setActiveTab({
        url: null,
        tokenAddress: null,
        tokenSymbol: null,
        currentBalance: null,
        tabId: null,
        isSupported: false,
      });
    }
  }, [requestCurrentBalanceFromTab, requestTokenSymbolFromTab]);

  // Load plugin description closed status
  useEffect(() => {
    chrome.storage.local.get([PLUGIN_DESC_CLOSED_KEY], (result) => {
      if (result[PLUGIN_DESC_CLOSED_KEY] === true) {
        setPluginDescClosed(true);
      }
    });
  }, []);

  // 首次获取平均价格
  useEffect(() => {
    if (hasRequestedAveragePrice.current) {
      return;
    }

    if (!activeTab.isSupported || typeof activeTab.tabId !== 'number') {
      return;
    }

    hasRequestedAveragePrice.current = true;

    chrome.tabs.sendMessage(activeTab.tabId, { type: 'RUN_TASK_ONCE' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to trigger VWAP refresh:', chrome.runtime.lastError.message);
        hasRequestedAveragePrice.current = false;
      }
    });
  }, [activeTab.isSupported, activeTab.tabId]);

  useEffect(() => {
    const sessionStart = state?.sessionStartedAt ?? null;
    const sessionStop = state?.sessionStoppedAt ?? null;
    const enabled = state?.isEnabled ?? false;

    if (!sessionStart || sessionStop || !enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [state?.sessionStartedAt, state?.sessionStoppedAt, state?.isEnabled]);

  useEffect(() => {
    void loadState();
    void refreshActiveTab();
    void fetchStableCoins(); // 初始加载稳定币种
    void fetchAirdrops(); // 初始加载空投数据
    void fetchTokenDirectory();

    chrome.storage.local.get(TOKEN_DIRECTORY_STORAGE_KEY, (result) => {
      const storedDirectory = extractStoredTokenDirectory(result[TOKEN_DIRECTORY_STORAGE_KEY]);
      if (storedDirectory) {
        setTokenDirectory((prev) => ({
          ...prev,
          ...storedDirectory,
        }));
      }
    });

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== 'local') {
        return;
      }

      if (STORAGE_KEY in changes) {
        setState(changes[STORAGE_KEY]?.newValue ?? null);
      }

      if (TOKEN_DIRECTORY_STORAGE_KEY in changes) {
        const storedDirectory = extractStoredTokenDirectory(
          changes[TOKEN_DIRECTORY_STORAGE_KEY]?.newValue,
        );
        if (storedDirectory) {
          setTokenDirectory((prev) => ({
            ...prev,
            ...storedDirectory,
          }));
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Poll for updates every second
    const interval = setInterval(() => {
      void loadState();
      void refreshActiveTab();
    }, 1000);

    // 定时更新稳定币种数据（30秒）
    const stabilityInterval = setInterval(() => {
      void fetchStableCoins();
    }, STABILITY_UPDATE_INTERVAL);

    // 定时更新空投数据（60秒）
    const airdropInterval = setInterval(() => {
      void fetchAirdrops();
    }, AIRDROP_UPDATE_INTERVAL);

    const tokenDirectoryInterval = setInterval(() => {
      void fetchTokenDirectory();
    }, TOKEN_DIRECTORY_UPDATE_INTERVAL);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      clearInterval(interval);
      clearInterval(stabilityInterval);
      clearInterval(airdropInterval);
      clearInterval(tokenDirectoryInterval);
    };
  }, [loadState, refreshActiveTab, fetchStableCoins, fetchAirdrops, fetchTokenDirectory]);

  useEffect(() => {
    if (!activeTab.isSupported || typeof activeTab.tabId !== 'number') {
      orderHistoryRequestState.current = { tabId: null, status: 'idle' };
      setOrderHistoryError(null);
      return;
    }

    const tabId = activeTab.tabId;
    const currentRequest = orderHistoryRequestState.current;

    if (currentRequest.status === 'pending' && currentRequest.tabId === tabId) {
      return;
    }

    if (currentRequest.status === 'success' && currentRequest.tabId === tabId) {
      return;
    }

    const now = new Date();
    const targetUrl = buildOrderHistoryUrl(now);
    orderHistoryRequestState.current = { tabId, status: 'pending' };
    setOrderHistoryError(null);

    chrome.tabs.sendMessage(
      tabId,
      {
        type: 'FETCH_ORDER_HISTORY',
        payload: { url: targetUrl },
      } satisfies RuntimeMessage,
      (rawResponse) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          // eslint-disable-next-line no-console
          console.error(
            '[dddd-alpah-extension] Failed to dispatch order history request:',
            runtimeError.message,
          );
          orderHistoryRequestState.current = { tabId: null, status: 'idle' };
          setOrderHistoryError(runtimeError.message);
          return;
        }

        const response = rawResponse as FetchOrderHistoryResponse | undefined;
        if (response?.success) {
          orderHistoryRequestState.current = { tabId, status: 'success' };
          try {
            const multiplierLookup = (alphaId: string): number => {
              const entry = tokenDirectoryAlphaIdMap[alphaId] ?? null;
              if (!entry) {
                return 1;
              }

              const rawMultiplier = entry.mulPoint;
              const numeric =
                typeof rawMultiplier === 'number'
                  ? rawMultiplier
                  : typeof rawMultiplier === 'string'
                    ? Number(rawMultiplier)
                    : NaN;

              if (!Number.isFinite(numeric) || numeric <= 0) {
                return 1;
              }

              return numeric;
            };

            const summary = summarizeOrderHistoryData(response.data, multiplierLookup);
            const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(
              summary.totalBuyVolume,
            );

            const snapshotPayload: OrderHistorySnapshotPayload = {
              date: new Date(now.getTime()).toISOString().slice(0, 10),
              totalBuyVolume: summary.totalBuyVolume,
              buyOrderCount: summary.buyOrderCount,
              alphaPoints,
              nextThresholdDelta,
              fetchedAt: Date.now(),
              source: 'popup',
            };

            // eslint-disable-next-line no-console
            console.log('[dddd-alpah-extension] Order history summary:', snapshotPayload);

            void postRuntimeMessage({
              type: 'ORDER_HISTORY_SNAPSHOT',
              payload: snapshotPayload,
            }).catch((error) => {
              // eslint-disable-next-line no-console
              console.warn('[dddd-alpah-extension] Failed to post order history snapshot', error);
            });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              '[dddd-alpah-extension] Failed to process order history response:',
              error,
            );
          }
          return;
        }

        const errorMessage = response?.message ?? 'Unknown order history error';
        orderHistoryRequestState.current = { tabId: null, status: 'idle' };
        setOrderHistoryError(errorMessage);
        // eslint-disable-next-line no-console
        console.error('[dddd-alpah-extension] Order history request failed:', errorMessage);
      },
    );
  }, [activeTab.isSupported, activeTab.tabId, tokenDirectoryAlphaIdMap]);

  const storedTokenAddress = getTokenAddress(state);
  const resolvedSymbolCandidate =
    activeTab.tokenAddress === storedTokenAddress
      ? (activeTab.tokenSymbol ?? state?.tokenSymbol ?? state?.lastResult?.tokenSymbol)
      : activeTab.tokenSymbol;
  const normalizedResolvedSymbol =
    typeof resolvedSymbolCandidate === 'string' && resolvedSymbolCandidate.trim().length > 0
      ? resolvedSymbolCandidate.trim().toUpperCase()
      : null;
  const tokenInfoBySymbol =
    normalizedResolvedSymbol !== null ? tokenDirectory[normalizedResolvedSymbol] : undefined;
  const resolvedTokenInfo = tokenInfoByAddress ?? tokenInfoBySymbol;
  const resolvedSymbolDisplayRaw =
    resolvedTokenInfo?.symbol ?? normalizedResolvedSymbol ?? (resolvedSymbolCandidate ?? '').trim();
  const resolvedSymbolDisplay =
    resolvedSymbolDisplayRaw && resolvedSymbolDisplayRaw.length > 0
      ? resolvedSymbolDisplayRaw
      : '—';

  const rawPointsFactorLockValue = resolvedTokenInfo?.mulPoint ?? null;
  const sanitizedPointsFactorLockValue =
    typeof rawPointsFactorLockValue === 'number' &&
    Number.isFinite(rawPointsFactorLockValue) &&
    rawPointsFactorLockValue > 0
      ? clampPointsFactor(rawPointsFactorLockValue)
      : null;
  const isPointsFactorLocked = sanitizedPointsFactorLockValue !== null;

  const persistSchedulerSettings = useCallback(
    (settingsPatch: {
      priceOffsetPercent?: number;
      priceOffsetMode?: PriceOffsetMode;
      buyPriceOffset?: number;
      sellPriceOffset?: number;
      pointsFactor?: number;
      pointsTarget?: number;
    }): Promise<void> => {
      const task = async (): Promise<void> => {
        let baseState = state;

        if (!baseState) {
          const stored = await chrome.storage.local.get(STORAGE_KEY);
          baseState = (stored[STORAGE_KEY] as SchedulerState | undefined) ?? {
            isRunning: false,
            isEnabled: false,
            settings: {
              priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
              priceOffsetMode: 'sideways' as PriceOffsetMode,
              buyPriceOffset: DEFAULT_BUY_PRICE_OFFSET_PERCENT,
              sellPriceOffset: DEFAULT_SELL_PRICE_OFFSET_PERCENT,
              tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
              pointsFactor: DEFAULT_POINTS_FACTOR,
              pointsTarget: DEFAULT_POINTS_TARGET,
            },
            requiresLogin: false,
          };
        }

        const normalizedBaseState: SchedulerState = {
          isRunning: baseState.isRunning ?? false,
          isEnabled: baseState.isEnabled ?? false,
          settings: baseState.settings ?? {
            priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
            priceOffsetMode: 'sideways' as PriceOffsetMode,
            buyPriceOffset: DEFAULT_BUY_PRICE_OFFSET_PERCENT,
            sellPriceOffset: DEFAULT_SELL_PRICE_OFFSET_PERCENT,
            tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
            pointsFactor: DEFAULT_POINTS_FACTOR,
            pointsTarget: DEFAULT_POINTS_TARGET,
          },
          lastRun: baseState.lastRun,
          lastError: baseState.lastError,
          lastResult: baseState.lastResult,
          tokenSymbol: baseState.tokenSymbol,
          dailyBuyVolume: baseState.dailyBuyVolume,
          requiresLogin: baseState.requiresLogin ?? false,
          sessionStartedAt: baseState.sessionStartedAt,
          sessionStoppedAt: baseState.sessionStoppedAt,
        };

        const baseSettings = {
          priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
          priceOffsetMode: 'sideways' as PriceOffsetMode,
          buyPriceOffset: DEFAULT_BUY_PRICE_OFFSET_PERCENT,
          sellPriceOffset: DEFAULT_SELL_PRICE_OFFSET_PERCENT,
          tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
          pointsFactor: DEFAULT_POINTS_FACTOR,
          pointsTarget: DEFAULT_POINTS_TARGET,
          ...(normalizedBaseState.settings ?? {}),
        };

        const nextState = {
          ...normalizedBaseState,
          settings: {
            priceOffsetPercent: baseSettings.priceOffsetPercent,
            priceOffsetMode: baseSettings.priceOffsetMode,
            buyPriceOffset: baseSettings.buyPriceOffset,
            sellPriceOffset: baseSettings.sellPriceOffset,
            tokenAddress: baseSettings.tokenAddress,
            pointsFactor: baseSettings.pointsFactor,
            pointsTarget: baseSettings.pointsTarget,
            ...settingsPatch,
          },
        };

        await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
        setState(nextState);
      };

      const queuedPromise = settingsUpdateQueueRef.current
        .catch(() => undefined)
        .then(() => task());

      settingsUpdateQueueRef.current = queuedPromise.finally(() => undefined);

      return queuedPromise;
    },
    [state],
  );

  const handleResetInitialBalance = useCallback(async (): Promise<void> => {
    const currentBalanceValue =
      typeof activeTab.currentBalance === 'number' && Number.isFinite(activeTab.currentBalance)
        ? activeTab.currentBalance
        : undefined;

    if (currentBalanceValue === undefined || resettingInitialBalance) {
      return;
    }

    setResettingInitialBalance(true);
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const storageResult = await chrome.storage.local.get(STORAGE_KEY);
      const storedState = storageResult[STORAGE_KEY] as SchedulerState | undefined;
      const baseState = storedState ?? {
        isRunning: false,
        isEnabled: false,
        settings: {
          priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
          tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
          pointsFactor: DEFAULT_POINTS_FACTOR,
          pointsTarget: DEFAULT_POINTS_TARGET,
        },
      };

      const previousDaily = baseState.dailyBuyVolume;
      const isSameDay = previousDaily?.date === todayKey;

      const nextDaily = {
        date: todayKey,
        total: isSameDay && typeof previousDaily?.total === 'number' ? previousDaily.total : 0,
        alphaPoints:
          isSameDay && typeof previousDaily?.alphaPoints === 'number'
            ? previousDaily.alphaPoints
            : 0,
        nextThresholdDelta:
          isSameDay && typeof previousDaily?.nextThresholdDelta === 'number'
            ? previousDaily.nextThresholdDelta
            : baseState.lastResult?.buyVolumeToNextPoint,
        tradeCount:
          isSameDay && typeof previousDaily?.tradeCount === 'number' ? previousDaily.tradeCount : 0,
        firstBalance: currentBalanceValue,
      } as const;

      const nextLastResult = baseState.lastResult
        ? {
            ...baseState.lastResult,
            firstBalanceToday: currentBalanceValue,
          }
        : baseState.lastResult;

      const nextState: SchedulerState = {
        ...baseState,
        dailyBuyVolume: nextDaily,
        lastResult: nextLastResult,
      };

      await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
      setState(nextState);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[dddd-alpah-extension] Failed to reset initial balance:', messageText);
    } finally {
      setResettingInitialBalance(false);
    }
  }, [activeTab.currentBalance, resettingInitialBalance]);

  // Sync local input values with state, but not during active editing
  useEffect(() => {
    const mode = state?.settings?.priceOffsetMode ?? 'sideways';
    const buyOffset = state?.settings?.buyPriceOffset ?? DEFAULT_BUY_PRICE_OFFSET_PERCENT;
    const sellOffset = state?.settings?.sellPriceOffset ?? DEFAULT_SELL_PRICE_OFFSET_PERCENT;
    const factor = getPointsFactor(state);
    const target = getPointsTarget(state);

    setPriceOffsetMode(mode);

    if (!isEditingBuyPriceOffset.current) {
      setBuyPriceOffset(formatSpreadInputValue(buyOffset));
    }

    if (!isEditingSellPriceOffset.current) {
      setSellPriceOffset(formatSpreadInputValue(sellOffset));
    }

    if (isPointsFactorLocked && sanitizedPointsFactorLockValue !== null) {
      setLocalPointsFactor(String(sanitizedPointsFactorLockValue));
    } else if (!isEditingPointsFactor.current) {
      setLocalPointsFactor(String(factor));
    }

    if (!isEditingPointsTarget.current) {
      setLocalPointsTarget(String(target));
    }
  }, [state, isPointsFactorLocked, sanitizedPointsFactorLockValue]);

  useEffect(() => {
    if (!isPointsFactorLocked || sanitizedPointsFactorLockValue === null) {
      return;
    }

    const currentValue = getPointsFactor(state);
    if (!pointsFactorValuesDiffer(currentValue, sanitizedPointsFactorLockValue)) {
      return;
    }

    void persistSchedulerSettings({ pointsFactor: sanitizedPointsFactorLockValue });
  }, [isPointsFactorLocked, sanitizedPointsFactorLockValue, state, persistSchedulerSettings]);

  async function handleControlMessage(type: string, payload?: unknown): Promise<void> {
    setControlsBusy(true);
    try {
      const message = payload === undefined ? { type } : { type, payload };
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(message, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (!result || result.acknowledged !== true) {
            const errorText = result?.error
              ? String(result.error)
              : 'Unable to reach background script.';
            reject(new Error(errorText));
            return;
          }
          resolve();
        });
      });
      await loadState();
    } finally {
      setControlsBusy(false);
    }
  }

  async function handleStart(): Promise<void> {
    if (!activeTab.isSupported || !activeTab.tokenAddress) {
      throw new Error('Open a Binance Alpha token page in the active tab to start automation.');
    }

    try {
      await settingsUpdateQueueRef.current;
    } catch {
      // Ignore settings persistence errors before starting automation
    }

    const payload: { tokenAddress: string; tabId?: number } = {
      tokenAddress: activeTab.tokenAddress,
    };

    if (typeof activeTab.tabId === 'number') {
      payload.tabId = activeTab.tabId;
    }

    await handleControlMessage('CONTROL_START', payload);
  }

  async function handleStop(): Promise<void> {
    await handleControlMessage('CONTROL_STOP');
  }

  async function handlePointsFactorChange(value: string): Promise<void> {
    isEditingPointsFactor.current = false;
    if (isPointsFactorLocked) {
      return;
    }
    const rawValue = Number.parseFloat(value);
    if (Number.isNaN(rawValue)) {
      return;
    }

    const sanitizedValue = clampPointsFactor(rawValue);
    setLocalPointsFactor(String(sanitizedValue));

    const currentValue = getPointsFactor(state);
    if (!pointsFactorValuesDiffer(currentValue, sanitizedValue)) {
      return;
    }

    await persistSchedulerSettings({ pointsFactor: sanitizedValue });
  }

  async function handlePointsTargetChange(value: string): Promise<void> {
    isEditingPointsTarget.current = false;
    const rawValue = Number.parseFloat(value);
    if (Number.isNaN(rawValue)) {
      return;
    }

    const sanitizedValue = clampPointsTarget(rawValue);
    setLocalPointsTarget(String(sanitizedValue));

    const currentValue = getPointsTarget(state);
    if (!pointsTargetValuesDiffer(currentValue, sanitizedValue)) {
      return;
    }

    await persistSchedulerSettings({ pointsTarget: sanitizedValue });
  }

  const isRunning = state?.isRunning ?? false;
  const isEnabled = state?.isEnabled ?? false;
  const canOperate = activeTab.isSupported;

  const sessionStartedIso = state?.sessionStartedAt ?? null;
  const sessionStoppedIso = state?.sessionStoppedAt ?? null;

  let sessionDurationMs: number | null = null;
  if (sessionStartedIso) {
    const sessionStartMs = Date.parse(sessionStartedIso);
    if (Number.isFinite(sessionStartMs)) {
      if (sessionStoppedIso) {
        const sessionStopMs = Date.parse(sessionStoppedIso);
        if (Number.isFinite(sessionStopMs)) {
          sessionDurationMs = Math.max(0, sessionStopMs - sessionStartMs);
        }
      } else if (isEnabled || isRunning) {
        sessionDurationMs = Math.max(0, nowTick - sessionStartMs);
      }
    }
  }

  const formattedSessionDuration = formatSessionDuration(sessionDurationMs, i18n.language);

  const snapshot = state?.lastResult;
  const todayKey = new Date().toISOString().slice(0, 10);
  const pointsTargetValue = getPointsTarget(state);

  let todaysAlphaPoints: number | undefined;
  if (
    state?.dailyBuyVolume &&
    state.dailyBuyVolume.date === todayKey &&
    typeof state.dailyBuyVolume.alphaPoints === 'number'
  ) {
    todaysAlphaPoints = state.dailyBuyVolume.alphaPoints;
  } else if (typeof snapshot?.alphaPointsToday === 'number') {
    todaysAlphaPoints = snapshot.alphaPointsToday;
  }

  let successfulTradesToday: number | undefined;
  if (
    state?.dailyBuyVolume &&
    state.dailyBuyVolume.date === todayKey &&
    typeof state.dailyBuyVolume.tradeCount === 'number'
  ) {
    successfulTradesToday = state.dailyBuyVolume.tradeCount;
  } else if (typeof snapshot?.successfulTradesToday === 'number') {
    successfulTradesToday = snapshot.successfulTradesToday;
  }

  const successfulTradeLimitReached = (successfulTradesToday ?? 0) >= MAX_SUCCESSFUL_TRADES;
  const requiresLogin = state?.requiresLogin === true;
  const loginRequired = requiresLogin || state?.lastError === '请先登录币安';

  const isStartDisabled =
    controlsBusy || isEnabled || !canOperate || successfulTradeLimitReached || loginRequired;
  const isStopDisabled = controlsBusy || !isEnabled;

  function calculateTotalCost(): number | undefined {
    const firstBalance =
      state?.dailyBuyVolume?.date === todayKey
        ? state.dailyBuyVolume.firstBalance
        : snapshot?.firstBalanceToday;
    const currentBalance = activeTab.currentBalance;

    if (
      typeof firstBalance === 'number' &&
      Number.isFinite(firstBalance) &&
      typeof currentBalance === 'number' &&
      Number.isFinite(currentBalance)
    ) {
      const difference = firstBalance - currentBalance;
      return difference > 0 ? difference : 0;
    }

    return undefined;
  }

  function calculateCostRatio(): number | undefined {
    const totalCost = calculateTotalCost();
    const firstBalance =
      state?.dailyBuyVolume?.date === todayKey
        ? state.dailyBuyVolume.firstBalance
        : snapshot?.firstBalanceToday;

    if (
      typeof totalCost === 'number' &&
      Number.isFinite(totalCost) &&
      typeof firstBalance === 'number' &&
      Number.isFinite(firstBalance) &&
      firstBalance > 0
    ) {
      return totalCost / firstBalance;
    }

    return undefined;
  }

  const openUrlInActiveTab = useCallback(
    (targetUrl: string): void => {
      if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
        return;
      }

      const updateTabUrl = (tabId: number | undefined): void => {
        if (typeof tabId !== 'number') {
          return;
        }

        chrome.tabs.update(tabId, { url: targetUrl }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to update tab URL:', chrome.runtime.lastError.message);
          }
        });
      };

      if (typeof activeTab.tabId === 'number') {
        updateTabUrl(activeTab.tabId);
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const [currentTab] = tabs;
        updateTabUrl(typeof currentTab?.id === 'number' ? currentTab.id : undefined);
      });
    },
    [activeTab.tabId],
  );

  return (
    <div
      style={{
        width: 440,
        padding: '20px 18px',
        background: 'linear-gradient(180deg, #f0f5fa 0%, #e6ecf5 100%)',
        minHeight: 600,
      }}
    >
      <Card
        bordered={false}
        style={{
          marginBottom: 16,
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)',
          background: 'linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow =
            '0 4px 20px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(24, 144, 255, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow =
            '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)';
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <img
                src={POPUP_LOGO_URL}
                alt="Logo"
                style={{ width: '36px', height: '36px', display: 'block' }}
              />
              <Title
                level={3}
                style={{ color: '#1890ff', margin: 0, fontSize: '18px', fontWeight: 600 }}
              >
                {t('app.title')}
              </Title>
              <Link href="https://t.me/ddddao2025" target="_blank" rel="noopener noreferrer">
                <img
                  src={TG_LOGO_URL}
                  alt="Telegram"
                  style={{
                    width: '26px',
                    height: '26px',
                    display: 'block',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                />
              </Link>
            </div>
            <LanguageSwitcher />
          </div>

          {!pluginDescClosed && (
            <Alert
              type="info"
              showIcon
              closable
              onClose={() => {
                setPluginDescClosed(true);
                chrome.storage.local.set({ [PLUGIN_DESC_CLOSED_KEY]: true });
              }}
              message={t('plugin.title')}
              description={
                <Space direction="vertical" size={8} style={{ fontSize: 13 }}>
                  <Text style={{ fontSize: 13, color: '#595959', lineHeight: 1.6 }}>
                    {t('plugin.desc1')}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#595959', lineHeight: 1.6 }}>
                    {t('plugin.desc2')}
                  </Text>
                  <Link href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                    <Space size={8} align="center">
                      <img
                        src={GITHUB_MARK_URL}
                        alt="GitHub"
                        style={{ width: 18, height: 18, display: 'block' }}
                      />
                      <span style={{ fontSize: 13 }}>{t('plugin.viewGithub')}</span>
                    </Space>
                  </Link>
                </Space>
              }
              style={{
                marginBottom: 12,
                borderRadius: 12,
                border: '1px solid #91caff',
                background: '#e6f4ff',
              }}
            />
          )}

          {orderHistoryError ? (
            <Alert
              type="error"
              showIcon
              message={t('orderHistory.error')}
              description={orderHistoryError}
              style={{
                marginBottom: 12,
                borderRadius: 12,
                border: '1px solid #ffa39e',
                background: '#fff1f0',
              }}
            />
          ) : null}

          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card
                title={
                  <Space size={6}>
                    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t('stability.title')}</span>
                  </Space>
                }
                bordered={false}
                size="small"
                style={{
                  height: '100%',
                  borderRadius: 12,
                  boxShadow: '0 2px 10px rgba(82, 196, 26, 0.08)',
                  background: 'linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%)',
                  border: '1px solid rgba(183, 235, 143, 0.4)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(82, 196, 26, 0.12)';
                  e.currentTarget.style.borderColor = 'rgba(183, 235, 143, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(82, 196, 26, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(183, 235, 143, 0.4)';
                }}
              >
                {stabilityLoading ? (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t('stability.loading')}
                  </Text>
                ) : stableCoins.length > 0 ? (
                  <List
                    size="small"
                    dataSource={stableCoins.slice(0, 3)}
                    renderItem={(item) => {
                      const coinSymbol = item.n.replace('/USDT', '').trim();
                      const normalizedSymbol = coinSymbol.toUpperCase();
                      const tokenInfo = tokenDirectory[normalizedSymbol];
                      const url = tokenInfo?.contractAddress
                        ? getBinanceAlphaUrl(tokenInfo.contractAddress)
                        : null;

                      return (
                        <List.Item style={{ padding: '3px 0', borderBottom: 'none' }}>
                          <Space
                            size="small"
                            direction="vertical"
                            style={{ width: '100%', gap: 2 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {tokenInfo?.iconUrl && (
                                <img
                                  src={tokenInfo.iconUrl}
                                  alt={`${normalizedSymbol} icon`}
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    flex: '0 0 14px',
                                  }}
                                />
                              )}
                              {url ? (
                                <a
                                  href={url}
                                  style={{
                                    color: '#1890ff',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    openUrlInActiveTab(url);
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.textDecoration = 'underline';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.textDecoration = 'none';
                                  }}
                                >
                                  {normalizedSymbol}
                                </a>
                              ) : (
                                <Text
                                  strong
                                  style={{
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  {normalizedSymbol}
                                </Text>
                              )}
                              {item.md > 0 && (
                                <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>
                                  {t('stability.quad')}
                                </Tag>
                              )}
                            </div>
                            <Space size="small">
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                {t('stability.spread')}: {item.spr.toFixed(2)}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                {t('stability.days')}: {item.md}
                              </Text>
                            </Space>
                          </Space>
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {t('stability.noData')}
                  </Text>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card
                title={
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{t('token.currentToken')}</span>
                }
                bordered={false}
                size="small"
                style={{
                  height: '100%',
                  borderRadius: 12,
                  boxShadow: '0 2px 10px rgba(24, 144, 255, 0.06)',
                  background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
                  border: '1px solid rgba(24, 144, 255, 0.15)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(24, 144, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 10px rgba(24, 144, 255, 0.06)';
                  e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.15)';
                }}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Space
                      size={6}
                      align="center"
                      style={{ display: 'flex', alignItems: 'center' }}
                    >
                      {resolvedTokenInfo?.iconUrl && (
                        <img
                          src={resolvedTokenInfo.iconUrl}
                          alt={`${resolvedSymbolDisplay} icon`}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      )}
                      <Text strong style={{ fontSize: 14, lineHeight: '18px' }}>
                        {resolvedSymbolDisplay}
                      </Text>
                    </Space>
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>
                    {activeTab.tokenAddress || t('token.noTokenSelected')}
                  </Text>
                  {isPointsFactorLocked && sanitizedPointsFactorLockValue !== null && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {t('token.pointsMultiplier')}: {sanitizedPointsFactorLockValue}{' '}
                      {t('token.multiplier')}
                    </Text>
                  )}
                  {snapshot?.averagePrice && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '6px 10px',
                        background: '#f0f5ff',
                        borderRadius: 4,
                        border: '1px solid #adc6ff',
                      }}
                    >
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <Space size={4} align="center">
                          <DollarOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            {t('stats.averagePrice')}
                          </Text>
                        </Space>
                        <Text strong style={{ fontSize: 13, color: '#1890ff' }}>
                          {formatNumber(snapshot.averagePrice, {
                            minimumFractionDigits: 4,
                            maximumFractionDigits: 8,
                          })}
                        </Text>
                        {snapshot.timestamp && (
                          <Text type="secondary" style={{ fontSize: 9 }}>
                            {new Date(snapshot.timestamp).toLocaleTimeString(i18n.language)}
                          </Text>
                        )}
                      </Space>
                    </div>
                  )}
                </Space>
              </Card>
            </Col>
          </Row>
        </Space>
      </Card>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Space size={10}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  boxShadow: '0 2px 8px rgba(24, 144, 255, 0.2)',
                }}
              >
                <ThunderboltOutlined style={{ color: '#ffffff', fontSize: 16 }} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 16, color: '#262626' }}>
                {t('settings.title')}
              </span>
            </Space>
            <Space size={8}>
              <div style={{ display: 'flex', cursor: isStartDisabled ? 'not-allowed' : 'pointer' }}>
                <Button
                  type="primary"
                  htmlType="button"
                  icon={<PlayCircleOutlined style={{ fontSize: 14 }} />}
                  loading={controlsBusy}
                  disabled={isStartDisabled}
                  onClick={() => void handleStart()}
                  size="middle"
                  style={{
                    background: isStartDisabled
                      ? '#d9d9d9'
                      : 'linear-gradient(135deg, #73d13d 0%, #52c41a 100%)',
                    borderColor: 'transparent',
                    borderRadius: 24,
                    fontWeight: 600,
                    boxShadow: isStartDisabled ? 'none' : '0 2px 6px rgba(82, 196, 26, 0.28)',
                    height: 34,
                    paddingLeft: 16,
                    paddingRight: 16,
                    color: '#ffffff',
                    cursor: 'inherit',
                  }}
                >
                  {t('controls.start')}
                </Button>
              </div>
              <div style={{ display: 'flex', cursor: isStopDisabled ? 'not-allowed' : 'pointer' }}>
                <Button
                  danger
                  htmlType="button"
                  icon={<PauseCircleOutlined style={{ fontSize: 14 }} />}
                  loading={controlsBusy}
                  disabled={isStopDisabled}
                  onClick={() => void handleStop()}
                  size="middle"
                  style={{
                    background: isStopDisabled
                      ? '#d9d9d9'
                      : 'linear-gradient(135deg, #ff7875 0%, #f5222d 100%)',
                    borderColor: 'transparent',
                    borderRadius: 24,
                    fontWeight: 600,
                    boxShadow: isStopDisabled ? 'none' : '0 2px 6px rgba(255, 120, 117, 0.28)',
                    height: 34,
                    paddingLeft: 16,
                    paddingRight: 16,
                    color: '#ffffff',
                    cursor: 'inherit',
                  }}
                >
                  {t('controls.stop')}
                </Button>
              </div>
            </Space>
          </div>
        }
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)',
          background: 'linear-gradient(135deg, #ffffff 0%, #fafbfc 100%)',
          border: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow =
            '0 4px 20px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(24, 144, 255, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow =
            '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)';
        }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Space size={6} style={{ marginBottom: 12 }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                {t('settings.priceOffset')}
              </Text>
              <Tooltip title={t('settings.priceOffsetTooltip')}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
              </Tooltip>
            </Space>
            <Radio.Group
              value={priceOffsetMode}
              onChange={(e) => {
                const mode = e.target.value as PriceOffsetMode;
                setPriceOffsetMode(mode);
                let buyOffset = DEFAULT_BUY_PRICE_OFFSET_PERCENT;
                let sellOffset = DEFAULT_SELL_PRICE_OFFSET_PERCENT;
                if (mode === 'sideways') {
                  buyOffset = DEFAULT_BUY_PRICE_OFFSET_PERCENT;
                  sellOffset = DEFAULT_SELL_PRICE_OFFSET_PERCENT;
                } else if (mode === 'bullish') {
                  buyOffset = DEFAULT_BUY_PRICE_OFFSET_PERCENT;
                  sellOffset = 0.02;
                }
                setBuyPriceOffset(String(buyOffset));
                setSellPriceOffset(String(sellOffset));
                void persistSchedulerSettings({
                  priceOffsetMode: mode,
                  buyPriceOffset: buyOffset,
                  sellPriceOffset: sellOffset,
                });
              }}
              disabled={controlsBusy}
              style={{ width: '100%', marginBottom: 12 }}
            >
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Radio value="bullish">
                  <Space size={6}>
                    <span>{t('settings.bullishMode')}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {t('settings.bullishModeDesc')}
                    </Text>
                  </Space>
                </Radio>
                <Radio value="sideways">
                  <Space size={6}>
                    <span>{t('settings.sidewaysMode')}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {t('settings.sidewaysModeDesc')}
                    </Text>
                  </Space>
                </Radio>
                <Radio value="custom">{t('settings.customMode')}</Radio>
              </Space>
            </Radio.Group>

            {priceOffsetMode === 'custom' && (
              <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
                <div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}
                  >
                    {t('settings.buyPriceOffset')}
                  </Text>
                  <InputNumber
                    min={-5}
                    max={5}
                    step={0.001}
                    placeholder="0.01"
                    value={Number.parseFloat(buyPriceOffset)}
                    onFocus={() => {
                      isEditingBuyPriceOffset.current = true;
                    }}
                    onChange={(value) => {
                      if (value != null) {
                        setBuyPriceOffset(String(value));
                      }
                    }}
                    onBlur={() => {
                      isEditingBuyPriceOffset.current = false;
                      const parsed = Number.parseFloat(buyPriceOffset);
                      const finalValue = Number.isFinite(parsed) && parsed !== 0 ? parsed : 0.01;
                      setBuyPriceOffset(String(finalValue));
                      void persistSchedulerSettings({
                        buyPriceOffset: finalValue,
                      });
                    }}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }}
                    disabled={controlsBusy}
                    controls={true}
                    keyboard={true}
                    stringMode={false}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 8 }}
                  >
                    {t('settings.sellPriceOffset')}
                  </Text>
                  <InputNumber
                    min={-5}
                    max={5}
                    step={0.001}
                    placeholder="-0.01"
                    value={Number.parseFloat(sellPriceOffset)}
                    onFocus={() => {
                      isEditingSellPriceOffset.current = true;
                    }}
                    onChange={(value) => {
                      if (value != null) {
                        setSellPriceOffset(String(value));
                      }
                    }}
                    onBlur={() => {
                      isEditingSellPriceOffset.current = false;
                      const parsed = Number.parseFloat(sellPriceOffset);
                      const finalValue = Number.isFinite(parsed) && parsed !== 0 ? parsed : -0.01;
                      setSellPriceOffset(String(finalValue));
                      void persistSchedulerSettings({
                        sellPriceOffset: finalValue,
                      });
                    }}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }}
                    disabled={controlsBusy}
                    controls={true}
                    keyboard={true}
                    stringMode={false}
                    style={{ width: '100%' }}
                  />
                </div>
              </Space>
            )}
          </div>

          <div>
            <Space size={6} style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                {t('settings.pointsFactor')}
              </Text>
              <Tooltip title={t('settings.pointsFactorTooltip')}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
              </Tooltip>
            </Space>
            <InputNumber
              id={pointsFactorId}
              min={1}
              max={1000}
              step={1}
              placeholder="1"
              value={Number.parseFloat(localPointsFactor)}
              onChange={(value) => {
                if (isPointsFactorLocked) {
                  return;
                }
                isEditingPointsFactor.current = true;
                setLocalPointsFactor(String(value ?? 1));
              }}
              onBlur={(e) => void handlePointsFactorChange(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }}
              disabled={controlsBusy || isPointsFactorLocked}
              title="每次成功订单后应用于记录买入量的乘数"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <Space size={6} style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                {t('settings.pointsTarget')}
              </Text>
              <Tooltip title={t('settings.pointsTargetTooltip')}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
              </Tooltip>
            </Space>
            <InputNumber
              id={pointsTargetId}
              min={1}
              max={1000}
              step={1}
              placeholder="15"
              value={Number.parseFloat(localPointsTarget)}
              onChange={(value) => {
                isEditingPointsTarget.current = true;
                setLocalPointsTarget(String(value ?? 15));
              }}
              onBlur={(e) => void handlePointsTargetChange(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }}
              disabled={controlsBusy}
              title="当今日 alpha 积分超过此阈值时停止自动化"
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Card>

      <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
        {!activeTab.isSupported && (
          <Alert
            message={
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#d48806' }}>
                {t('controls.needAlphaPage')}
              </span>
            }
            description={
              <Link
                href={getBinanceAlphaUrl(BUILTIN_DEFAULT_TOKEN_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#1890ff',
                  textDecoration: 'underline',
                  transition: 'all 0.2s ease',
                }}
              >
                {t('controls.clickToOpen')} →
              </Link>
            }
            type="warning"
            showIcon
            style={{
              borderRadius: '12px',
              border: '1px solid #ffe58f',
              background: 'linear-gradient(135deg, #fffbe6 0%, #fff9e6 100%)',
              boxShadow: '0 2px 10px rgba(250, 173, 20, 0.15)',
              padding: '12px 16px',
            }}
          />
        )}

        {state?.lastError && (
          <Alert
            message={
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#cf1322' }}>
                {t('controls.error')}
              </span>
            }
            description={
              <span style={{ fontSize: '13px', color: '#595959' }}>{state.lastError}</span>
            }
            type="error"
            showIcon
            closable
            style={{
              borderRadius: '12px',
              border: '1px solid #ffccc7',
              background: 'linear-gradient(135deg, #fff1f0 0%, #ffe8e6 100%)',
              boxShadow: '0 2px 10px rgba(255, 77, 79, 0.15)',
              padding: '12px 16px',
            }}
          />
        )}

        {isEnabled && (
          <Alert
            message={
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: isRunning ? '#389e0d' : '#0958d9',
                }}
              >
                {t('controls.running')}
              </span>
            }
            type={isRunning ? 'success' : 'info'}
            showIcon
            style={{
              borderRadius: '12px',
              border: isRunning ? '1px solid #b7eb8f' : '1px solid #91caff',
              background: isRunning
                ? 'linear-gradient(135deg, #f6ffed 0%, #f0ffe6 100%)'
                : 'linear-gradient(135deg, #e6f4ff 0%, #d6f0ff 100%)',
              boxShadow: isRunning
                ? '0 2px 10px rgba(82, 196, 26, 0.15)'
                : '0 2px 10px rgba(24, 144, 255, 0.15)',
              padding: '12px 16px',
            }}
          />
        )}

        {successfulTradeLimitReached && (
          <Alert
            message={
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#d48806' }}>
                {SUCCESSFUL_TRADES_LIMIT_MESSAGE}
              </span>
            }
            type="warning"
            showIcon
            style={{
              borderRadius: '12px',
              border: '1px solid #ffe58f',
              background: 'linear-gradient(135deg, #fffbe6 0%, #fff9e6 100%)',
              boxShadow: '0 2px 10px rgba(250, 173, 20, 0.15)',
              padding: '12px 16px',
            }}
          />
        )}

        {typeof todaysAlphaPoints === 'number' &&
          Number.isFinite(todaysAlphaPoints) &&
          todaysAlphaPoints >= pointsTargetValue && (
            <Alert
              message={
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#389e0d' }}>
                  {t('controls.targetReached')}
                </span>
              }
              description={
                <span style={{ fontSize: '13px', color: '#595959' }}>
                  {`${t('controls.currentPoints')} ${todaysAlphaPoints} ≥ ${t('controls.target')} ${pointsTargetValue}`}
                </span>
              }
              type="success"
              showIcon
              style={{
                borderRadius: '12px',
                border: '1px solid #b7eb8f',
                background: 'linear-gradient(135deg, #f6ffed 0%, #f0ffe6 100%)',
                boxShadow: '0 2px 10px rgba(82, 196, 26, 0.15)',
                padding: '12px 16px',
              }}
            />
          )}
      </Space>

      {snapshot && (
        <Card
          title={
            <Space size={10}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
                  boxShadow: '0 2px 8px rgba(250, 173, 20, 0.2)',
                }}
              >
                <TrophyOutlined style={{ color: '#ffffff', fontSize: 16 }} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 16 }}>{t('stats.todayStats')}</span>
              <Tooltip title={t('stats.statsTooltip')}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
              </Tooltip>
            </Space>
          }
          size="small"
          style={{
            marginBottom: 16,
            borderRadius: 16,
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)',
            background: 'linear-gradient(135deg, #ffffff 0%, #fffbf0 100%)',
            border: 'none',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow =
              '0 4px 20px rgba(250, 173, 20, 0.1), 0 0 0 1px rgba(250, 173, 20, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow =
              '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)';
          }}
        >
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic
                title={t('stats.alphaPoints')}
                value={todaysAlphaPoints !== undefined ? todaysAlphaPoints : '—'}
                prefix={<TrophyOutlined />}
                valueStyle={{ color: '#3f8600', fontSize: 20 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.successfulTrades')}
                value={successfulTradesToday?.toString() ?? '—'}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.buyVolume')}
                value={formatNumber(
                  state?.dailyBuyVolume?.date === todayKey
                    ? state.dailyBuyVolume.total
                    : snapshot.buyVolumeToday,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
                prefix={<DollarOutlined />}
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.toNextPoint')}
                value={formatNumber(
                  state?.dailyBuyVolume?.date === todayKey
                    ? state.dailyBuyVolume.nextThresholdDelta
                    : snapshot.buyVolumeToNextPoint,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
                valueStyle={{ fontSize: 16 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.averagePrice')}
                value={formatNumber(snapshot.averagePrice, {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 8,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={
                  <Space size={6}>
                    {t('stats.initialBalance')}
                    <Tooltip title={t('stats.refreshBalanceTooltip')}>
                      <span style={{ display: 'inline-flex' }}>
                        <Button
                          size="small"
                          type="text"
                          icon={<ReloadOutlined />}
                          onClick={handleResetInitialBalance}
                          disabled={
                            resettingInitialBalance ||
                            typeof activeTab.currentBalance !== 'number' ||
                            !Number.isFinite(activeTab.currentBalance)
                          }
                          loading={resettingInitialBalance}
                          aria-label={t('stats.refreshBalance')}
                        />
                      </span>
                    </Tooltip>
                  </Space>
                }
                value={formatNumber(
                  state?.dailyBuyVolume?.date === todayKey
                    ? state.dailyBuyVolume.firstBalance
                    : snapshot.firstBalanceToday,
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                )}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.currentBalance')}
                value={formatNumber(activeTab.currentBalance ?? undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={
                  <Space size={6}>
                    {t('stats.totalCost')}
                    <Tooltip title={t('stats.totalCostTooltip')}>
                      <InfoCircleOutlined style={{ color: '#1677ff' }} />
                    </Tooltip>
                  </Space>
                }
                value={formatNumber(calculateTotalCost(), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title={t('stats.costRatio')}
                value={formatCostRatio(calculateCostRatio())}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={24}>
              <Statistic
                title={
                  <Space size={6}>
                    <ClockCircleOutlined />
                    {t('stats.sessionDuration')}
                  </Space>
                }
                value={formattedSessionDuration}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={24}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('stats.joinTelegram')}
                </Text>
                <Link href="https://t.me/ddddao2025" target="_blank" rel="noopener noreferrer">
                  <img
                    src={TG_LOGO_URL}
                    alt="Telegram"
                    style={{ width: '20px', height: '20px', display: 'inline-block' }}
                  />
                </Link>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* 空投提醒卡片 */}
      <Card
        title={
          <Space size={10}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)',
                boxShadow: '0 2px 8px rgba(255, 77, 79, 0.2)',
              }}
            >
              <BellOutlined style={{ color: '#ffffff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{t('airdrop.title')}</span>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('airdrop.autoUpdate')}
            </Text>
          </Space>
        }
        bordered={false}
        size="small"
        style={{
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)',
          background: 'linear-gradient(135deg, #ffffff 0%, #fff0f0 100%)',
          border: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow =
            '0 4px 20px rgba(255, 77, 79, 0.08), 0 0 0 1px rgba(255, 77, 79, 0.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow =
            '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)';
        }}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<SyncOutlined spin={airdropLoading} />}
            onClick={() => {
              void fetchAirdrops();
              // 安全地通知后台立即更新
              try {
                chrome.runtime.sendMessage({ type: 'UPDATE_AIRDROP_NOW' }, () => {
                  if (chrome.runtime.lastError) {
                    console.log('无法触发更新:', chrome.runtime.lastError.message);
                  }
                });
              } catch (err) {
                console.log('触发更新失败:', err);
              }
            }}
            disabled={airdropLoading}
          >
            {t('controls.refresh')}
          </Button>
        }
      >
        {airdropLoading ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('airdrop.loading')}
          </Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 今日空投 */}
            {airdropToday.length > 0 && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, #ff4d4f 0%, #ff7a45 100%)',
                    borderRadius: 8,
                  }}
                >
                  <ClockCircleOutlined style={{ color: 'white', fontSize: 16, marginRight: 8 }} />
                  <Text strong style={{ fontSize: 14, color: 'white', margin: 0 }}>
                    {t('airdrop.today')} ({airdropToday.length})
                  </Text>
                </div>
                <Table
                  size="small"
                  dataSource={airdropToday}
                  pagination={false}
                  rowKey={(record) => `${record.symbol}-${record.phase || 0}-${record.time}`}
                  columns={[
                    {
                      title: t('airdrop.symbol'),
                      dataIndex: 'symbol',
                      key: 'symbol',
                      width: 100,
                      render: (_, record) => {
                        const rawSymbol =
                          typeof record.symbol === 'string' ? record.symbol.trim() : '';
                        const normalizedSymbol =
                          rawSymbol.length > 0 ? rawSymbol.toUpperCase() : '';
                        const tokenInfo =
                          normalizedSymbol.length > 0
                            ? tokenDirectory[normalizedSymbol]
                            : undefined;
                        const displaySymbol = rawSymbol.length > 0 ? rawSymbol : normalizedSymbol;

                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {tokenInfo?.iconUrl && (
                              <img
                                src={tokenInfo.iconUrl}
                                alt={`${displaySymbol} icon`}
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  flex: '0 0 16px',
                                }}
                              />
                            )}
                            <Text
                              strong
                              style={{
                                fontSize: 12,
                                color: record.completed ? '#8c8c8c' : '#262626',
                                lineHeight: '16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                            >
                              {displaySymbol}
                              {record.phase && record.phase > 1 && `-${record.phase}`}
                              {record.type === 'tge' && ' (TGE)'}
                            </Text>
                            {record.completed && (
                              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      title: t('airdrop.time'),
                      dataIndex: 'time',
                      key: 'time',
                      width: 100,
                      render: (_, record) => (
                        <Tag
                          color={
                            !record.completed && record.type === 'grab'
                              ? 'red'
                              : record.completed
                                ? 'default'
                                : 'blue'
                          }
                          style={{ fontSize: 12, margin: 0 }}
                        >
                          {record.time} {record.type === 'grab' && t('airdrop.grab')}
                        </Tag>
                      ),
                    },
                    {
                      title: t('airdrop.quantity'),
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 80,
                      render: (text) => (
                        <Text style={{ fontSize: 14, color: '#595959' }}>{text}</Text>
                      ),
                    },
                    {
                      title: t('airdrop.price'),
                      dataIndex: 'estimatedValue',
                      key: 'estimatedValue',
                      width: 70,
                      render: (text) =>
                        text ? (
                          <Text style={{ fontSize: 14, color: '#ff7a00', fontWeight: 600 }}>
                            {text}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 14, color: '#d9d9d9' }}>-</Text>
                        ),
                    },
                    {
                      title: t('airdrop.threshold'),
                      dataIndex: 'threshold',
                      key: 'threshold',
                      width: 70,
                      render: (text) => (
                        <Text style={{ fontSize: 14, color: '#595959' }}>{text}</Text>
                      ),
                    },
                  ]}
                  rowClassName={(record) =>
                    record.completed ? 'airdrop-row-completed' : 'airdrop-row-active'
                  }
                  style={{ fontSize: 11 }}
                />
              </div>
            )}

            {/* 空投预告 */}
            {airdropForecast.length > 0 && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 12,
                    padding: '8px 12px',
                    background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                    borderRadius: 8,
                  }}
                >
                  <BellOutlined style={{ color: 'white', fontSize: 16, marginRight: 8 }} />
                  <Text strong style={{ fontSize: 14, color: 'white', margin: 0 }}>
                    {t('airdrop.forecast')} ({airdropForecast.length})
                  </Text>
                </div>
                <Table
                  size="small"
                  dataSource={airdropForecast}
                  pagination={false}
                  rowKey={(record) => `${record.symbol}-${record.phase || 0}-${record.time}`}
                  columns={[
                    {
                      title: t('airdrop.symbol'),
                      dataIndex: 'symbol',
                      key: 'symbol',
                      width: 100,
                      render: (_, record) => {
                        const rawSymbol =
                          typeof record.symbol === 'string' ? record.symbol.trim() : '';
                        const normalizedSymbol =
                          rawSymbol.length > 0 ? rawSymbol.toUpperCase() : '';
                        const tokenInfo =
                          normalizedSymbol.length > 0
                            ? tokenDirectory[normalizedSymbol]
                            : undefined;
                        const displaySymbol = rawSymbol.length > 0 ? rawSymbol : normalizedSymbol;

                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {tokenInfo?.iconUrl && (
                              <img
                                src={tokenInfo.iconUrl}
                                alt={`${displaySymbol} icon`}
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  flex: '0 0 16px',
                                }}
                              />
                            )}
                            <Text
                              strong
                              style={{
                                fontSize: 12,
                                color: '#1890ff',
                                lineHeight: '16px',
                                display: 'inline-flex',
                                alignItems: 'center',
                              }}
                            >
                              {displaySymbol}
                              {record.phase && record.phase > 1 && `-${record.phase}`}
                              {record.type === 'tge' && ' (TGE)'}
                            </Text>
                          </div>
                        );
                      },
                    },
                    {
                      title: t('airdrop.time'),
                      dataIndex: 'time',
                      key: 'time',
                      width: 100,
                      render: (_, record) => (
                        <Tag
                          color={record.type === 'grab' ? 'red' : 'blue'}
                          style={{ fontSize: 12, margin: 0 }}
                        >
                          {record.time} {record.type === 'grab' && t('airdrop.grab')}
                        </Tag>
                      ),
                    },
                    {
                      title: t('airdrop.quantity'),
                      dataIndex: 'quantity',
                      key: 'quantity',
                      width: 80,
                      render: (text) => (
                        <Text style={{ fontSize: 14, color: '#595959' }}>{text}</Text>
                      ),
                    },
                    {
                      title: t('airdrop.price'),
                      dataIndex: 'estimatedValue',
                      key: 'estimatedValue',
                      width: 70,
                      render: (text) =>
                        text ? (
                          <Text style={{ fontSize: 14, color: '#ff7a00', fontWeight: 600 }}>
                            {text}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 14, color: '#d9d9d9' }}>-</Text>
                        ),
                    },
                    {
                      title: t('airdrop.threshold'),
                      dataIndex: 'threshold',
                      key: 'threshold',
                      width: 70,
                      render: (text) => (
                        <Text style={{ fontSize: 14, color: '#595959' }}>{text}</Text>
                      ),
                    },
                  ]}
                  style={{ fontSize: 11 }}
                />
              </div>
            )}

            {/* 无数据提示 */}
            {airdropToday.length === 0 && airdropForecast.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('airdrop.noData')}
              </Text>
            )}
          </Space>
        )}
      </Card>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link href={t('footer.binanceWalletUrl')} target="_blank" rel="noopener noreferrer">
          {t('footer.binanceWallet')}
        </Link>
      </div>
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link href={t('footer.registerBinanceUrl')} target="_blank" rel="noopener noreferrer">
          {t('footer.registerBinance')}
        </Link>
      </div>

      <div
        style={{
          textAlign: 'center',
          padding: '16px 0 8px',
          color: '#8c8c8c',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
        }}
      >
        <span>{t('footer.madeBy')}</span>
        <Link href="https://t.me/ddddao2025" target="_blank" rel="noopener noreferrer">
          <img
            src={LOGO_WITH_NAME_URL}
            alt="DDDDAO"
            style={{
              height: '16px',
              display: 'inline-block',
              verticalAlign: 'text-bottom',
            }}
          />
        </Link>
      </div>
    </div>
  );
}

// Utility functions
function formatNumber(
  value: number | undefined,
  options: { minimumFractionDigits: number; maximumFractionDigits: number },
): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('en-US', options);
}

function formatCostRatio(ratio: number | undefined): string {
  if (typeof ratio === 'number' && Number.isFinite(ratio)) {
    return `${(ratio * 100).toFixed(2)}%`;
  }
  return '—';
}

function extractTokenFromUrl(url: string): string | null {
  const match = url.match(BINANCE_ALPHA_PATTERN);
  if (!match) {
    return null;
  }
  return match[1].toLowerCase();
}

function extractTokenFromText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const match = trimmed.match(/0x[a-fA-F0-9]{40}/u);
  return match ? match[0].toLowerCase() : null;
}

function getTokenAddress(state: SchedulerState | null): string {
  if (!state?.settings?.tokenAddress) {
    return BUILTIN_DEFAULT_TOKEN_ADDRESS;
  }
  const candidate = extractTokenFromText(state.settings.tokenAddress);
  return candidate ?? BUILTIN_DEFAULT_TOKEN_ADDRESS;
}

function getPointsFactor(state: SchedulerState | null): number {
  const raw = state?.settings?.pointsFactor;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(numeric) ? clampPointsFactor(numeric) : DEFAULT_POINTS_FACTOR;
}

function getPointsTarget(state: SchedulerState | null): number {
  const raw = state?.settings?.pointsTarget;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(numeric) ? clampPointsTarget(numeric) : DEFAULT_POINTS_TARGET;
}

function clampPointsFactor(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_FACTOR;
  }
  const floored = Math.floor(value);
  return Math.min(Math.max(floored, 1), 1000);
}

function clampPointsTarget(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_POINTS_TARGET;
  }
  const floored = Math.floor(value);
  return Math.min(Math.max(floored, 1), 1000);
}

function formatSpreadInputValue(value: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return formatSpreadInputValue(DEFAULT_PRICE_OFFSET_PERCENT);
  }
  const fixed = value.toFixed(3);
  const trimmed = fixed.replace(/\.0+$/u, '').replace(/0+$/u, '').replace(/\.$/u, '');
  return trimmed.length > 0 ? trimmed : '0';
}

function pointsFactorValuesDiffer(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }
  return Math.floor(a) !== Math.floor(b);
}

function pointsTargetValuesDiffer(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }
  return Math.floor(a) !== Math.floor(b);
}
