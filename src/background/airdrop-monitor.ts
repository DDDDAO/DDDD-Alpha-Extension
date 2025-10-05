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
const ALPHA123_REFERER = `${ALPHA123_ORIGIN}/`;
const ALPHA123_API_URL = `${ALPHA123_ORIGIN}/api/data`;
const ALPHA123_PRICES_URL = `${ALPHA123_ORIGIN}/api/price/`;
const UPDATE_ALARM_NAME = 'airdrop-update';
const UPDATE_INTERVAL_MINUTES = 30; // 30分钟更新一次
const AIRDROP_HEADER_RULE_ID = 1001;

/**
 * 获取10秒对齐的时间戳
 * 与 binance helper 保持一致的时间戳处理方式
 */
function getAlignedTimestamp(): number {
  return 1e4 * Math.floor(Date.now() / 1e4);
}

async function ensureAlpha123RequestHeaders(): Promise<void> {
  const dnr = chrome.declarativeNetRequest;

  if (!dnr?.updateDynamicRules) {
    return;
  }

  try {
    // 为空投数据和价格API配置请求头
    const rules = [
      {
        id: AIRDROP_HEADER_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            {
              header: 'referer',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: ALPHA123_REFERER,
            },
            {
              header: 'origin',
              operation: chrome.declarativeNetRequest.HeaderOperation.SET,
              value: ALPHA123_ORIGIN,
            },
          ],
        },
        condition: {
          urlFilter: `${ALPHA123_ORIGIN}/api/*`,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
        },
      },
    ];

    await dnr.updateDynamicRules({
      removeRuleIds: [AIRDROP_HEADER_RULE_ID],
      addRules: rules,
    });

    console.log('[AirdropMonitor] 已注册 Alpha123 请求头规则');
  } catch (error) {
    console.warn('[AirdropMonitor] 注册 Alpha123 请求头规则失败:', error);
  }
}

/**
 * 初始化空投监控服务
 */
export function initAirdropMonitor(): void {
  console.log('[AirdropMonitor] 初始化空投监控服务');

  void ensureAlpha123RequestHeaders();

  // 创建定时更新任务
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    periodInMinutes: UPDATE_INTERVAL_MINUTES,
    delayInMinutes: 0.1, // 6秒后首次执行
  });

  // 监听定时任务
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_ALARM_NAME) {
      console.log('[AirdropMonitor] 定时更新触发');
      fetchAndSaveAirdropData();
    }
  });

  // 初始化时获取一次数据
  fetchAndSaveAirdropData();
}

/**
 * 获取价格数据
 */
async function fetchPricesData(): Promise<PricesApiResponse | null> {
  try {
    const timestamp = getAlignedTimestamp();
    await ensureAlpha123RequestHeaders();

    const url = `${ALPHA123_PRICES_URL}?batch=all&t=${timestamp}`;

    console.log('[AirdropMonitor] 获取价格数据:', url);

    const response = await fetch(url, {
      referrer: ALPHA123_REFERER,
      referrerPolicy: 'strict-origin-when-cross-origin',
      credentials: 'include',
      mode: 'cors',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      console.error(`[AirdropMonitor] 价格API HTTP错误! status: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log('[AirdropMonitor] 价格数据获取成功');
    return data;
  } catch (error) {
    console.error('[AirdropMonitor] 获取价格数据失败:', error);
    return null;
  }
}

/**
 * 获取空投数据
 */
async function fetchAirdropData(): Promise<AirdropApiResponse | null> {
  try {
    // 使用10秒对齐的时间戳，与 binance helper 保持一致
    const timestamp = getAlignedTimestamp();
    const url = `${ALPHA123_API_URL}?t=${timestamp}&fresh=1`;

    console.log('[AirdropMonitor] 开始获取数据:', url);

    // 使用最简单的请求配置，让浏览器自动处理
    await ensureAlpha123RequestHeaders();

    const response = await fetch(url, {
      referrer: ALPHA123_REFERER,
      referrerPolicy: 'strict-origin-when-cross-origin',
      credentials: 'include',
      mode: 'cors',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });

    if (!response.ok) {
      console.error(`[AirdropMonitor] HTTP 错误! status: ${response.status}`);
      // 如果是 403，可能需要特殊处理
      if (response.status === 403) {
        console.log('[AirdropMonitor] 403 错误，可能是 CORS 或权限问题');
        void ensureAlpha123RequestHeaders();
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[AirdropMonitor] 数据获取成功，空投数量:', data?.airdrops?.length || 0);

    return data;
  } catch (error) {
    console.error('[AirdropMonitor] 获取数据失败:', error);
    return null;
  }
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

/**
 * 获取并保存空投数据
 */
async function fetchAndSaveAirdropData(): Promise<void> {
  try {
    console.log('[AirdropMonitor] 开始更新空投数据...');

    // 并行获取空投数据和价格数据
    const [apiData, pricesData] = await Promise.all([fetchAirdropData(), fetchPricesData()]);

    const processedData = processAirdropApiResponse(apiData);

    // 如果有价格数据，添加到处理后的数据中
    if (pricesData?.success && pricesData.prices) {
      processedData.prices = pricesData.prices;

      // 为每个空投计算估算价值
      const calculateValue = (airdrop: ProcessedAirdrop) => {
        if (pricesData.prices[airdrop.symbol]) {
          const priceInfo = pricesData.prices[airdrop.symbol];
          const price = priceInfo.dex_price || priceInfo.cex_price;

          if (price && airdrop.quantity && airdrop.quantity !== '-') {
            const quantity = parseFloat(airdrop.quantity.replace(/,/g, ''));
            if (!Number.isNaN(quantity) && quantity > 0) {
              airdrop.price = price;
              const value = price * quantity;
              airdrop.estimatedValue = `$${value.toFixed(2)}`;
            }
          }
        }
      };

      // 计算今日空投的价值
      processedData.today.forEach(calculateValue);
      // 计算预告空投的价值
      processedData.forecast.forEach(calculateValue);
    }

    await saveAirdropData(processedData);

    console.log(
      `[AirdropMonitor] 数据处理完成: 今日 ${processedData.today.length} 个，预告 ${processedData.forecast.length} 个`,
    );

    if (apiData?.airdrops) {
      console.log('[AirdropMonitor] 空投数据更新成功');
    } else {
      console.log('[AirdropMonitor] API 返回空数据或解析失败');
    }
  } catch (error) {
    console.error('[AirdropMonitor] 更新失败:', error);
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
