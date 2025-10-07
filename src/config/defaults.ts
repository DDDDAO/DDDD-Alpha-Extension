export interface AutomationDefaults {
  tokenAddress: string;
  intervalMinutes: number;
  alarmName: string;
}

const BINANCE_ALPHA_BASE_URL = 'https://www.binance.com/en/alpha/bsc/';
export const DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';
export const DEFAULT_PRICE_OFFSET_PERCENT = 0.01;
export const DEFAULT_BUY_PRICE_OFFSET_PERCENT = DEFAULT_PRICE_OFFSET_PERCENT;
export const DEFAULT_SELL_PRICE_OFFSET_PERCENT = -0.01;
export const DEFAULT_POINTS_FACTOR = 1;
export const DEFAULT_POINTS_TARGET = 15;
export const MAX_SUCCESSFUL_TRADES = 500;
export const SUCCESSFUL_TRADES_LIMIT_MESSAGE =
  '系统目前只支持最多500次买入交易,如需更多交易次数,请加入社区联系管理员.';

export function resolveTargetUrl(tokenAddress?: string): string {
  const normalizedAddress = tokenAddress?.trim() || DEFAULT_TOKEN_ADDRESS;
  return `${BINANCE_ALPHA_BASE_URL}${encodeURIComponent(normalizedAddress)}`;
}

export const DEFAULT_AUTOMATION: AutomationDefaults = {
  tokenAddress: DEFAULT_TOKEN_ADDRESS,
  intervalMinutes: 0.5,
  alarmName: 'dddd-alpah-extension::heartbeat',
};
