import { useTranslation } from 'react-i18next';

/**
 * Hook to get URLs with proper language code
 * Replaces zh-CN with en based on current language
 */
export function useI18nUrl() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  const getLocalizedUrl = (url: string): string => {
    if (currentLang === 'en') {
      return url.replace(/\/zh-CN\//g, '/en/');
    }
    return url;
  };

  const getBinanceAlphaUrl = (tokenAddress: string): string => {
    const lang = currentLang === 'en' ? 'en' : 'zh-CN';
    return `https://www.binance.com/${lang}/alpha/bsc/${tokenAddress}`;
  };

  return {
    getLocalizedUrl,
    getBinanceAlphaUrl,
    currentLang,
  };
}
