export interface AirdropApiItem {
  token: string;
  name?: string;
  date?: string;
  time?: string;
  points?: string;
  amount?: string;
  status?: string;
  chain_id?: string;
  contract_address?: string;
  utc?: string;
  phase?: number;
  type?: 'grab' | 'tge' | string;
  completed?: boolean;
  system_timestamp?: number;
  created_timestamp?: number;
  updated_timestamp?: number;
}

export interface AirdropApiResponse {
  airdrops: AirdropApiItem[];
}

export interface PriceInfo {
  dex_price?: number;
  cex_price?: number;
  [key: string]: number | undefined;
}

export interface PricesApiResponse {
  success: boolean;
  prices: Record<string, PriceInfo>;
}

export interface ProcessedAirdrop {
  symbol: string;
  name: string;
  quantity: string;
  threshold: string;
  time: string;
  chain?: string;
  contract?: string;
  status?: string;
  phase?: number;
  type?: string;
  completed?: boolean;
  price?: number;
  estimatedValue?: string;
}

export interface AirdropData {
  today: ProcessedAirdrop[];
  forecast: ProcessedAirdrop[];
  prices?: Record<string, PriceInfo>;
  timestamp: number;
}

export const AIRDROP_STORAGE_KEY = 'AIRDROP_DATA';

type Bucket = 'today' | 'tomorrow' | 'future';

