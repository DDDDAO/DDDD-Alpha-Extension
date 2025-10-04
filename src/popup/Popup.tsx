import {
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, InputNumber, Row, Space, Statistic, Typography, List, Tag } from 'antd';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { SchedulerState } from '../lib/storage';

const { Title, Text, Link } = Typography;

const STORAGE_KEY = 'alpha-auto-bot::state';
const DEFAULT_PRICE_OFFSET_PERCENT = 0.01;
const DEFAULT_POINTS_FACTOR = 1;
const DEFAULT_POINTS_TARGET = 15;
const BUILTIN_DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';
const BINANCE_ALPHA_PATTERN =
  /^https:\/\/www\.binance\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)alpha\/bsc\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/u;
const DEFAULT_BINANCE_ALPHA_URL =
  'https://www.binance.com/zh-CN/alpha/bsc/0xe6df05ce8c8301223373cf5b969afcb1498c5528';

// 稳定性相关常量
const STABILITY_FEED_URL = 'https://alpha123.uk/stability/stability_feed_v2.json';
const STABILITY_UPDATE_INTERVAL = 30000; // 30秒更新一次
const MAX_SPREAD_THRESHOLD = 2.0; // 价差基点阈值

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

export function Popup(): React.ReactElement {
  const [state, setState] = useState<SchedulerState | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTabContext>({
    url: null,
    tokenAddress: null,
    tokenSymbol: null,
    currentBalance: null,
    tabId: null,
    isSupported: false,
  });
  const [controlsBusy, setControlsBusy] = useState(false);
  const [localPriceOffset, setLocalPriceOffset] = useState('0.01');
  const [localPointsFactor, setLocalPointsFactor] = useState('1');
  const [localPointsTarget, setLocalPointsTarget] = useState('15');
  const [stableCoins, setStableCoins] = useState<StabilityItem[]>([]);
  const [stabilityLoading, setStabilityLoading] = useState(false);

  const isEditingPriceOffset = useRef(false);
  const isEditingPointsFactor = useRef(false);
  const isEditingPointsTarget = useRef(false);

  const spreadId = useId();
  const pointsFactorId = useId();
  const pointsTargetId = useId();

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

  // 获取稳定币种数据
  const fetchStableCoins = useCallback(async (): Promise<void> => {
    try {
      setStabilityLoading(true);
      const response = await fetch(STABILITY_FEED_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: StabilityFeed = await response.json();

      // 筛选：稳定性为"stable"且价差基点小于阈值
      const filtered = data.items
        .filter(item => {
          const isStable = item.st.includes('stable');
          const isLowSpread = item.spr <= MAX_SPREAD_THRESHOLD;
          return isStable && isLowSpread;
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

  useEffect(() => {
    void loadState();
    void refreshActiveTab();
    void fetchStableCoins(); // 初始加载稳定币种

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local' && STORAGE_KEY in changes) {
        setState(changes[STORAGE_KEY]?.newValue ?? null);
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

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      clearInterval(interval);
      clearInterval(stabilityInterval);
    };
  }, [loadState, refreshActiveTab, fetchStableCoins]);

  // Sync local input values with state, but not during active editing
  useEffect(() => {
    if (state) {
      const offset = getPriceOffsetPercent(state);
      const factor = getPointsFactor(state);
      const target = getPointsTarget(state);

      if (!isEditingPriceOffset.current) {
        setLocalPriceOffset(formatSpreadInputValue(offset));
      }
      if (!isEditingPointsFactor.current) {
        setLocalPointsFactor(String(factor));
      }
      if (!isEditingPointsTarget.current) {
        setLocalPointsTarget(String(target));
      }
    }
  }, [state]);

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

  async function handlePriceOffsetChange(value: string): Promise<void> {
    isEditingPriceOffset.current = false;
    const rawValue = Number.parseFloat(value);
    if (Number.isNaN(rawValue)) {
      return;
    }

    const sanitizedValue = clampPriceOffsetPercent(rawValue);
    setLocalPriceOffset(formatSpreadInputValue(sanitizedValue));

    const currentValue = getPriceOffsetPercent(state);
    if (!spreadValuesDiffer(currentValue, sanitizedValue)) {
      return;
    }

    await persistSchedulerSettings({ priceOffsetPercent: sanitizedValue });
  }

  async function handlePointsFactorChange(value: string): Promise<void> {
    isEditingPointsFactor.current = false;
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

  async function persistSchedulerSettings(settingsPatch: {
    priceOffsetPercent?: number;
    pointsFactor?: number;
    pointsTarget?: number;
  }): Promise<void> {
    const baseState = state ?? {
      isRunning: false,
      isEnabled: false,
      settings: {
        priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
        tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
        pointsFactor: DEFAULT_POINTS_FACTOR,
        pointsTarget: DEFAULT_POINTS_TARGET,
      },
    };

    const baseSettings = baseState.settings ?? {
      priceOffsetPercent: DEFAULT_PRICE_OFFSET_PERCENT,
      tokenAddress: BUILTIN_DEFAULT_TOKEN_ADDRESS,
      pointsFactor: DEFAULT_POINTS_FACTOR,
      pointsTarget: DEFAULT_POINTS_TARGET,
    };

    const nextState = {
      ...baseState,
      settings: {
        priceOffsetPercent: baseSettings.priceOffsetPercent,
        tokenAddress: baseSettings.tokenAddress,
        pointsFactor: baseSettings.pointsFactor,
        pointsTarget: baseSettings.pointsTarget,
        ...settingsPatch,
      },
    };

    await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
    setState(nextState);
  }

  const isRunning = state?.isRunning ?? false;
  const isEnabled = state?.isEnabled ?? false;
  const canOperate = activeTab.isSupported;

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

  const storedTokenAddress = getTokenAddress(state);
  const resolvedSymbol =
    activeTab.tokenAddress === storedTokenAddress
      ? (activeTab.tokenSymbol ?? state?.tokenSymbol ?? state?.lastResult?.tokenSymbol)
      : activeTab.tokenSymbol;

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

  function handleOpenStability(): void {
    chrome.tabs.create({ url: chrome.runtime.getURL('stability.html') });
  }

  return (
    <div style={{ width: 420, padding: 16, background: '#f5f5f5', minHeight: 600 }}>
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level={3} style={{ margin: 0 }}>
              <ThunderboltOutlined style={{ color: '#1890ff' }} /> Alpha 自动交易
            </Title>
          </div>

          <Card
            title={
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>推荐稳定币种</span>
              </Space>
            }
            bordered={false}
            size="small"
            style={{ marginBottom: 8 }}
            extra={
              <Button
                type="link"
                size="small"
                icon={<BarChartOutlined />}
                onClick={handleOpenStability}
              >
                详情
              </Button>
            }
          >
            {stabilityLoading ? (
              <Text type="secondary" style={{ fontSize: 12 }}>加载中...</Text>
            ) : stableCoins.length > 0 ? (
              <List
                size="small"
                dataSource={stableCoins}
                renderItem={(item) => (
                  <List.Item style={{ padding: '4px 0', borderBottom: 'none' }}>
                    <Space size="small" style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space size="small">
                        <Text strong style={{ fontSize: 13 }}>
                          {item.n.replace('/USDT', '')}
                        </Text>
                        <Tag color="success" style={{ fontSize: 11, margin: 0 }}>
                          稳定
                        </Tag>
                      </Space>
                      <Space size="small">
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          价差: {item.spr.toFixed(2)}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          天数: {item.md}
                        </Text>
                      </Space>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>暂无推荐币种</Text>
            )}
          </Card>

          <Card title="当前代币" bordered={false} size="small" style={{ marginBottom: 8 }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Text strong style={{ fontSize: 16 }}>
                {resolvedSymbol || '—'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                {activeTab.tokenAddress || '未选择代币'}
              </Text>
            </Space>
          </Card>

          <Space size="small" style={{ width: '100%', justifyContent: 'center' }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              loading={controlsBusy}
              disabled={controlsBusy || isEnabled || !canOperate}
              onClick={() => void handleStart()}
              size="large"
            >
              启动
            </Button>
            <Button
              danger
              icon={<PauseCircleOutlined />}
              loading={controlsBusy}
              disabled={controlsBusy || !isEnabled}
              onClick={() => void handleStop()}
              size="large"
            >
              停止
            </Button>
          </Space>

          {!activeTab.isSupported && (
            <Alert
              message="需要打开 Binance Alpha 代币页面"
              description={
                <Link href={DEFAULT_BINANCE_ALPHA_URL} target="_blank" rel="noopener noreferrer">
                  点击此处打开
                </Link>
              }
              type="warning"
              showIcon
            />
          )}

          {state?.lastError && (
            <Alert message="错误" description={state.lastError} type="error" showIcon closable />
          )}

          {isEnabled && (
            <Alert message={'自动化运行中'} type={isRunning ? 'success' : 'info'} showIcon />
          )}

          {typeof todaysAlphaPoints === 'number' &&
            Number.isFinite(todaysAlphaPoints) &&
            todaysAlphaPoints >= pointsTargetValue && (
              <Alert
                message="积分目标已达成"
                description={`当前积分 ${todaysAlphaPoints} ≥ 目标 ${pointsTargetValue}`}
                type="success"
                showIcon
              />
            )}
        </Space>
      </Card>

      <Card title="设置" size="small" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">价格偏移 (%)</Text>
            <InputNumber
              id={spreadId}
              min={0}
              max={5}
              step={0.001}
              placeholder="0.01"
              value={Number.parseFloat(localPriceOffset)}
              onChange={(value) => {
                isEditingPriceOffset.current = true;
                setLocalPriceOffset(String(value ?? 0.01));
              }}
              onBlur={(e) => void handlePriceOffsetChange(e.target.value)}
              disabled={controlsBusy}
              title="调整限价订单与 VWAP 的偏离距离"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <Text type="secondary">积分系数</Text>
            <InputNumber
              id={pointsFactorId}
              min={1}
              max={1000}
              step={1}
              placeholder="1"
              value={Number.parseFloat(localPointsFactor)}
              onChange={(value) => {
                isEditingPointsFactor.current = true;
                setLocalPointsFactor(String(value ?? 1));
              }}
              onBlur={(e) => void handlePointsFactorChange(e.target.value)}
              disabled={controlsBusy}
              title="每次成功订单后应用于记录买入量的乘数"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <Text type="secondary">积分目标</Text>
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
              disabled={controlsBusy}
              title="当今日 alpha 积分超过此阈值时停止自动化"
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Card>

      {snapshot && (
        <Card title="今日数据统计 (UTC)" size="small">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic
                title="Alpha 积分"
                value={todaysAlphaPoints !== undefined ? todaysAlphaPoints : '—'}
                prefix={<TrophyOutlined />}
                valueStyle={{ color: '#3f8600', fontSize: 20 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="成功交易"
                value={
                  state?.dailyBuyVolume?.date === todayKey
                    ? state.dailyBuyVolume.tradeCount?.toString()
                    : snapshot.successfulTradesToday?.toString()
                }
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="买入量"
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
                title="距下一积分"
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
                title="平均价格"
                value={formatNumber(snapshot.averagePrice, {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 8,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="初始余额"
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
                title="当前余额"
                value={formatNumber(activeTab.currentBalance ?? undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="总成本"
                value={formatNumber(calculateTotalCost(), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={12}>
              <Statistic
                title="成本比率"
                value={formatCostRatio(calculateCostRatio())}
                valueStyle={{ fontSize: 14 }}
              />
            </Col>
            <Col span={24}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text type="secondary">
                  <ClockCircleOutlined /> 更新时间
                </Text>
                <Text style={{ fontSize: 12 }}>
                  {snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleString() : '—'}
                </Text>
              </div>
            </Col>
          </Row>
        </Card>
      )}
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

function getPriceOffsetPercent(state: SchedulerState | null): number {
  const raw = state?.settings?.priceOffsetPercent;
  const numeric = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(numeric) ? clampPriceOffsetPercent(numeric) : DEFAULT_PRICE_OFFSET_PERCENT;
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

function clampPriceOffsetPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PRICE_OFFSET_PERCENT;
  }
  const clamped = Math.min(Math.max(value, 0), 5);
  return Number(clamped.toFixed(6));
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

function spreadValuesDiffer(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return true;
  }
  return Math.abs(a - b) > 1e-6;
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
