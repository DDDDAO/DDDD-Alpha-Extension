/**
 * 活动标签 Hook
 */

import { useCallback, useEffect, useState } from 'react';

interface ActiveTabContext {
  url: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  currentBalance: number | null;
  tabId: number | null;
  isSupported: boolean;
}

export function useActiveTab() {
  const [activeTab, setActiveTab] = useState<ActiveTabContext>({
    url: null,
    tokenAddress: null,
    tokenSymbol: null,
    currentBalance: null,
    tabId: null,
    isSupported: false,
  });

  const refreshActiveTab = useCallback(async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const [currentTab] = tabs;
      const url = currentTab?.url ?? null;
      const tokenAddress = url ? extractTokenFromUrl(url) : null;
      const tabId = typeof currentTab?.id === 'number' ? currentTab.id : null;

      let tokenSymbol: string | null = null;
      let currentBalance: number | null = null;

      if (tabId !== null && tokenAddress) {
        tokenSymbol = await requestTokenSymbol(tabId);
        currentBalance = await requestCurrentBalance(tabId);
      }

      setActiveTab({
        url,
        tokenAddress,
        tokenSymbol,
        currentBalance,
        tabId,
        isSupported: Boolean(tokenAddress),
      });
    } catch (error) {
      console.error('Failed to refresh active tab:', error);
    }
  }, []);

  useEffect(() => {
    refreshActiveTab();

    const interval = setInterval(refreshActiveTab, 3000);

    return () => clearInterval(interval);
  }, [refreshActiveTab]);

  return { activeTab, refreshActiveTab };
}

function extractTokenFromUrl(url: string): string | null {
  const BINANCE_ALPHA_PATTERN =
    /^https:\/\/www\.binance\.com\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)alpha\/bsc\/(0x[a-fA-F0-9]{40})(?:[/?#]|$)/u;
  const match = url.match(BINANCE_ALPHA_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

async function requestTokenSymbol(tabId: number): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_TOKEN_SYMBOL' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const value = typeof response?.tokenSymbol === 'string' ? response.tokenSymbol.trim() : '';
      resolve(value.length > 0 ? value : null);
    });
  });
}

async function requestCurrentBalance(tabId: number): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'REQUEST_CURRENT_BALANCE' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const value = typeof response?.currentBalance === 'number' ? response.currentBalance : null;
      if (value === null || Number.isNaN(value)) {
        resolve(null);
        return;
      }
      resolve(value);
    });
  });
}
