export interface AutomationDefaults {
  tokenAddress: string;
  intervalMinutes: number;
  alarmName: string;
}

const BINANCE_ALPHA_BASE_URL = 'https://www.binance.com/en/alpha/bsc/';
export const DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';
export const DEFAULT_PRICE_OFFSET_PERCENT = 0.01;
export const DEFAULT_POINTS_FACTOR = 1;
export const DEFAULT_POINTS_TARGET = 15;

export function resolveTargetUrl(tokenAddress?: string): string {
  const normalizedAddress = tokenAddress?.trim() || DEFAULT_TOKEN_ADDRESS;
  return `${BINANCE_ALPHA_BASE_URL}${encodeURIComponent(normalizedAddress)}`;
}

export const DEFAULT_AUTOMATION: AutomationDefaults = {
  tokenAddress: DEFAULT_TOKEN_ADDRESS,
  intervalMinutes: 0.5,
  alarmName: 'alpha-auto-bot::heartbeat',
};
