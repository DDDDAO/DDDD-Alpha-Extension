/**
 * 历史记录合并器
 */

import type { BinanceOrderHistoryResponse } from '@types';

export class HistoryMerger {
  mergeResponses(responses: BinanceOrderHistoryResponse[]): unknown[] {
    const allItems: unknown[] = [];

    for (const response of responses) {
      if (!response || typeof response !== 'object') continue;
      if (!response.data || !Array.isArray(response.data)) continue;

      allItems.push(...response.data);
    }

    return allItems;
  }
}
