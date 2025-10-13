# DDDD Alpha 刷分助手

一个智能化的币安 Alpha 刷分助手，集成稳定代币推荐、自动交易、今日 Alpha 积分与磨损统计以及空投预告等功能。由 DDDDAO 量化社区开发，欢迎进群一起讨论刷分技巧：https://t.me/ddddao2025

插件完全开源免费，仅为学习交流目的，请使用者自行明确是否会因使用插件违反币安Alpha活动规则。

📖 **[币安 TGE 参与教程](./TGE_QUICKSTART.md)** - 了解如何参与币安 TGE 活动，获取空投奖励

由 DDDDAO 社区开发 | [Telegram 群组](https://t.me/ddddao2025) | [English Version](#english)

## 🎯 这是什么？

这是一个 Chrome 浏览器插件，帮助你在币安 Alpha 活动中**自动买卖代币获取积分**，无需手动操作，插件会自动完成所有交易流程。

### 主要功能
- ✅ **自动交易**：每隔几秒自动买入和卖出，获取 Alpha 积分
- ✅ **智能推荐**：实时推荐最稳定、磨损最低的代币
- ✅ **积分追踪**：实时显示你的积分和交易进度
- ✅ **风险控制**：自动监控订单，出现异常立即停止
- ✅ **历史记录**：查看每日交易历史和磨损统计日历
- ✅ **空投提醒**：显示今日和即将到来的空投活动

## 📦 快速安装（1分钟搞定）

### 方法一：Chrome 应用商店安装（推荐）

1. **直接安装**
   - 点击访问 [Chrome 应用商店](https://chromewebstore.google.com/detail/dddd-alpha-extension/bpkpgegpbcbeflbgicjhdflhfmikgjpc)
   - 点击「添加至 Chrome」按钮
   - 完成！插件图标会出现在浏览器右上角

### 方法二：下载压缩包安装

1. **下载插件包**
   - 点击 [这里下载插件](https://github.com/DDDDAO/dddd-alpha-extension/releases/download/nightly/dddd-alpha-extension.zip)
   - 把下载的 zip 文件解压到电脑上任意文件夹

2. **安装到浏览器**
   - 打开 Chrome 浏览器
   - 在地址栏输入 `chrome://extensions` 并回车
   - 打开右上角的「开发者模式」开关
   - 点击「加载已解压的扩展程序」
   - 选择刚才解压的文件夹
   - 完成！插件图标会出现在浏览器右上角

### 方法三：从源码安装（适合进阶用户）

```bash
# 下载代码
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension

# 安装并构建
npm install
npm run build

# 然后在 Chrome 扩展管理页面加载 extension 文件夹
```

## 🚀 使用教程（超简单）

### 准备工作
1. 登录你的币安账户
2. 确保账户里有 USDT（建议准备 100-500 USDT）
3. 打开币安 Alpha 页面：https://www.binance.com/zh-CN/alpha

### 第一步：选择代币
1. 点击浏览器右上角的插件图标
2. 查看**稳定币推荐**板块
3. 插件会自动推荐3个最适合刷分的代币（稳定、磨损低）
4. 点击推荐的代币名称，自动跳转到交易页面

### 第二步：设置参数

插件提供了三种预设模式，新手直接用默认的「横盘模式」即可：

| 模式 | 适用场景 | 预计磨损 |
|------|---------|----------|
| **横盘模式**（推荐） | 价格稳定时使用 | 刷15分约1.6-3.2 USDT |
| **上涨模式** | 价格上涨时使用 | 刷15分约1.6-3.2 USDT |
| **自定义模式** | 高级用户自行调整 | 根据设置而定 |

其他参数（通常不需要改）：
- **积分系数**：普通代币设为1，4倍积分代币设为4
- **积分目标**：达到设定分数后自动停止（默认15分）
- **交易速度**：中速（5-10秒一次）或快速（1-3秒一次）

### 第三步：开始刷分
1. 点击「**启动**」按钮
2. 插件开始自动交易
3. 实时查看：
   - 当前积分
   - 交易次数
   - 磨损金额
   - 预警状态
4. 达到目标积分或手动点击「**停止**」结束

## 📊 功能说明

### 稳定币推荐
- 每8秒自动更新一次数据
- 根据**价格稳定性**和**买卖价差**综合评分
- 自动筛选出最适合刷分的代币
- 价差越小，磨损越低

### 智能下单
- 自动计算最优价格（VWAP）
- 根据设置的偏移百分比下单
- 买入后立即挂反向卖单
- 全自动执行，无需手动操作

### 预估交易量
- **智能计算**：根据当前积分自动计算达标所需交易量
- **实时更新**：显示"还需 X USDT 达到下一分"
- **精准预测**：基于 log₂ 算法精确计算积分阈值
- **进度显示**：直观展示当前交易进度百分比

### 磨损风控机制
- **多级预警系统**：
  - 绿色（<0.05%）：正常磨损范围
  - 黄色（0.05%-0.1%）：轻微预警，注意控制
  - 红色（>0.1%）：高磨损警告，建议调整策略
- **智能停损**：磨损超过设定阈值自动暂停
- **会话追踪**：记录每次启动/停止的磨损数据
- **累积统计**：显示当日总磨损和单次会话磨损

### 历史记录与日历
- **磨损日历视图**：
  - 月历展示每日交易数据
  - 颜色标记不同磨损级别
  - 点击查看当日详细数据
- **历史统计**：
  - 每日交易量、积分、磨损率
  - 成功交易次数统计
  - 平均价格追踪
- **数据导出**：支持导出历史数据用于分析

### 风险控制
- **5秒预警**：订单未成交会发出黄色提醒
- **10秒停止**：卖单长时间未成交自动暂停
- **余额监控**：实时显示磨损率，异常会变红提醒
- **智能限制**：自动控制交易频率，避免触发风控

### 数据统计
- **今日交易量**：显示累计买入金额
- **Alpha积分**：实时计算当前积分（floor(log₂(交易量))）
- **成功次数**：统计成交的订单数
- **磨损追踪**：显示总磨损金额和百分比
- **会话统计**：记录每次启动到停止的独立数据

## ⚠️ 注意事项

### 使用须知
- 插件完全**免费开源**，无任何收费
- 只在浏览器端运行，**不会窃取**你的账户信息
- 需要保持浏览器和币安页面开启
- 建议使用稳定的网络环境

### 风险提醒
- 交易有风险，可能产生磨损
- 请合理设置参数，避免频繁交易
- 本工具仅供学习交流，使用风险自负

## 🆘 常见问题

**Q: 插件安全吗？**
A: 完全安全。代码开源，不存储密码，只通过模拟点击操作。

**Q: 为什么订单没有成交？**
A: 可能是价格偏移设置过小或市场波动大，可以适当调整偏移百分比。

**Q: 磨损太高怎么办？**
A: 选择更稳定的代币，使用更小的价格偏移（如0.001%）。

**Q: 可以同时刷多个代币吗？**
A: 不建议。插件设计为单代币运行，确保稳定性。

**Q: 支持其他浏览器吗？**
A: 目前支持 Chrome 和 Edge，其他 Chromium 内核浏览器理论上也可以。

**Q: 历史数据保存在哪里？**
A: 数据保存在浏览器本地存储中，卸载插件会清除数据。

**Q: 如何降低磨损？**
A: 选择稳定币种、减小价格偏移、降低交易频率。

## 💬 加入社区

- **Telegram 群组**：https://t.me/ddddao2025
- **GitHub Issues**：[提交问题或建议](https://github.com/DDDDAO/DDDD-Alpha-Extension/issues)

## 📜 免责声明

本插件仅供学习和个人使用，不构成投资建议。使用本插件产生的任何损失或问题，开发者不承担责任。请遵守币安使用条款和当地法律法规。

---

# English

# DDDD Alpha Assistant

An intelligent Binance Alpha farming assistant that integrates stable token recommendations, automated trading, real-time Alpha points tracking with cost statistics, and airdrop announcements. Developed by DDDDAO Quant Community. Join our Telegram group to discuss farming strategies: https://t.me/ddddao2025

This extension is completely free and open-source, for educational and communication purposes only. Users should determine whether using the extension may violate Binance Alpha activity rules.

📖 **[Binance TGE Quickstart Guide](./TGE_QUICKSTART.md)** - Learn how to participate in Binance TGE events and claim airdrop rewards

Developed by DDDDAO Community | [Telegram Group](https://t.me/ddddao2025)

## 🎯 What is this?

A Chrome extension that helps you **automatically trade tokens to earn Alpha points** on Binance Alpha platform. No manual operation needed - the extension handles everything for you.

### Key Features
- ✅ **Auto Trading**: Automatically buy and sell every few seconds
- ✅ **Smart Recommendations**: Real-time suggestions for most stable tokens
- ✅ **Points Tracking**: Live display of your points and progress
- ✅ **Risk Control**: Auto-monitoring with emergency stop
- ✅ **History Records**: View daily trading history and cost statistics calendar
- ✅ **Airdrop Alerts**: Shows today's and upcoming airdrops

## 📦 Quick Installation (1 minute)

### Option 1: Chrome Web Store (Recommended)

1. **Direct Install**
   - Visit [Chrome Web Store](https://chromewebstore.google.com/detail/dddd-alpha-extension/bpkpgegpbcbeflbgicjhdflhfmikgjpc)
   - Click "Add to Chrome" button
   - Done! Extension icon appears in toolbar

### Option 2: Download ZIP Package

1. **Download Extension**
   - Click [here to download](https://github.com/DDDDAO/dddd-alpha-extension/releases/download/nightly/dddd-alpha-extension.zip)
   - Extract the zip file to any folder

2. **Install in Browser**
   - Open Chrome browser
   - Go to `chrome://extensions`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the extracted folder
   - Done! Extension icon appears in toolbar

### Option 3: Build from Source

```bash
# Clone repository
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension

# Install and build
npm install
npm run build

# Load the extension folder in Chrome
```

## 🚀 How to Use (Super Easy)

### Preparation
1. Log in to your Binance account
2. Ensure you have USDT (recommend 100-500 USDT)
3. Open Binance Alpha: https://www.binance.com/en/alpha

### Step 1: Choose Token
1. Click extension icon in browser toolbar
2. Check "Stability Dashboard" section
3. Extension recommends 3 best tokens for farming
4. Click token name to jump to trading page

### Step 2: Configure Settings

Three preset modes available - beginners can use default "Sideways Mode":

| Mode | Use Case | Est. Cost |
|------|----------|-----------|
| **Sideways** (Recommended) | Stable prices | 15 pts ≈ 1.6-3.2 USDT |
| **Bullish** | Rising prices | 15 pts ≈ 1.6-3.2 USDT |
| **Custom** | Advanced users | Varies |

Other settings (usually no change needed):
- **Points Factor**: 1 for regular, 4 for 4x tokens
- **Points Target**: Auto-stop at target (default 15)
- **Speed**: Medium (5-10s) or Fast (1-3s)

### Step 3: Start Farming
1. Click "**Start**" button
2. Extension begins auto-trading
3. Monitor in real-time:
   - Current points
   - Trade count
   - Cost amount
   - Warning status
4. Stops at target or click "**Stop**" manually

## 📊 Features Explained

### Stability Dashboard
- Updates every 8 seconds
- Scores based on **price stability** and **spread**
- Auto-filters best tokens for farming
- Lower spread = lower cost

### Smart Orders
- Auto-calculates optimal price (VWAP)
- Places orders with configured offset
- Immediate reverse order after buy
- Fully automated execution

### Volume Estimation
- **Smart Calculation**: Auto-calculates required volume to reach target
- **Real-time Updates**: Shows "Need X USDT for next point"
- **Precise Prediction**: Based on log₂ algorithm for accurate thresholds
- **Progress Display**: Visual representation of current progress percentage

### Cost Risk Control
- **Multi-level Warning System**:
  - Green (<0.05%): Normal cost range
  - Yellow (0.05%-0.1%): Minor warning, monitor closely
  - Red (>0.1%): High cost alert, adjust strategy
- **Smart Stop-loss**: Auto-pause when cost exceeds threshold
- **Session Tracking**: Records cost data for each start/stop session
- **Cumulative Stats**: Shows daily total cost and per-session cost

### History & Calendar
- **Cost Calendar View**:
  - Monthly calendar showing daily trading data
  - Color coding for different cost levels
  - Click to view detailed daily data
- **Historical Statistics**:
  - Daily volume, points, cost ratio
  - Successful trade count
  - Average price tracking
- **Data Export**: Export historical data for analysis

### Risk Control
- **5-sec Warning**: Yellow alert for unfilled orders
- **10-sec Stop**: Auto-pause for stuck sell orders
- **Balance Monitor**: Real-time cost ratio display
- **Smart Limiting**: Controls trading frequency to avoid risk triggers

### Statistics
- **Today's Volume**: Cumulative buy amount
- **Alpha Points**: Real-time calculation (floor(log₂(volume)))
- **Success Count**: Number of filled orders
- **Cost Tracking**: Total cost amount and percentage
- **Session Stats**: Independent data for each start-stop session

## ⚠️ Important Notes

### Usage Notes
- Extension is **completely free and open-source**
- Runs only in browser, **no data theft**
- Keep browser and Binance page open
- Use stable internet connection

### Risk Warning
- Trading involves costs
- Set parameters carefully
- For educational purposes only, use at your own risk

## 🆘 FAQ

**Q: Is it safe?**
A: Yes. Open-source code, no password storage, only simulates clicks.

**Q: Why aren't orders filling?**
A: Price offset may be too small or market is volatile. Adjust offset percentage.

**Q: Cost too high?**
A: Choose more stable tokens, use smaller offset (e.g., 0.001%).

**Q: Can I farm multiple tokens?**
A: Not recommended. Extension designed for single token stability.

**Q: Other browsers supported?**
A: Currently Chrome and Edge. Other Chromium browsers may work.

**Q: Where is history data saved?**
A: Data is saved in browser local storage, will be cleared if extension is uninstalled.

**Q: How to reduce costs?**
A: Choose stable tokens, reduce price offset, lower trading frequency.

## 💬 Join Community

- **Telegram Group**: https://t.me/ddddao2025
- **GitHub Issues**: [Submit issues or suggestions](https://github.com/DDDDAO/DDDD-Alpha-Extension/issues)

## 📜 Disclaimer

This extension is for educational and personal use only. Not investment advice. Developers are not responsible for any losses from using this tool. Please follow Binance terms and local regulations.

---

[![Star History Chart](https://api.star-history.com/svg?repos=DDDDAO/DDDD-Alpha-Extension&type=Date)](https://star-history.com/#DDDDAO/DDDD-Alpha-Extension&Date)