/**
 * 数据验证和规范化工具函数
 * 统一的数值验证、范围限制和格式化逻辑
 */

// 常量定义
const MIN_PRICE_OFFSET_PERCENT = -5;
const MAX_PRICE_OFFSET_PERCENT = 5;
const MIN_POINTS_FACTOR = 1;
const MAX_POINTS_FACTOR = 1000;
const MIN_POINTS_TARGET = 1;
const MAX_POINTS_TARGET = 1000;

/**
 * 将数值限制在指定范围内
 * @param value - 要限制的数值
 * @param min - 最小值
 * @param max - 最大值
 * @returns 限制后的数值
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

/**
 * 限制价格偏移百分比在有效范围内
 * @param value - 价格偏移百分比
 * @returns 限制后的价格偏移百分比
 */
export function clampPriceOffsetPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < MIN_PRICE_OFFSET_PERCENT) {
    return MIN_PRICE_OFFSET_PERCENT;
  }

  if (value > MAX_PRICE_OFFSET_PERCENT) {
    return MAX_PRICE_OFFSET_PERCENT;
  }

  return Number(value.toFixed(6));
}

/**
 * 限制积分因子在有效范围内
 * @param value - 积分因子
 * @returns 限制后的积分因子
 */
export function clampPointsFactor(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_POINTS_FACTOR;
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

/**
 * 限制积分目标在有效范围内
 * @param value - 积分目标
 * @returns 限制后的积分目标
 */
export function clampPointsTarget(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_POINTS_TARGET;
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

/**
 * 规范化交易量增量
 * @param value - 交易量值（可能是数字或其他类型）
 * @returns 规范化后的交易量（非正数返回0）
 */
export function normalizeVolumeDelta(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return numeric;
}

/**
 * 规范化计数增量
 * @param value - 计数值（可能是数字或其他类型）
 * @returns 规范化后的计数（向下取整，非正数返回0）
 */
export function normalizeCountDelta(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

/**
 * 规范化余额值
 * @param value - 余额值（可能是数字或其他类型）
 * @returns 规范化后的余额（负数或无效值返回undefined）
 */
export function normalizeBalance(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
}

/**
 * 规范化代币符号
 * @param value - 代币符号（可能是字符串或其他类型）
 * @returns 规范化后的代币符号（空字符串返回undefined）
 */
export function normalizeTokenSymbol(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

/**
 * 解析数值（支持K/M/B后缀）
 * @param raw - 原始字符串
 * @returns 解析后的数值或null
 */
export function parseNumericValue(raw: string): number | null {
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

/**
 * 提取价格偏移百分比
 * @param value - 价格偏移值
 * @param fallback - 回退值
 * @returns 规范化后的价格偏移百分比
 */
export function extractPriceOffsetPercent(value: unknown, fallback: number): number {
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

/**
 * 提取积分因子
 * @param value - 积分因子值
 * @returns 规范化后的积分因子
 */
export function extractPointsFactor(value: unknown, defaultValue = MIN_POINTS_FACTOR): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'number') {
    return clampPointsFactor(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return clampPointsFactor(parsed);
}

/**
 * 提取积分目标
 * @param value - 积分目标值
 * @returns 规范化后的积分目标
 */
export function extractPointsTarget(value: unknown, defaultValue = MIN_POINTS_TARGET): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'number') {
    return clampPointsTarget(value);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return clampPointsTarget(parsed);
}

/**
 * 清理代币地址（提取0x开头的40位十六进制地址）
 * @param value - 可能包含代币地址的字符串
 * @returns 清理后的代币地址或undefined
 */
export function sanitizeTokenAddress(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/0x[a-fA-F0-9]{40}/u);
  return match ? match[0].toLowerCase() : undefined;
}

/**
 * 清理Tab ID
 * @param value - Tab ID值
 * @returns 有效的Tab ID或undefined
 */
export function sanitizeTabId(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}
