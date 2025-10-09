/**
 * 余额相关类型定义
 */

/**
 * 余额提取结果
 */
export interface BalanceExtractResult {
  balance: number | null;
  error?: string;
}

/**
 * 余额更新负载
 */
export interface BalanceUpdatePayload {
  currentBalance?: number;
  tokenSymbol?: string;
}

/**
 * 每日余额统计
 */
export interface DailyBalanceStats {
  date: string;
  firstBalance?: number;
  currentBalance?: number;
  spent?: number;
}
