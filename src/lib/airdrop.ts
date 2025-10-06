export interface AirdropApiItem {
  token: string;
  name?: string;
  date?: string;
  time?: string;
  points?: string | number;
  amount?: string | number;
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
  utcDate: string;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sanitizeText(value?: string | number | null): string | undefined {
  // 处理 number 类型，转换为 string
  if (typeof value === 'number') {
    return value.toString();
  }
  // 处理 string 类型
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function withDash(value?: string | number | null): string {
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
  options?: {
    phase?: number;
    fallbackTime?: string;
  },
): LocalDateInfo | null {
  const sanitizedDate = sanitizeText(dateStr);
  if (!sanitizedDate) {
    return null;
  }

  const normalizedTime = normalizeTimeString(timeStr);
  const usedFallbackTime = !normalizedTime;
  const fallbackTime = normalizeTimeString(options?.fallbackTime ?? '14:00');
  const timeForParse = normalizedTime ?? fallbackTime;

  if (!timeForParse) {
    return null;
  }

  const isoCandidate = `${sanitizedDate}T${timeForParse.length === 5 ? timeForParse : `${timeForParse}:00`}`;
  const dateTime = new Date(`${isoCandidate}+08:00`);

  if (Number.isNaN(dateTime.getTime())) {
    return null;
  }

  let adjustedDateTime = dateTime;

  if (options?.phase === 2 && !usedFallbackTime) {
    adjustedDateTime = new Date(dateTime.getTime() + 18 * 60 * 60 * 1000);
  }

  return {
    date: formatLocalDate(adjustedDateTime),
    time: `${adjustedDateTime.getHours().toString().padStart(2, '0')}:${adjustedDateTime
      .getMinutes()
      .toString()
      .padStart(2, '0')}`,
    dateTime: adjustedDateTime,
    usedFallbackTime,
    utcDate: adjustedDateTime.toISOString().split('T')[0],
  };
}

function determineBucket(
  categoryUtcDate: string | null,
  airdrop: AirdropApiItem,
  beijingToday: string,
  beijingTomorrow: string,
): Bucket | null {
  if (categoryUtcDate) {
    if (categoryUtcDate < beijingToday) {
      return null;
    }
    if (categoryUtcDate === beijingToday) {
      return 'today';
    }
    if (categoryUtcDate === beijingTomorrow) {
      return 'tomorrow';
    }
    if (categoryUtcDate > beijingToday) {
      return 'future';
    }
    return null;
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

function getLocale(): string {
  try {
    return localStorage.getItem('dddd-alpha-language') || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

function formatDatePrefix(month: number, day: number, locale: string): string {
  if (locale === 'en') {
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${monthNames[month - 1]} ${day}`;
  }
  return `${month}月${day}日`;
}

function buildDisplayTime(
  baseLabel: string,
  hasExplicitTime: boolean,
  bucket: Bucket | null,
  categoryDate: string | null,
  referenceInfo: LocalDateInfo | null,
): string {
  const locale = getLocale();
  const trimmedBase = baseLabel.trim();
  const normalizedBase = trimmedBase.length > 0 ? trimmedBase : baseLabel;

  if (!bucket || bucket === 'today') {
    return normalizedBase;
  }

  if (bucket === 'tomorrow') {
    const tomorrowText = locale === 'en' ? 'Tomorrow' : '明天';
    if (!hasExplicitTime) {
      return tomorrowText;
    }
    return `${tomorrowText} ${normalizedBase}`;
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
  const prefix = formatDatePrefix(month, day, locale);

  if (!hasExplicitTime) {
    return prefix;
  }

  return `${prefix} ${normalizedBase}`;
}

function computeSortKey(info: LocalDateInfo | null, airdrop: AirdropApiItem): number {
  // 【修复排序】优先使用实际空投时间，而非创建/更新时间
  // 1. 优先：实际空投时间（包含具体时分）
  if (info?.dateTime) {
    return info.dateTime.getTime();
  }

  // 2. 次选：日期字段（至少有日期信息）
  if (airdrop.date) {
    const beijingDate = new Date(`${airdrop.date}T00:00:00+08:00`);
    if (!Number.isNaN(beijingDate.getTime())) {
      return beijingDate.getTime();
    }
  }

  // 3. 最后：使用系统时间戳（创建/更新时间）
  const candidates: number[] = [];

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
  const beijingOffsetMs = 8 * 60 * 60 * 1000;
  const beijingToday = new Date(now.getTime() + beijingOffsetMs).toISOString().split('T')[0];
  const beijingTomorrow = new Date(now.getTime() + beijingOffsetMs + 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  if (!apiData?.airdrops || !Array.isArray(apiData.airdrops)) {
    return { today: [], forecast: [], timestamp: Date.now() };
  }

  const todayEntries: Array<{ item: ProcessedAirdrop; sortKey: number }> = [];
  const forecastEntries: Array<{ item: ProcessedAirdrop; sortKey: number }> = [];

  // 当前时间戳(秒)
  const nowTimestamp = Math.floor(Date.now() / 1000);

  apiData.airdrops.forEach((airdrop) => {
    if (!airdrop?.token) {
      return;
    }

    const localInfo = convertBeijingToLocal(airdrop.date, airdrop.time, {
      phase: airdrop.phase,
      fallbackTime: '14:00',
    });

    const categoryDate = localInfo?.date ?? sanitizeText(airdrop.date) ?? null;
    const categoryUtcDate =
      localInfo?.utcDate ??
      (() => {
        const sanitizedDate = sanitizeText(airdrop.date);
        if (!sanitizedDate) {
          return null;
        }
        const beijingDate = new Date(`${sanitizedDate}T00:00:00+08:00`);
        return Number.isNaN(beijingDate.getTime()) ? null : beijingDate.toISOString().split('T')[0];
      })();

    // 【复刻】过期判断逻辑：空投时间+24小时后标记为completed
    let isExpired = airdrop.completed ?? false;
    if (localInfo?.dateTime && !isExpired) {
      const expireTime = new Date(localInfo.dateTime.getTime() + 86400000); // +24小时
      const expireTimestamp = Math.floor(expireTime.getTime() / 1000);
      if (nowTimestamp > expireTimestamp) {
        isExpired = true;
      }
    }

    const bucket = determineBucket(categoryUtcDate, airdrop, beijingToday, beijingTomorrow);

    if (!bucket) {
      return;
    }

    const locale = getLocale();
    const baseTimeFromApi = sanitizeText(airdrop.utc) ?? sanitizeText(airdrop.time);
    let baseLabel = locale === 'en' ? 'TBA' : '待公布';
    let hasExplicitTime = false;

    if (localInfo && !localInfo.usedFallbackTime) {
      baseLabel = localInfo.time;
      hasExplicitTime = true;
    } else if (baseTimeFromApi) {
      baseLabel = baseTimeFromApi;
      hasExplicitTime =
        baseTimeFromApi !== '-' && baseTimeFromApi !== '待公布' && baseTimeFromApi !== 'TBA';
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
      completed: isExpired, // 使用计算后的过期状态
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
