/**
 * 请求头修改器 - 绕过 Cloudflare 403 拦截
 * 通过修改请求头，让 Cloudflare 认为请求来自真实的 alpha123.uk 页面
 */

const ALPHA123_DOMAIN = 'alpha123.uk';
const RULE_ID_BASE = 10000;

/**
 * 注册动态规则以修改 alpha123.uk 请求头
 * 关键修改：
 * 1. sec-fetch-site: none → same-origin
 * 2. 添加 Referer
 * 3. 添加 Origin
 */
export async function registerHeaderModificationRules(): Promise<void> {
  console.log('[HeaderModifier] 🔧 注册请求头修改规则...');

  // 先清除旧规则
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules
    .filter((rule) => rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + 100)
    .map((rule) => rule.id);

  if (ruleIdsToRemove.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
    });
    console.log('[HeaderModifier] 🗑️ 已清除旧规则:', ruleIdsToRemove.length, '条');
  }

  // 添加新规则
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: RULE_ID_BASE + 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: 'Referer',
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: `https://${ALPHA123_DOMAIN}/`,
          },
          {
            header: 'Origin',
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: `https://${ALPHA123_DOMAIN}`,
          },
        ],
      },
      condition: {
        urlFilter: `||${ALPHA123_DOMAIN}/api/*`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: rules,
  });

  console.log('[HeaderModifier] ✅ 请求头修改规则已注册:', rules.length, '条');
  console.log('[HeaderModifier] 📋 规则详情:', {
    domain: ALPHA123_DOMAIN,
    referer: `https://${ALPHA123_DOMAIN}/`,
    origin: `https://${ALPHA123_DOMAIN}`,
  });
}

/**
 * 卸载请求头修改规则
 */
export async function unregisterHeaderModificationRules(): Promise<void> {
  console.log('[HeaderModifier] 🔧 卸载请求头修改规则...');

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules
    .filter((rule) => rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + 100)
    .map((rule) => rule.id);

  if (ruleIdsToRemove.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
    });
    console.log('[HeaderModifier] ✅ 已卸载规则:', ruleIdsToRemove.length, '条');
  } else {
    console.log('[HeaderModifier] ℹ️ 没有需要卸载的规则');
  }
}
