/**
 * 请求头修改服务
 * 负责管理请求头修改规则,绕过 Cloudflare 403 拦截
 * 遵循单一职责原则 (SRP): 专注于请求头修改规则的注册和卸载
 */

const ALPHA123_DOMAIN = 'alpha123.uk';
const RULE_ID_BASE = 10000;

/**
 * 请求头修改服务类
 */
export class HeaderModifierService {
  /**
   * 注册动态规则以修改 alpha123.uk 请求头
   * 关键修改：
   * 1. sec-fetch-site: none → same-origin
   * 2. 添加 Referer
   * 3. 添加 Origin
   */
  async registerRules(): Promise<void> {
    try {
      console.log('[HeaderModifierService] 🔧 注册请求头修改规则...');

      // 获取现有规则以便清理
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const ruleIdsToRemove = existingRules
        .filter((rule) => rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + 100)
        .map((rule) => rule.id);

      // 新规则
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

      // 在同一个调用中移除旧规则并添加新规则，避免ID冲突
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsToRemove.length > 0 ? ruleIdsToRemove : undefined,
        addRules: rules,
      });

      console.log('[HeaderModifierService] ✅ 请求头修改规则已注册:', rules.length, '条');
      if (ruleIdsToRemove.length > 0) {
        console.log('[HeaderModifierService] 🗑️ 已清除旧规则:', ruleIdsToRemove.length, '条');
      }
      console.log('[HeaderModifierService] 📋 规则详情:');
      console.log('  - domain:', ALPHA123_DOMAIN);
      console.log('  - referer:', `https://${ALPHA123_DOMAIN}/`);
      console.log('  - origin:', `https://${ALPHA123_DOMAIN}`);
    } catch (error) {
      console.error('[HeaderModifierService] ❌ 注册规则失败:', error);
      // 不抛出错误,避免阻止扩展启动
    }
  }

  /**
   * 卸载请求头修改规则
   */
  async unregisterRules(): Promise<void> {
    try {
      console.log('[HeaderModifierService] 🔧 卸载请求头修改规则...');

      await this.clearExistingRules();

      console.log('[HeaderModifierService] ✅ 请求头修改规则已卸载');
    } catch (error) {
      console.error('[HeaderModifierService] ❌ 卸载规则失败:', error);
    }
  }

  /**
   * 清除现有规则
   * 私有方法,用于注册和卸载时清理旧规则
   */
  private async clearExistingRules(): Promise<void> {
    try {
      const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
      const ruleIdsToRemove = existingRules
        .filter((rule) => rule.id >= RULE_ID_BASE && rule.id < RULE_ID_BASE + 100)
        .map((rule) => rule.id);

      if (ruleIdsToRemove.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: ruleIdsToRemove,
        });
        console.log('[HeaderModifierService] 🗑️ 已清除旧规则:', ruleIdsToRemove.length, '条');
      } else {
        console.log('[HeaderModifierService] ℹ️ 没有需要清除的规则');
      }
    } catch (error) {
      console.error('[HeaderModifierService] ❌ 清除规则失败:', error);
      throw error;
    }
  }
}
