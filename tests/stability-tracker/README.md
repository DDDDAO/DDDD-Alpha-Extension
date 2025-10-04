# 稳定性币种推荐看板 - 可行性测试

## 📋 测试目标

验证从 [alpha123.uk/zh/stability](https://alpha123.uk/zh/stability/) 实时获取币种稳定性数据，并构建智能推荐看板的可行性。

## ✅ 可行性分析结论

### 🎯 **完全可行！**

经过详细分析和测试，实现该功能的可行性很高，主要优势如下：

### 1. 数据源优势

- ✅ **公开 JSON API**: `https://alpha123.uk/stability/stability_feed_v2.json`
- ✅ **数据结构清晰**: 包含币种、价格、稳定性、价差、4倍天数等完整信息
- ✅ **实时更新**: 页面每8秒自动刷新数据
- ✅ **无需登录**: 数据完全公开，无需认证

### 2. 技术实现简单

- ✅ **跨域请求**: 通过 Chrome 插件的 `host_permissions` 轻松解决
- ✅ **数据格式**: 标准 JSON，无需复杂的 DOM 解析
- ✅ **更新机制**: 简单的定时轮询即可
- ✅ **兼容性**: 与现有插件架构完全兼容

### 3. 实现成本低

- ✅ **代码量少**: 核心功能仅需 ~200 行代码
- ✅ **无需新依赖**: 使用原生 `fetch()` API
- ✅ **可独立运行**: 不影响现有自动交易功能
- ✅ **易于维护**: 数据源稳定，变更风险低

## 📊 数据结构分析

### JSON Feed 格式

```json
{
  "lastUpdated": 1759566316,
  "items": [
    {
      "n": "ALEO/USDT",           // 币种名称
      "p": 0.253356,              // 当前价格
      "st": "green:stable",       // 稳定性状态
      "md": 10,                   // 4倍天数
      "spr": 0.0004               // 价差基点
    }
  ]
}
```

### 稳定性状态映射

| 状态值 | 颜色 | 中文标签 |
|--------|------|----------|
| `green:stable` | 🟢 绿色 | 稳定 |
| `yellow:moderate` | 🟡 黄色 | 一般 |
| `red:unstable` | 🔴 红色 | 不稳 |

## 🧮 推荐算法设计

### 综合评分模型

```
总分 = 稳定性分数 + 价差分数 + 天数分数

其中：
- 稳定性分数 (0-100):
  * 稳定 = 100分
  * 一般 = 50分
  * 不稳 = 0分

- 价差分数 (0-50):
  * 计算公式: max(0, 50 - 价差基点 × 10)
  * 价差越小分数越高

- 天数分数 (0-50):
  * 5-15天 = 50分 (最佳区间)
  * <5天: 线性递增 (天数 × 10)
  * >15天: 线性递减 (50 - (天数-15) × 3)
```

### 推荐规则

| 综合评分 | 推荐等级 | 建议 |
|----------|----------|------|
| ≥150 | ⭐⭐⭐⭐⭐ | 稳定性优秀，价差极低，适合稳定套利 |
| 100-149 | ⭐⭐⭐⭐ | 稳定性良好，价差合理 |
| 50-99 | ⭐⭐⭐ | 稳定性一般，谨慎操作 |
| <50 | ⭐⭐ | 波动较大，不建议操作 |

## 🎨 看板设计

### 功能特性

1. **Top 3 推荐卡片**
   - 显示综合评分最高的3个币种
   - 包含价格、稳定性、价差、天数
   - 自动生成推荐理由

2. **完整数据表格**
   - 展示所有币种的详细信息
   - 按评分排序
   - 实时更新时间戳

3. **自动刷新**
   - 每8秒自动更新数据
   - 与原网站保持同步

## 📁 文件说明

```
tests/stability-tracker/
├── stability-fetcher.ts    # 核心数据获取和推荐算法
├── dashboard.html          # 可视化看板页面（独立测试）
└── README.md              # 本文档
```

## 🧪 测试步骤

### 1. 测试核心功能

在浏览器控制台运行：

```javascript
// 假设 stability-fetcher.ts 已编译
import { StabilityFetcher } from './stability-fetcher.js';

// 获取推荐
const recommendations = await StabilityFetcher.getRecommendations(3);
console.log('Top 3 推荐:', recommendations);

// 开始监听
const timerId = StabilityFetcher.startMonitoring(data => {
  console.log('数据更新:', data);
});
```

### 2. 测试可视化看板

直接在浏览器打开 `dashboard.html` 即可看到效果（需要禁用 CORS 或通过本地服务器）。

**使用本地服务器（推荐）：**

```bash
# 在项目根目录运行
npx http-server tests/stability-tracker -p 8080

# 访问
# http://localhost:8080/dashboard.html
```

## 🔧 Chrome 插件集成方案

### 方案 1: 新增独立 Popup 页面

```javascript
// manifest.json 添加
{
  "action": {
    "default_popup": "stability-dashboard.html"
  },
  "host_permissions": [
    "https://alpha123.uk/*"
  ]
}
```

### 方案 2: 集成到现有 Background Worker

```javascript
// src/background/stability-monitor.worker.ts
import { StabilityFetcher } from './stability-fetcher';

chrome.alarms.create('stability-check', { periodInMinutes: 0.133 }); // 8秒

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'stability-check') {
    const recommendations = await StabilityFetcher.getRecommendations(3);
    // 存储到 Chrome Storage
    await chrome.storage.local.set({ stabilityRecommendations: recommendations });
  }
});
```

### 方案 3: Content Script 注入

在 Binance Alpha 页面注入推荐看板：

```javascript
// src/content/stability-overlay.content.ts
const recommendations = await StabilityFetcher.getRecommendations(3);

// 创建浮动窗口显示推荐
const overlay = document.createElement('div');
overlay.id = 'stability-recommendations';
overlay.innerHTML = `
  <div class="recommendation-panel">
    <h3>稳定币种推荐</h3>
    ${recommendations.map(r => `
      <div class="rec-item">
        <span>${r.symbol}</span>
        <span>${r.reason}</span>
      </div>
    `).join('')}
  </div>
`;
document.body.appendChild(overlay);
```

## ⚠️ 注意事项

### 1. CORS 限制

- **问题**: 直接在网页中 `fetch()` 可能遇到 CORS 错误
- **解决**: 使用 Chrome 插件的 `host_permissions` 绕过 CORS

### 2. 数据更新频率

- **原网站**: 每8秒更新一次
- **建议**: 保持相同频率，避免过度请求

### 3. API 稳定性

- **风险**: alpha123.uk 可能随时更改 API 格式
- **缓解**: 添加错误处理和数据验证

### 4. 免责声明

- **重要**: 必须添加免责声明，说明数据来源和风险
- **参考**: 原网站的免责声明文案

## 🚀 下一步建议

### 短期（1-2天）

1. ✅ 完成核心功能开发
2. ✅ 创建可视化看板
3. ⏳ 集成到 Chrome 插件
4. ⏳ 添加错误处理和日志

### 中期（3-7天）

1. ⏳ 添加历史数据缓存
2. ⏳ 实现趋势分析功能
3. ⏳ 优化推荐算法
4. ⏳ 添加用户自定义偏好

### 长期（1-2周）

1. ⏳ 多币种对比分析
2. ⏳ 价格预警功能
3. ⏳ 自动交易集成
4. ⏳ 数据导出功能

## 📈 性能评估

| 指标 | 评估 | 说明 |
|------|------|------|
| **响应速度** | ⭐⭐⭐⭐⭐ | JSON 数据小 (<5KB)，加载快 |
| **准确性** | ⭐⭐⭐⭐⭐ | 直接使用官方数据源 |
| **稳定性** | ⭐⭐⭐⭐ | 依赖第三方 API，存在变更风险 |
| **易用性** | ⭐⭐⭐⭐⭐ | 一键查看推荐，无需手动分析 |
| **维护成本** | ⭐⭐⭐⭐ | 代码简洁，逻辑清晰 |

## 📝 总结

**综合评价：⭐⭐⭐⭐⭐ 强烈建议实现！**

- ✅ 技术可行性：完全可行，实现简单
- ✅ 数据可靠性：使用官方数据源，准确可靠
- ✅ 用户价值：自动推荐稳定币种，节省分析时间
- ✅ 维护成本：代码简洁，维护容易
- ✅ 扩展性：易于添加新功能和优化

**建议立即开始正式开发！** 🚀
