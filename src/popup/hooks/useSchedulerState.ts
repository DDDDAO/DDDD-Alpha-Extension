/**
 * 调度器状态 Hook
 */

import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEY } from '../../config/storageKey';
import type { SchedulerState } from '../../lib/storage';

export function useSchedulerState() {
  const [state, setState] = useState<SchedulerState | null>(null);
  const [loading, setLoading] = useState(true);

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const loadedState = result[STORAGE_KEY] ?? null;
      setState(loadedState);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      if (STORAGE_KEY in changes) {
        setState(changes[STORAGE_KEY]?.newValue ?? null);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadState]);

  return { state, loading, loadState, setState };
}
