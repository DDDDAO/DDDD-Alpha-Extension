export const ORDER_HISTORY_ENDPOINT =
  'https://www.binance.com/bapi/defi/v1/private/alpha-trade/order/get-order-history-web';

export const ORDER_HISTORY_STATUS_FILTER = 'FILLED';

export interface BinanceOrderHistoryItem {
  orderId?: string;
  baseAsset?: string;
  quoteAsset?: string;
  side?: string;
  status?: string;
  cumQuote?: string;
  updateTime?: number;
  time?: number;
}

export interface BinanceOrderHistoryResponse {
  code?: string;
  message?: string | null;
  data?: BinanceOrderHistoryItem[] | null;
}

export interface OrderHistorySummary {
  totalBuyVolume: number;
  buyOrderCount: number;
  earliestOrderTime?: number;
  latestOrderTime?: number;
}

export type MultiplierLookup = (alphaId: string) => number;

export function buildOrderHistoryUrl(now = new Date()): string {
  const startTimeUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const endTimeMs = now.getTime();

  const params = new URLSearchParams({
    page: '1',
    rows: '100',
    orderStatus: ORDER_HISTORY_STATUS_FILTER,
    side: 'BUY',
    startTime: String(startTimeUtc),
    endTime: String(endTimeMs),
  });

  return `${ORDER_HISTORY_ENDPOINT}?${params.toString()}`;
}

export function summarizeOrderHistoryData(
  payload: unknown,
  getMultiplier: MultiplierLookup,
): OrderHistorySummary {
  const summary: OrderHistorySummary = {
    totalBuyVolume: 0,
    buyOrderCount: 0,
  };

  if (!payload || typeof payload !== 'object') {
    return summary;
  }

  const response = payload as BinanceOrderHistoryResponse;
  if (response.code !== '000000' || !Array.isArray(response.data)) {
    return summary;
  }

  for (const item of response.data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const status = typeof item.status === 'string' ? item.status.toUpperCase() : '';
    if (status !== 'FILLED') {
      continue;
    }

    const side = typeof item.side === 'string' ? item.side.toUpperCase() : '';
    if (side !== 'BUY') {
      continue;
    }

    const quoteAsset = typeof item.quoteAsset === 'string' ? item.quoteAsset.toUpperCase() : '';
    if (quoteAsset !== 'USDT') {
      continue;
    }

    const cumQuote = typeof item.cumQuote === 'string' ? Number.parseFloat(item.cumQuote) : NaN;
    if (!Number.isFinite(cumQuote) || cumQuote <= 0) {
      continue;
    }

    const alphaIdRaw = typeof item.baseAsset === 'string' ? item.baseAsset.trim() : '';
    const alphaId = alphaIdRaw.length > 0 ? alphaIdRaw.toUpperCase() : '';
    const multiplier = sanitizeMultiplier(getMultiplier(alphaId));
    const scaledVolume = cumQuote * multiplier;

    if (!Number.isFinite(scaledVolume) || scaledVolume <= 0) {
      continue;
    }

    summary.totalBuyVolume += scaledVolume;
    summary.buyOrderCount += 1;

    if (typeof item.time === 'number' && Number.isFinite(item.time)) {
      summary.earliestOrderTime = summary.earliestOrderTime
        ? Math.min(summary.earliestOrderTime, item.time)
        : item.time;
      summary.latestOrderTime = summary.latestOrderTime
        ? Math.max(summary.latestOrderTime, item.time)
        : item.time;
    } else if (typeof item.updateTime === 'number' && Number.isFinite(item.updateTime)) {
      summary.earliestOrderTime = summary.earliestOrderTime
        ? Math.min(summary.earliestOrderTime, item.updateTime)
        : item.updateTime;
      summary.latestOrderTime = summary.latestOrderTime
        ? Math.max(summary.latestOrderTime, item.updateTime)
        : item.updateTime;
    }
  }

  if (!Number.isFinite(summary.totalBuyVolume) || summary.totalBuyVolume <= 0) {
    summary.totalBuyVolume = 0;
  }

  if (!Number.isFinite(summary.buyOrderCount) || summary.buyOrderCount <= 0) {
    summary.buyOrderCount = 0;
  }

  return summary;
}

function sanitizeMultiplier(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }

  return numeric;
}
