/**
 * Token 目录 Hook
 */

import { useCallback, useEffect, useState } from 'react';
import { TOKEN_DIRECTORY_STORAGE_KEY } from '../../config/storageKey';

interface TokenDirectoryEntry {
  symbol: string;
  contractAddress: string;
  iconUrl: string | null;
  mulPoint: number | null;
  alphaId?: string | null;
}

const TOKEN_LIST_URL =
  'https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list';

const FALLBACK_TOKEN_DIRECTORY: Record<string, TokenDirectoryEntry> = {
  KOGE: {
    symbol: 'KOGE',
    contractAddress: '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
    iconUrl: null,
    mulPoint: null,
  },
};

const TOKEN_DIRECTORY_UPDATE_INTERVAL = 10 * 60 * 1000; // 10分钟

export function useTokenDirectory() {
  const [tokenDirectory, setTokenDirectory] = useState<Record<string, TokenDirectoryEntry>>({
    ...FALLBACK_TOKEN_DIRECTORY,
  });
  const [loading, setLoading] = useState(false);

  const fetchTokenDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(TOKEN_LIST_URL);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const payload: { code?: string; data?: any[] } = await response.json();
      if (payload.code !== '000000' || !Array.isArray(payload.data)) {
        throw new Error('Unexpected token list response structure');
      }

      const nextDirectory: Record<string, TokenDirectoryEntry> = {
        ...FALLBACK_TOKEN_DIRECTORY,
      };

      for (const token of payload.data) {
        const rawSymbol = typeof token.symbol === 'string' ? token.symbol.trim() : '';
        const rawAddress =
          typeof token.contractAddress === 'string' ? token.contractAddress.trim() : '';

        if (rawSymbol.length === 0 || !/^0x[a-fA-F0-9]{40}$/u.test(rawAddress)) {
          continue;
        }

        const normalizedSymbol = rawSymbol.toUpperCase();
        const contractAddress = rawAddress.toLowerCase();
        const iconUrl =
          typeof token.iconUrl === 'string' && token.iconUrl.trim().length > 0
            ? token.iconUrl.trim()
            : null;

        let mulPoint: number | null = null;
        if (typeof token.mulPoint === 'number') {
          mulPoint = Number.isFinite(token.mulPoint) && token.mulPoint > 0 ? token.mulPoint : null;
        }

        const rawAlphaId = typeof token.alphaId === 'string' ? token.alphaId.trim() : '';
        const alphaId = rawAlphaId.length > 0 ? rawAlphaId.toUpperCase() : null;

        nextDirectory[normalizedSymbol] = {
          symbol: normalizedSymbol,
          contractAddress,
          iconUrl,
          mulPoint,
          alphaId,
        };
      }

      setTokenDirectory(nextDirectory);
      await chrome.storage.local.set({
        [TOKEN_DIRECTORY_STORAGE_KEY]: {
          directory: nextDirectory,
          updatedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error('Failed to fetch token list:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 从缓存加载
    chrome.storage.local.get(TOKEN_DIRECTORY_STORAGE_KEY, (result) => {
      const cached = result[TOKEN_DIRECTORY_STORAGE_KEY];
      if (cached?.directory) {
        setTokenDirectory(cached.directory);
      }
    });

    // 定期更新
    fetchTokenDirectory();
    const interval = setInterval(fetchTokenDirectory, TOKEN_DIRECTORY_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchTokenDirectory]);

  return { tokenDirectory, loading, fetchTokenDirectory };
}
