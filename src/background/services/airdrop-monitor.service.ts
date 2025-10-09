/**
 * 空投监控服务
 * 负责定期获取空投数据并保存到存储
 * 遵循单一职责原则 (SRP): 专注于空投数据的获取、处理和存储
 */

import type {
  AirdropApiResponse,
  AirdropData,
  PricesApiResponse,
  ProcessedAirdrop,
} from '../../lib/api/airdrop.js';
import { AIRDROP_STORAGE_KEY, processAirdropApiResponse } from '../../lib/api/airdrop.js';

// 常量定义
const ALPHA123_ORIGIN = 'https://alpha123.uk';
const ALPHA123_API_URL = `${ALPHA123_ORIGIN}/api/data`;
const ALPHA123_PRICES_URL = `${ALPHA123_ORIGIN}/api/price/`;
const UPDATE_ALARM_NAME = 'airdrop-update';
const UPDATE_INTERVAL_MINUTES = 30; // 30分钟更新一次

/**
 * 空投监控服务类
 */
export class AirdropMonitorService {
  /**
   * 启动监控服务
   * 创建定时任务并立即执行首次数据获取
   */
  startMonitoring(): void {
    console.log('[AirdropMonitorService] 🚀 启动空投监控服务');

    // 创建定时更新任务
    chrome.alarms.create(UPDATE_ALARM_NAME, {
      periodInMinutes: UPDATE_INTERVAL_MINUTES,
      delayInMinutes: 0.1, // 6秒后首次执行
    });

    console.log(
      `[AirdropMonitorService] ⏰ 定时任务已创建: 每${UPDATE_INTERVAL_MINUTES}分钟更新一次`,
    );

    // 初始化时立即获取一次数据
    console.log('[AirdropMonitorService] 🔄 立即执行首次数据获取...');
    void this.fetchAndUpdateAirdrops();
  }

  /**
   * 停止监控服务
   * 清除定时任务
   */
  async stopMonitoring(): Promise<void> {
    console.log('[AirdropMonitorService] 🛑 停止空投监控服务');
    await new Promise<void>((resolve) => {
      chrome.alarms.clear(UPDATE_ALARM_NAME, () => resolve());
    });
    console.log('[AirdropMonitorService] ✅ 定时任务已清除');
  }

