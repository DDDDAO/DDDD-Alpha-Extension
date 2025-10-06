import { GlobalOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { Button, Dropdown } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { saveLanguage } from '../i18n/config';
import { AIRDROP_STORAGE_KEY } from '../lib/airdrop';

export function LanguageSwitcher(): React.ReactElement {
  const { i18n } = useTranslation();

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
    saveLanguage(value);
    // 更新 HTML lang 属性
    document.documentElement.lang = value === 'en' ? 'en' : 'zh-CN';

    // 清除空投数据缓存，强制重新获取以应用新语言
    chrome.storage.local.remove(AIRDROP_STORAGE_KEY, () => {
      // 刷新页面以重新加载数据
      window.location.reload();
    });
  };

  const items: MenuProps['items'] = [
    {
      key: 'zh-CN',
      label: '中文',
      onClick: () => handleLanguageChange('zh-CN'),
    },
    {
      key: 'en',
      label: 'English',
      onClick: () => handleLanguageChange('en'),
    },
  ];

  const currentLabel = i18n.language === 'en' ? 'EN' : '中';

  return (
    <Dropdown menu={{ items, selectedKeys: [i18n.language] }} trigger={['click']}>
      <Button
        type="text"
        icon={<GlobalOutlined />}
        size="small"
        style={{
          color: '#0DA2FF',
          fontSize: 14,
          padding: '4px 8px',
          height: 'auto',
        }}
      >
        {currentLabel}
      </Button>
    </Dropdown>
  );
}
