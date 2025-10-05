import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

const LANGUAGE_KEY = 'dddd-alpha-language';

// 从 storage 获取保存的语言设置
function getSavedLanguage(): string {
  return localStorage.getItem(LANGUAGE_KEY) || 'zh-CN';
}

// 保存语言设置到 storage
export function saveLanguage(lang: string): void {
  localStorage.setItem(LANGUAGE_KEY, lang);
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