  /**
   * 获取并更新空投数据
   * 从 API 获取最新空投数据,处理后保存到存储
   */
  async fetchAndUpdateAirdrops(): Promise<void> {
    try {
      console.log('[AirdropMonitorService] 📡 开始更新空投数据...');

      // 1. 获取空投原始数据
      const timestamp = this.getAlignedTimestamp();
      const airdropUrl = `${ALPHA123_API_URL}?t=${timestamp}&fresh=1`;
      console.log(`[AirdropMonitorService] 🌐 发起GET请求: ${airdropUrl}`);

      let rawData: AirdropApiResponse;
      try {
        rawData = await this.fetchJson<AirdropApiResponse>(airdropUrl);
        console.log('[AirdropMonitorService] 📦 JSON解析完成');
      } catch (fetchError) {
        // 如果是403错误，可能是请求头规则还未生效，使用空数据
        if (fetchError instanceof Error && fetchError.message.includes('403')) {
          console.warn(
            '[AirdropMonitorService] ⚠️ 无法获取空投数据(403)，可能是请求头规则未生效，将使用空数据',
          );
          await this.saveAirdropData({
            today: [],
            forecast: [],
            timestamp: Date.now(),
          });
          return;
        }
        throw fetchError;
      }

      if (!rawData?.airdrops || rawData.airdrops.length === 0) {
        throw new Error('No airdrop data found');
      }

      console.log('[AirdropMonitorService] 获取到空投数据:', rawData.airdrops.length, '个');

      // 2. 获取语言设置
      const storageResult = await chrome.storage.local.get('dddd-alpha-language');
      const locale = (storageResult['dddd-alpha-language'] as string | undefined) || 'zh-CN';
      console.log('[AirdropMonitorService] 使用语言:', locale);

      // 3. 处理空投数据（包含过期判断、时间转换等）
      const processedData = processAirdropApiResponse(rawData, locale);

      console.log('[AirdropMonitorService] 今日空投:', processedData.today.length, '个');
      console.log('[AirdropMonitorService] 未来空投:', processedData.forecast.length, '个');

      // 4. 获取价格数据
      const priceTimestamp = this.getAlignedTimestamp();
      const priceUrl = `${ALPHA123_PRICES_URL}?batch=all&t=${priceTimestamp}`;
      console.log(`[AirdropMonitorService] 🌐 发起价格请求: ${priceUrl}`);

      const priceData = await this.fetchJson<PricesApiResponse>(priceUrl);

      console.log(
        '[AirdropMonitorService] 价格数据:',
        priceData?.success ? Object.keys(priceData.prices ?? {}).length : 0,
        '个币种',
      );

      // 5. 添加价格信息
      this.addPriceInfoToAirdrops(processedData.today, priceData);
      this.addPriceInfoToAirdrops(processedData.forecast, priceData);

      // 6. 保存数据
      const finalData: AirdropData = {
        today: processedData.today,
        forecast: processedData.forecast,
        prices: priceData?.success ? priceData.prices : undefined,
        timestamp: Date.now(),
      };

      await this.saveAirdropData(finalData);

      console.log(
        `[AirdropMonitorService] ✓ 数据更新成功: 今日 ${finalData.today.length} 个，预告 ${finalData.forecast.length} 个`,
      );
    } catch (error) {
      console.error('[AirdropMonitorService] ❌ 更新失败:', error);
      if (error instanceof Error) {
        console.error('[AirdropMonitorService] 错误详情:', error.message);
      }
      // 保存空数据避免前端错误
      await this.saveAirdropData({
        today: [],
        forecast: [],
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 获取10秒对齐的时间戳
   * 与 binance helper 保持一致的时间戳处理方式
   */
  private getAlignedTimestamp(): number {
    return 1e4 * Math.floor(Date.now() / 1e4);
  }

  /**
   * 通用 JSON 请求方法
   * 包含错误处理和类型检查
   */
  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type');
    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Request failed (${response.status} ${response.statusText}) - sample: ${bodyText.slice(0, 120)}`,
      );
    }

    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      throw new Error(
        `Expected JSON but received ${contentType ?? 'unknown'} - sample: ${bodyText.slice(0, 120)}`,
      );
    }

    try {
      return JSON.parse(bodyText) as T;
    } catch (error) {
      throw new Error(
        `Failed to parse JSON: ${(error as Error).message} - sample: ${bodyText.slice(0, 120)}`,
      );
    }
  }

  /**
   * 为空投数据添加价格信息
   */
  private addPriceInfoToAirdrops(
    airdrops: ProcessedAirdrop[],
    priceData?: PricesApiResponse,
  ): void {
    if (!priceData?.success || !priceData.prices) {
      return;
    }

    for (const airdrop of airdrops) {
      const priceInfo = priceData.prices[airdrop.symbol];
      if (!priceInfo) continue;

      // 优先使用 dex_price
      const price = Number(priceInfo.dex_price) > 0 ? priceInfo.dex_price : priceInfo.cex_price;

      if (price && Number(price) > 0 && airdrop.quantity && airdrop.quantity !== '-') {
        const quantity = Number(airdrop.quantity);
        if (!Number.isNaN(quantity) && quantity > 0) {
          airdrop.price = price;
          const value = Number(price) * quantity;
          // 保留3个有效数字
          const formattedValue = Number.parseFloat(value.toPrecision(3));
          airdrop.estimatedValue = `$${formattedValue}`;
        }
      }
    }
  }

  /**
   * 保存空投数据到存储
   */
  private async saveAirdropData(data: AirdropData): Promise<void> {
    try {
      await chrome.storage.local.set({
        [AIRDROP_STORAGE_KEY]: data,
      });
      console.log('[AirdropMonitorService] 数据已保存到存储');
    } catch (error) {
      console.error('[AirdropMonitorService] 保存数据失败:', error);
    }
  }
}
