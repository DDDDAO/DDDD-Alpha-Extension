const BINANCE_ALPHA_BASE_URL = 'https://www.binance.com/en/alpha/bsc/';
const DEFAULT_TOKEN_ADDRESS = '0xe6df05ce8c8301223373cf5b969afcb1498c5528';

export function resolveTargetUrl(tokenAddress) {
  const address =
    typeof tokenAddress === 'string' && tokenAddress.trim().length > 0
      ? tokenAddress.trim()
      : DEFAULT_TOKEN_ADDRESS;
  return `${BINANCE_ALPHA_BASE_URL}${encodeURIComponent(address)}`;
}

export const DEFAULT_AUTOMATION = {
  tokenAddress: DEFAULT_TOKEN_ADDRESS,
  intervalMinutes: 5,
  alarmName: 'dddd-alpah-extension::heartbeat',
};
