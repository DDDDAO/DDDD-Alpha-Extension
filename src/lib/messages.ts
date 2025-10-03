export const MESSAGE_CHANNEL = 'alpha-auto-bot::channel';

export interface TaskResultMeta {
  averagePrice?: number;
  tradeCount?: number;
  buyVolumeDelta?: number;
  successfulTradesDelta?: number;
  tokenSymbol?: string;
  availableBalanceBeforeOrder?: number;
  currentBalance?: number;
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
      type: 'MANUAL_REFRESH';
      payload?: {
        tokenAddress?: string;
        tabId?: number;
      };
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
