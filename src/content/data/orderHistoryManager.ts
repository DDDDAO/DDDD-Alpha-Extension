/**
 * 订单历史管理模块
 * 负责获取、合并和快照订单历史数据
 */
import { calculateAlphaPointStats } from '../../lib/alphaPoints.js';
import {
  type FetchOrderHistoryResponse,
  type OrderHistorySnapshotPayload,
  postRuntimeMessage,
} from '../../lib/messages.js';
import {
  type BinanceOrderHistoryResponse,
  buildOrderHistoryUrl,
  mergeOrderHistoryData,
  summarizeOrderHistoryData,
} from '../../lib/orderHistory.js';

/**
 * 订单历史管理器类
 */
export class OrderHistoryManager {
  private loginErrorDispatched = false;

  constructor(
    private resolveCsrfToken: () => string | null,
    private getAlphaMultiplierMap: () => Promise<Record<string, number>>,
    private lookupAlphaMultiplier: (alphaMap: Record<string, number>, alphaId: string) => number,
  ) {}

  /**
   * 执行订单历史请求
   */
  async performRequest(
    targetUrl: string,
    csrfToken?: string | null,
  ): Promise<FetchOrderHistoryResponse> {
    if (typeof targetUrl !== 'string' || targetUrl.length === 0) {
      return {
        success: false,
        message: 'Invalid order history URL',
      } satisfies FetchOrderHistoryResponse;
    }

    const resolvedToken = csrfToken && csrfToken.length > 0 ? csrfToken : this.resolveCsrfToken();
    if (!resolvedToken) {
      return {
        success: false,
        message: '请先登录币安',
      } satisfies FetchOrderHistoryResponse;
    }

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          clienttype: 'web',
          csrftoken: resolvedToken,
          Accept: 'application/json, text/plain, */*',
        },
      });

      const status = response.status;
      let data: unknown = null;

      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        console.warn(
          '[dddd-alpah-extension] Failed to parse order history response JSON',
          parseError,
        );
      }

      if (!response.ok) {
        return {
          success: false,
          status,
          data,
          message: `Order history request failed with status ${status}`,
        } satisfies FetchOrderHistoryResponse;
      }

      return {
        success: true,
        status,
        data,
      } satisfies FetchOrderHistoryResponse;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error('[dddd-alpah-extension] Order history request error:', messageText);
      return {
        success: false,
        message: messageText,
      } satisfies FetchOrderHistoryResponse;
    }
  }

  /**
   * 获取所有订单历史页面
   */
  async fetchAllPages(csrfToken: string, now = new Date()): Promise<unknown[] | null> {
    const allResponses: unknown[] = [];
    let currentPage = 1;
    const maxPages = 10; // 最多查询10页，防止无限循环

    while (currentPage <= maxPages) {
      const targetUrl = buildOrderHistoryUrl(now, currentPage);
      console.log(`[dddd-alpha-extension] Fetching order history page ${currentPage}`);

      const response = await this.performRequest(targetUrl, csrfToken);

      if (!response.success || !response.data) {
        if (currentPage === 1) {
          // 第一页就失败了，返回null
          return null;
        }
        // 后续页面失败，返回已获取的数据
        break;
      }

      allResponses.push(response.data);

      // 检查是否还有更多数据
      type ResponseData = { data?: unknown[] };
      const data = response.data as ResponseData;
      if (data?.data && Array.isArray(data.data)) {
        const itemCount = data.data.length;
        console.log(`[dddd-alpha-extension] Page ${currentPage} returned ${itemCount} items`);

        if (itemCount < 100) {
          // 返回的数据少于100条，说明已经是最后一页了
          break;
        }
      } else {
        break;
      }

      currentPage++;
    }

    console.log(`[dddd-alpha-extension] Fetched ${allResponses.length} pages of order history`);
    return allResponses;
  }

  /**
   * 刷新订单历史快照
   */
  async refreshSnapshot(): Promise<OrderHistorySnapshotPayload | null> {
    try {
      const csrfToken = this.resolveCsrfToken();
      if (!csrfToken) {
        console.warn(
          '[dddd-alpah-extension] Unable to resolve csrf token for order history refresh',
        );
        if (!this.loginErrorDispatched) {
          await postRuntimeMessage({
            type: 'TASK_ERROR',
            payload: { message: '请先登录币安' },
          });
          this.loginErrorDispatched = true;
        }
        return null;
      }

      const now = new Date();
      const allResponses = await this.fetchAllPages(csrfToken, now);
      this.loginErrorDispatched = false;

      if (!allResponses || allResponses.length === 0) {
        console.warn('[dddd-alpah-extension] No order history data fetched');
        return null;
      }

      // 合并所有页面的数据
      const mergedItems = mergeOrderHistoryData(allResponses as BinanceOrderHistoryResponse[]);
      const mergedResponse = {
        code: '000000',
        message: null,
        data: mergedItems,
      };

      const alphaMap = await this.getAlphaMultiplierMap();
      const summary = summarizeOrderHistoryData(mergedResponse, (alphaId) =>
        this.lookupAlphaMultiplier(alphaMap, alphaId),
      );

      const { points: alphaPoints, nextThresholdDelta } = calculateAlphaPointStats(
        summary.totalBuyVolume,
      );
      const snapshot: OrderHistorySnapshotPayload = {
        date: new Date().toISOString().slice(0, 10),
        totalBuyVolume: summary.totalBuyVolume,
        buyOrderCount: summary.buyOrderCount,
        alphaPoints,
        nextThresholdDelta,
        fetchedAt: Date.now(),
        source: 'automation',
      };

      await postRuntimeMessage({
        type: 'ORDER_HISTORY_SNAPSHOT',
        payload: snapshot,
      });

      return snapshot;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      console.error(
        '[dddd-alpah-extension] Failed to refresh order history snapshot:',
        messageText,
      );
      return null;
    }
  }

  /**
   * 重置登录错误状态
   */
  resetLoginErrorState(): void {
    this.loginErrorDispatched = false;
  }
}