interface LocalDateInfo {
  date: string;
  time: string;
  dateTime: Date;
  usedFallbackTime: boolean;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function withDash(value?: string | null): string {
  const sanitized = sanitizeText(value);
  return sanitized ?? '-';
}

function normalizeTimeString(time?: string | null): string | null {
  const sanitized = sanitizeText(time);
  if (!sanitized) {
    return null;
  }

  const match = sanitized.match(/([0-2]?\d)(?:[:：]?(\d{2}))?/u);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;

  if (Number.isNaN(hours) || hours < 0 || hours > 23) {
    return null;
  }

  const clampedMinutes = Number.isNaN(minutes) ? 0 : Math.max(0, Math.min(59, minutes));

  return `${`${hours}`.padStart(2, '0')}:${`${clampedMinutes}`.padStart(2, '0')}`;
}

function convertBeijingToLocal(
  dateStr?: string | null,
  timeStr?: string | null,
): LocalDateInfo | null {
  const sanitizedDate = sanitizeText(dateStr);
  if (!sanitizedDate) {
    return null;
  }

  const normalizedTime = normalizeTimeString(timeStr);
  const usedFallbackTime = !normalizedTime;
  const timeForParse = normalizedTime ?? '14:00';

  const isoCandidate = `${sanitizedDate}T${timeForParse.length === 5 ? timeForParse : `${timeForParse}:00`}`;
  const dateTime = new Date(`${isoCandidate}+08:00`);

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  return {
    date: formatLocalDate(dateTime),
    time: `${dateTime.getHours().toString().padStart(2, '0')}:${dateTime
      .getMinutes()
      .toString()
      .padStart(2, '0')}`,
    dateTime,
    usedFallbackTime,
  };
}

function determineBucket(
  categoryDate: string | null,
  airdrop: AirdropApiItem,
  todayStr: string,
  tomorrowStr: string,
): Bucket | null {
  if (categoryDate) {
    if (categoryDate === todayStr) {
      return 'today';
    }
    if (categoryDate === tomorrowStr) {
      return 'tomorrow';
    }
    if (categoryDate > todayStr) {
      return 'future';
    }
  }

  const status = sanitizeText(airdrop.status)?.toLowerCase();
  if (!status) {
    return null;
  }

  if (status === 'live' || status === 'active' || status === 'ongoing') {
    return 'today';
  }

  if (status === 'announced' || status === 'upcoming' || status === 'scheduled') {
    return 'future';
  }

  return null;
}

function buildDisplayTime(
  baseLabel: string,
  hasExplicitTime: boolean,
  bucket: Bucket | null,
  categoryDate: string | null,
  referenceInfo: LocalDateInfo | null,
): string {
  const trimmedBase = baseLabel.trim();
  const normalizedBase = trimmedBase.length > 0 ? trimmedBase : baseLabel;

  if (!bucket || bucket === 'today') {
    return normalizedBase;
  }

  if (bucket === 'tomorrow') {
    if (!hasExplicitTime) {
      return '明天';
    }
    return `明天 ${normalizedBase}`;
  }

  const referenceDate = referenceInfo?.dateTime
    ? new Date(referenceInfo.dateTime)
    : categoryDate
      ? new Date(`${categoryDate}T00:00:00`)
      : null;

  if (!referenceDate || Number.isNaN(referenceDate.getTime())) {
    return normalizedBase;
  }

  const month = referenceDate.getMonth() + 1;
  const day = referenceDate.getDate();
  const prefix = `${month}月${day}日`;

  if (!hasExplicitTime) {
    return prefix;
  }

  return `${prefix} ${normalizedBase}`;
}

function computeSortKey(info: LocalDateInfo | null, airdrop: AirdropApiItem): number {
  const candidates: number[] = [];

  if (info?.dateTime) {
    candidates.push(info.dateTime.getTime());
  }

  if (airdrop.date) {
    const beijingDate = new Date(`${airdrop.date}T00:00:00+08:00`);
    if (!Number.isNaN(beijingDate.getTime())) {
      candidates.push(beijingDate.getTime());
    }
  }

  if (typeof airdrop.system_timestamp === 'number') {
    candidates.push(airdrop.system_timestamp * 1000);
  }

  if (typeof airdrop.updated_timestamp === 'number') {
    candidates.push(airdrop.updated_timestamp * 1000);
  }

  if (typeof airdrop.created_timestamp === 'number') {
    candidates.push(airdrop.created_timestamp * 1000);
  }

  if (candidates.length === 0) {
    return Date.now();
  }

  return Math.min(...candidates);
}

export function processAirdropApiResponse(apiData: AirdropApiResponse | null): AirdropData {
  const now = new Date();
  const todayStr = formatLocalDate(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);

  if (!apiData?.airdrops || !Array.isArray(apiData.airdrops)) {
    return { today: [], forecast: [], timestamp: Date.now() };
  }

  const todayEntries: Array<{ item: ProcessedAirdrop; sortKey: number }> = [];
  const forecastEntries: Array<{ item: ProcessedAirdrop; sortKey: number }> = [];

  apiData.airdrops.forEach((airdrop) => {
    if (!airdrop?.token) {
      return;
    }

    const localInfo = convertBeijingToLocal(airdrop.date, airdrop.time);
    const categoryDate = localInfo?.date ?? sanitizeText(airdrop.date) ?? null;
    const bucket = determineBucket(categoryDate, airdrop, todayStr, tomorrowStr);

    if (!bucket) {
      return;
    }

    const baseTimeFromApi = sanitizeText(airdrop.utc) ?? sanitizeText(airdrop.time);
    let baseLabel = '待公布';
    let hasExplicitTime = false;

    if (localInfo && !localInfo.usedFallbackTime) {
      baseLabel = localInfo.time;
      hasExplicitTime = true;
    } else if (baseTimeFromApi) {
      baseLabel = baseTimeFromApi;
      hasExplicitTime = baseTimeFromApi !== '-' && baseTimeFromApi !== '待公布';
    }

    const displayTime = buildDisplayTime(
      baseLabel,
      hasExplicitTime,
      bucket,
      categoryDate,
      localInfo,
    );

    const processed: ProcessedAirdrop = {
      symbol: airdrop.token,
      name: sanitizeText(airdrop.name) ?? airdrop.token,
      quantity: withDash(airdrop.amount),
      threshold: withDash(airdrop.points),
      time: displayTime,
      chain: airdrop.chain_id === '8453' ? 'Base' : sanitizeText(airdrop.chain_id),
      contract: sanitizeText(airdrop.contract_address),
      status: airdrop.status,
      phase: airdrop.phase,
      type: airdrop.type,
      completed: airdrop.completed,
    };

    const sortKey = computeSortKey(localInfo, airdrop);

    if (bucket === 'today') {
      todayEntries.push({ item: processed, sortKey });
    } else {
      forecastEntries.push({ item: processed, sortKey });
    }
  });

  todayEntries.sort((a, b) => a.sortKey - b.sortKey);
  forecastEntries.sort((a, b) => a.sortKey - b.sortKey);

  return {
    today: todayEntries.map((entry) => entry.item),
    forecast: forecastEntries.map((entry) => entry.item),
    timestamp: Date.now(),
  };
}
