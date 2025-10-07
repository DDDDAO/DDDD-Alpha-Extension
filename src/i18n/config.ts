import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const LANGUAGE_KEY = 'dddd-alpha-language';

function persistLanguageToChromeStorage(lang: string): void {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ [LANGUAGE_KEY]: lang });
    }
  } catch (error) {
    console.warn('[i18n] Failed to persist language to chrome.storage:', error);
  }
}

// 从 storage 获取保存的语言设置
function getSavedLanguage(): string {
  const stored = localStorage.getItem(LANGUAGE_KEY) || 'zh-CN';
  persistLanguageToChromeStorage(stored);
  return stored;
}

// 保存语言设置到 storage
export function saveLanguage(lang: string): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
  persistLanguageToChromeStorage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': {
      translation: zhCN,
    },
    en: {
      translation: en,
    },
  },
  lng: getSavedLanguage(),
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
