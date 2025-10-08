export const MESSAGE_CHANNEL = 'dddd-alpah-extension::channel';

export interface TaskResultMeta {
  averagePrice?: number;
  tradeCount?: number;
  buyVolumeDelta?: number;
  successfulTradesDelta?: number;
  tokenSymbol?: string;
  availableBalanceBeforeOrder?: number;
  currentBalance?: number;
}

export interface FetchOrderHistoryResponse {
  success: boolean;
  status?: number;
  data?: unknown;
  message?: string;
}

export interface OrderHistorySnapshotPayload {
  date: string;
  totalBuyVolume: number;
  buyOrderCount: number;
  alphaPoints: number;
  nextThresholdDelta: number;
  fetchedAt: number;
  source?: 'popup' | 'automation';
}

export type RuntimeMessage =
  | {
      type: 'RUN_TASK';
    }
  | {
      type: 'RUN_TASK_ONCE';
    }
  | {
      type: 'REQUEST_TOKEN_SYMBOL';
    }
  | {
      type: 'REQUEST_CURRENT_BALANCE';
    }
  | {
      type: 'FETCH_ORDER_HISTORY';
      payload: {
        url: string;
      };
    }
  | {
      type: 'ORDER_HISTORY_SNAPSHOT';
      payload: OrderHistorySnapshotPayload;
    }
  | {
      type: 'BALANCE_UPDATE';
      payload?: {
        currentBalance?: number;
        tokenSymbol?: string;
      };
    }
  | {
      type: 'TASK_COMPLETE';
      payload: { success: boolean; details?: string; meta?: TaskResultMeta };
    }
  | {
      type: 'TASK_ERROR';
      payload: { message: string };
    }
  | {
      type: 'CONTROL_START';
      payload?: {
        tokenAddress?: string;
        tabId?: number;
      };
    }
  | {
      type: 'CONTROL_STOP';
    }
  | {
      type: 'FOCUS_WINDOW';
    };

export function postRuntimeMessage(message: RuntimeMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
}
