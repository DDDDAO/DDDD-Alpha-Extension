/**
 * 【完整复刻binance helper】
 * Alpha123.uk页面环境中的数据获取器
 * 运行在真实的alpha123.uk页面上下文中，完全模仿binance helper的执行环境
 */

console.log('[Alpha123Fetcher] 🚀 已注入到alpha123.uk页面');
console.log('[Alpha123Fetcher] URL:', window.location.href);

// 【关键】监听来自Popup的chrome.runtime消息（不是postMessage）
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('[Alpha123Fetcher] 📨 收到chrome消息:', request);

  if (request.type !== 'FETCH_AIRDROP_DATA') {
    return false;
  }

  console.log('[Alpha123Fetcher] ✅ 开始在页面环境中fetch...');

  // 【关键】异步处理，保持消息通道打开
  void (async () => {
    try {
      const { airdropUrl, priceUrl } = request;

      // 【完全复刻binance helper】在alpha123.uk页面上下文中直接fetch
      // 此时的fetch请求：
      // - Origin: https://alpha123.uk
      // - Referer: https://alpha123.uk/...
      // - Cookie: 完整的alpha123.uk cookie
      // 与binance helper完全相同！

      console.log('[Alpha123Fetcher] 🌐 GET:', airdropUrl);
      const airdropResponse = await fetch(airdropUrl);
      console.log(
        '[Alpha123Fetcher] ✅ 空投响应:',
        airdropResponse.status,
        airdropResponse.statusText,
      );

      if (!airdropResponse.ok) {
        throw new Error(`HTTP ${airdropResponse.status}: ${airdropResponse.statusText}`);
      }

      const airdropData = await airdropResponse.json();
      console.log('[Alpha123Fetcher] 📦 空投数据:', airdropData.airdrops?.length || 0, '个');

      console.log('[Alpha123Fetcher] 🌐 GET:', priceUrl);
      const priceResponse = await fetch(priceUrl);
      console.log('[Alpha123Fetcher] ✅ 价格响应:', priceResponse.status);

      const priceData = await priceResponse.json();
      console.log(
        '[Alpha123Fetcher] 💰 价格数据:',
        priceData?.success ? Object.keys(priceData.prices).length : 0,
        '个',
      );

      // 返回数据给Popup
      sendResponse({
        success: true,
        airdropData,
        priceData,
      });

      console.log('[Alpha123Fetcher] ✅ 数据已返回给Popup');
    } catch (error) {
      console.error('[Alpha123Fetcher] ❌ 获取失败:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true; // 保持消息通道打开
});
