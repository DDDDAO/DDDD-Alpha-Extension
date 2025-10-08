/**
 * 空投监控模块 - Service Worker
 */

import type {
  AirdropApiResponse,
  AirdropData,
  PricesApiResponse,
  ProcessedAirdrop,
} from '../lib/airdrop.js';
import { AIRDROP_STORAGE_KEY, processAirdropApiResponse } from '../lib/airdrop.js';

// 常量定义
const ALPHA123_ORIGIN = 'https://alpha123.uk';
const ALPHA123_API_URL = `${ALPHA123_ORIGIN}/api/data`;
const ALPHA123_PRICES_URL = `${ALPHA123_ORIGIN}/api/price/`;
const UPDATE_ALARM_NAME = 'airdrop-update';
const UPDATE_INTERVAL_MINUTES = 30; // 30分钟更新一次

let monitorInitialized = false;

const handleAirdropAlarm = (alarm: chrome.alarms.Alarm): void => {
  if (alarm.name === UPDATE_ALARM_NAME) {
    console.log('[AirdropMonitor] ⏰ 定时更新触发');
    void fetchAndSaveAirdropData();
  }
};

/**
 * 获取10秒对齐的时间戳
 * 与 binance helper 保持一致的时间戳处理方式
 */
function getAlignedTimestamp(): number {
  return 1e4 * Math.floor(Date.now() / 1e4);
}

/**
 * 初始化空投监控服务
 */
export function initAirdropMonitor(): void {
  if (monitorInitialized) {
    console.log('[AirdropMonitor] ⚙️ 已初始化，跳过重复注册');
    return;
  }

  monitorInitialized = true;
  console.log('[AirdropMonitor] 🚀 初始化空投监控服务');

  // 创建定时更新任务
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    periodInMinutes: UPDATE_INTERVAL_MINUTES,
    delayInMinutes: 0.1, // 6秒后首次执行
  });

  console.log(`[AirdropMonitor] ⏰ 定时任务已创建: 每${UPDATE_INTERVAL_MINUTES}分钟更新一次`);

  // 监听定时任务
  if (!chrome.alarms.onAlarm.hasListener(handleAirdropAlarm)) {
    chrome.alarms.onAlarm.addListener(handleAirdropAlarm);
  }

  // 初始化时立即获取一次数据
  console.log('[AirdropMonitor] 🔄 立即执行首次数据获取...');
  void fetchAndSaveAirdropData();
}

/**
 * 保存空投数据到存储
 */
async function saveAirdropData(data: AirdropData): Promise<void> {
  try {
    await chrome.storage.local.set({
      [AIRDROP_STORAGE_KEY]: data,
    });
    console.log('[AirdropMonitor] 数据已保存到存储');
  } catch (error) {
    console.error('[AirdropMonitor] 保存数据失败:', error);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    mode: 'cors',
    credentials: 'omit',
    referrer: `${ALPHA123_ORIGIN}/`,
    referrerPolicy: 'strict-origin-when-cross-origin',
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
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
 * 【复刻】获取并保存空投数据 - 完全按照 binance helper 的逻辑：直接GET请求
 */
async function fetchAndSaveAirdropData(): Promise<void> {
  try {
    console.log('[AirdropMonitor] 📡 开始更新空投数据...');

    // 1. 【复刻】直接GET请求获取空投原始数据
    const timestamp = getAlignedTimestamp();
    const airdropUrl = `${ALPHA123_API_URL}?t=${timestamp}&fresh=1`;
    console.log(`[AirdropMonitor] 🌐 发起GET请求: ${airdropUrl}`);

    const rawData = await fetchJson<AirdropApiResponse>(airdropUrl);
    console.log('[AirdropMonitor] 📦 JSON解析完成');

    if (!rawData?.airdrops || rawData.airdrops.length === 0) {
      throw new Error('No airdrop data found');
    }

    console.log('[AirdropMonitor] 获取到空投数据:', rawData.airdrops.length, '个');

    // 2. 获取语言设置
    const storageResult = await chrome.storage.local.get('dddd-alpha-language');
    const locale = (storageResult['dddd-alpha-language'] as string | undefined) || 'zh-CN';
    console.log('[AirdropMonitor] 使用语言:', locale);

    // 3. 使用 processAirdropApiResponse 处理数据（包含过期判断、时间转换等完整逻辑）
    const processedData = processAirdropApiResponse(rawData, locale);

    console.log('[AirdropMonitor] 今日空投:', processedData.today.length, '个');
    console.log('[AirdropMonitor] 未来空投:', processedData.forecast.length, '个');

    // 4. 【复刻】直接GET请求获取价格数据
    const priceTimestamp = getAlignedTimestamp();
    const priceUrl = `${ALPHA123_PRICES_URL}?batch=all&t=${priceTimestamp}`;
    console.log(`[AirdropMonitor] 🌐 发起价格请求: ${priceUrl}`);

    const priceData = await fetchJson<PricesApiResponse>(priceUrl);

    console.log(
      '[AirdropMonitor] 价格数据:',
      priceData?.success ? Object.keys(priceData.prices ?? {}).length : 0,
      '个币种',
    );

    // 5. 【复刻】添加价格信息 - 完全按照原代码逻辑
    const addPriceInfo = (airdrop: ProcessedAirdrop) => {
      if (priceData?.success && priceData.prices?.[airdrop.symbol]) {
        const priceInfo = priceData.prices[airdrop.symbol];
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
    };

    processedData.today.forEach(addPriceInfo);
    processedData.forecast.forEach(addPriceInfo);

    // 6. 保存数据
    const finalData: AirdropData = {
      today: processedData.today,
      forecast: processedData.forecast,
      prices: priceData?.success ? priceData.prices : undefined,
      timestamp: Date.now(),
    };

    await saveAirdropData(finalData);

    console.log(
      `[AirdropMonitor] ✓ 数据更新成功: 今日 ${finalData.today.length} 个，预告 ${finalData.forecast.length} 个`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    if (message.includes('403')) {
      console.warn('[AirdropMonitor] ⚠️ 请求被拒绝 (403)，将稍后重试');
    } else {
      console.error('[AirdropMonitor] ❌ 更新失败:', error);
      if (error instanceof Error) {
        console.error('[AirdropMonitor] 错误详情:', message);
      }
    }
    // 保存空数据避免前端错误
    await saveAirdropData({
      today: [],
      forecast: [],
      timestamp: Date.now(),
    });
  }
}

/**
 * 监听来自 popup 的消息
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // 立即更新数据
  if (request.type === 'UPDATE_AIRDROP_NOW') {
    console.log('[AirdropMonitor] 收到立即更新请求');
    fetchAndSaveAirdropData()
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('[AirdropMonitor] 更新失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道打开
  }

  // 获取缓存数据
  if (request.type === 'GET_AIRDROP_DATA') {
    console.log('[AirdropMonitor] 收到获取数据请求');
    chrome.storage.local.get(AIRDROP_STORAGE_KEY, (result) => {
      const data = result[AIRDROP_STORAGE_KEY];
      if (data?.timestamp) {
        const age = Date.now() - data.timestamp;
        console.log(`[AirdropMonitor] 返回缓存数据，数据年龄: ${Math.round(age / 1000)}秒`);
        sendResponse({ success: true, data });
      } else {
        console.log('[AirdropMonitor] 无缓存数据，触发更新');
        // 触发更新
        fetchAndSaveAirdropData();
        sendResponse({ success: false, message: '正在获取数据...' });
      }
    });
    return true; // 保持消息通道打开
  }

  return false;
});
