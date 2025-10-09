# DDDD Alpha Extension

一个智能化的币安 Alpha 刷分助手，集成稳定代币推荐、自动交易、今日 Alpha 积分与磨损统计以及空投预告等功能。由 DDDDAO 量化社区开发，欢迎进群一起讨论刷分技巧：https://t.me/ddddao2025


### 免责声明
本扩展仅供教育和个人使用。使用风险自负。作者对使用此工具可能产生的任何交易损失或账户问题概不负责。

本插件仅仅辅助计算挂单价格，并且在网页端模拟人工操作进行填写订单信息并点击下单按钮，不会记录和传输任何敏感数据。

插件完全开源免费，仅为学习交流目的，请使用者自行明确是否会因使用插件违反币安Alpha活动规则。

欢迎任何人在遵循 MIT 许可证条款的前提下下载、修改与扩展本项目，但在再发布或引用衍生作品时请保留对原项目的明确署名。

## 安装使用

### 安装步骤

**方式一：预构建版本（推荐）**

1. 下载 [最新预构建包](https://github.com/DDDDAO/dddd-alpha-extension/releases/download/nightly/dddd-alpha-extension.zip)
2. 解压到任意文件夹
3. Chrome 浏览器访问 `chrome://extensions`
4. 启用**开发者模式**（右上角开关）
5. 点击**加载已解压的扩展程序**
6. 选择解压后的文件夹

**方式二：源码构建**

```bash
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension
npm install
npm run build
# 然后加载 extension/ 文件夹
```

### 快速开始

#### 第一步：选择币种
1. 点击扩展图标
2. 查看**稳定性看板**
   - 自动分析所有代币的价格稳定性和价差
   - 综合评分（稳定性 50分 + 价差 50分）
   - 推荐 Top 3 最适合刷分的币种
3. 点击推荐币种名称跳转到交易页面

#### 第二步：配置参数

**价格偏移模式**

工具会自动计算订单簿的 VWAP（成交量加权平均价），并以此为基准价格进行下单。

- **下单价格**：
  - 买入价 = VWAP × (1 + 买入偏移%)
  - 卖出价 = VWAP × (1 + 卖出偏移%)

- **预设模式**：
  - **横盘模式**（推荐）：买入 +0.01%，卖出 -0.01%
    - 适用于价格稳定时使用
    - 价差小，磨损低（15分约 5-8U）
  - **上涨模式**：买入 +0.01%，卖出 +0.02%
    - 适用于价格上涨趋势
    - 更快成交卖单（15分约 8-12U）
  - **自定义模式**：支持 -5% 到 +5% 灵活配置
    - 极稳币种：+0.001% / -0.001%（磨损约 1.6U）
    - 快速成交：+0.02% / +0.02%（磨损约 10-15U）

**积分系数**
- 4倍Alpha代币设为 4
- 普通代币保持 1

**积分目标**
- 推荐 15 分（≈ 32,768 USDT）
- 达到目标后自动停止

#### 第三步：启动自动化

1. 点击**启动**按钮
2. 扩展每隔 5-10 秒（中速）或 1-3 秒（快速）自动交易一次
3. 每个交易周期：
   - 计算 VWAP 价格
   - 查询订单历史，统计今日交易量和积分
   - 智能风控检查（未成交订单、余额、冷却时间）
   - 自动下单（买入+反向卖出）
   - 实时监控订单状态
4. 达到目标或点击**停止**结束

**订单监控**
- **5秒预警**：订单未成交显示黄色提示 + 提示音
- **10秒紧急停止**：卖出单未成交自动暂停策略 + 红色警报

#### 第四步：查看数据
- **今日买入量**：累计交易量（UTC 时区）
- **Alpha 积分**：自动计算 floor(log₂(交易量))
- **成功交易次数**：统计成交订单数量（上限 30次/天）
- **余额追踪**：
  - 初始余额、当前余额、总磨损、磨损率
  - 磨损率颜色提示：绿色（<0.5‱）、黄色（0.5%-1‱）、红色（>1‱）
- **实时 VWAP**：显示最近一次计算的平均价格

## 核心功能

### 稳定性看板

- **实时数据更新**：每 8 秒自动刷新币种稳定性数据
- **智能评分系统**：基于稳定性（50分）+ 价差（50分）综合评分
- **Top 3 推荐**：自动筛选最适合刷分的稳定币种
- **一键跳转**：点击币种名称直接跳转到 Alpha 交易页面

### 自动 VWAP 交易

- **智能价格计算**：自动计算订单簿加权平均价格（VWAP）
- **实时价格显示**：在代币卡片中显示当前平均价格和更新时间
- **灵活价格偏移**：
  - 支持正负百分比偏移（-5% 到 +5%）
  - 三种预设模式：横盘、上涨、自定义
  - 买入价和卖出价独立设置
- **双向挂单策略**：
  - 买单价格 = 平均价 × (1 + 买入偏移%)
  - 卖单价格 = 平均价 × (1 + 卖出偏移%)
- **全仓交易**：每次使用全部可用 USDT 进行交易

### 实时数据面板

- **今日买入量**：累计交易量（UTC 时区）
- **Alpha 积分**：自动计算 `floor(log2(交易量))`
- **成功交易次数**：统计成交订单数量
- **余额跟踪**：
  - 初始余额：今日首次余额（支持手动刷新）
  - 当前余额：实时更新
  - 总成本：初始余额 - 当前余额
  - 成本比率：磨损百分比

### 空投信息

- **今日空投**：展示当日即可参与的空投项目，含代币、数量、估算价值、阶段、类型等关键信息
- **空投预告**：列出未来即将开启的空投，标注预计日期、时间和奖励规模，方便提前准备
- **价格参考**：同步展示相关代币的最新价格，快速评估潜在收益
- **自动更新**：每 30 分钟自动刷新空投信息

### 国际化支持

- **多语言界面**：支持中文简体和英文
- **一键切换**：界面右上角快速切换语言
- **完整翻译**：所有功能和提示均支持双语

### 智能停止机制

- **积分目标达成**：自动停止（默认 15 分 ≈ 32,768 USDT）
- **订单监控预警**：
  - 5秒预警：订单未成交显示提示
  - 10秒紧急停止：卖出单未成交自动暂停策略
- **手动停止**：随时暂停自动化

## 刷分技巧

### 币种选择策略
✅ **优先选择**：
- 稳定性看板中"稳定"标签的币种
- 价差 < 2 基点的币种
- 4 倍代币（配合积分系数 4）

❌ **避免选择**：
- 价格剧烈波动的币种
- 价差过大的币种（> 5 基点）

### 参数优化指南

| 场景 | 推荐模式 | 买入偏移 | 卖出偏移 | 预估磨损 | 适用情况 |
|------|---------|---------|---------|---------|---------|
| 价格稳定 | 横盘模式 | +0.01% | -0.01% | 15分≈5-8U | 大多数情况 |
| 价格上涨 | 上涨模式 | +0.01% | +0.02% | 15分≈8-12U | 趋势向上 |
| 极致低成本 | 自定义 | +0.001% | -0.001% | 15分≈1.6U | K线极稳 |
| 快速成交 | 自定义 | +0.02% | +0.02% | 15分≈10-15U | 急需刷分 |

**负价差说明**：

- 卖出偏移为负值（如 -0.01%）表示以低于平均价的价格挂卖单
- 可以加快卖单成交速度，但会增加磨损
- 适合价格稳定、需要快速完成交易的场景

## 重要提示

### 使用须知
- 需登录币安账户
- 确保足够 USDT 余额
- 每次全仓买卖
- 交易有风险，投资需谨慎

### 安全说明
- 不存储任何密码或私钥
- 仅通过浏览器 UI 操作
- 需手动登录认证
- 完全开源，代码透明

### 许可证
MIT 许可证 - 可自由修改和分发


---


# DDDD Alpha Extension (English)

An intelligent Binance Alpha points farming assistant that integrates stable token recommendations, automated trading, real-time Alpha points tracking with cost statistics, and airdrop announcements. Developed by DDDDAO Quant Community. Join our Telegram group to discuss farming strategies: https://t.me/ddddao2025


### Disclaimer
This extension is for educational and personal use only. Use at your own risk. The authors are not responsible for any trading losses or account issues resulting from the use of this tool.

This extension only assists in calculating order prices and simulates human operations on the web page to fill in order information and click the order button. It does not record or transmit any sensitive data.

The extension is completely open-source and free, intended for educational and communication purposes only. Users should determine whether using the extension may violate Binance Alpha activity rules.

Anyone is welcome to download, modify, and extend this project under the terms of the MIT license, but please provide clear attribution to the original project when republishing or citing derivative works.

## Installation and Usage

### Installation Steps

**Option 1: Pre-built Version (Recommended)**

1. Download [latest pre-built package](https://github.com/DDDDAO/dddd-alpha-extension/releases/download/nightly/dddd-alpha-extension.zip)
2. Extract to any folder
3. Open `chrome://extensions` in Chrome browser
4. Enable **Developer mode** (toggle in top-right corner)
5. Click **Load unpacked**
6. Select the extracted folder

**Option 2: Build from Source**

```bash
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension
npm install
npm run build
# Then load the extension/ folder
```

### Quick Start

#### Step 1: Select Token
1. Click the extension icon
2. Check the **Stability Dashboard**
   - Automatically analyzes price stability and spread for all tokens
   - Composite score (Stability 50 pts + Spread 50 pts)
   - Recommends Top 3 most suitable tokens for farming
3. Click on the recommended token name to navigate to the trading page

#### Step 2: Configure Parameters

**Price Offset Mode**

The tool automatically calculates the VWAP (Volume-Weighted Average Price) from the order book and uses it as the base price for placing orders.

- **Order Prices**:
  - Buy Price = VWAP × (1 + Buy Offset %)
  - Sell Price = VWAP × (1 + Sell Offset %)

- **Preset Modes**:
  - **Sideways Mode** (Recommended): Buy +0.01%, Sell -0.01%
    - Suitable for stable prices
    - Small spread, low cost (15 pts ≈ 5-8 USDT)
  - **Bullish Mode**: Buy +0.01%, Sell +0.02%
    - Suitable for upward price trends
    - Faster sell order execution (15 pts ≈ 8-12 USDT)
  - **Custom Mode**: Flexible configuration from -5% to +5%
    - Ultra-stable tokens: +0.001% / -0.001% (cost ≈ 1.6 USDT)
    - Fast execution: +0.02% / +0.02% (cost ≈ 10-15 USDT)

**Points Factor**
- Set to 4 for 4x Alpha tokens
- Keep at 1 for regular tokens

**Points Target**
- Recommended 15 pts (≈ 32,768 USDT)
- Automatically stops after reaching target

#### Step 3: Start Automation

1. Click the **Start** button
2. Extension automatically trades every 5-10 seconds (medium speed) or 1-3 seconds (fast speed)
3. Each trading cycle:
   - Calculate VWAP price
   - Query order history, track daily volume and points
   - Smart risk control checks (pending orders, balance, cooldown)
   - Auto-place orders (buy + reverse sell)
   - Real-time order status monitoring
4. Stops when target is reached or **Stop** is clicked

**Order Monitoring**
- **5-second Warning**: Yellow alert + notification sound if order is not filled
- **10-second Emergency Stop**: Automatically pauses strategy + red alarm if sell order is not filled

#### Step 4: View Data
- **Today's Buy Volume**: Cumulative trading volume (UTC timezone)
- **Alpha Points**: Automatically calculates floor(log₂(volume))
- **Successful Trades**: Count of executed orders (limit 30 per day)
- **Balance Tracking**:
  - Initial balance, current balance, total cost, cost ratio
  - Color indicators: Green (<0.5‱), Yellow (0.5%-1‱), Red (>1‱)
- **Real-time VWAP**: Displays the most recently calculated average price

## Core Features

### Stability Dashboard

- **Real-time Data Updates**: Automatically refreshes token stability data every 8 seconds
- **Smart Scoring System**: Composite score based on Stability (50 pts) + Spread (50 pts)
- **Top 3 Recommendations**: Automatically filters the most suitable stable tokens for farming
- **One-click Navigation**: Click token name to jump directly to Alpha trading page

### Automated VWAP Trading

- **Smart Price Calculation**: Automatically calculates Volume-Weighted Average Price (VWAP) from order book
- **Real-time Price Display**: Shows current average price and update time in token card
- **Flexible Price Offset**:
  - Supports positive/negative percentage offset (-5% to +5%)
  - Three preset modes: Sideways, Bullish, Custom
  - Independent buy and sell price settings
- **Dual Order Strategy**:
  - Buy order price = Average price × (1 + Buy offset %)
  - Sell order price = Average price × (1 + Sell offset %)
- **Full Position Trading**: Uses all available USDT for each trade

### Real-time Data Panel

- **Today's Buy Volume**: Cumulative trading volume (UTC timezone)
- **Alpha Points**: Automatically calculates `floor(log2(volume))`
- **Successful Trades**: Count of executed orders
- **Balance Tracking**:
  - Initial Balance: First balance of the day (manual refresh supported)
  - Current Balance: Real-time updates
  - Total Cost: Initial balance - Current balance
  - Cost Ratio: Slippage percentage

### Airdrop Information

- **Today's Airdrops**: Displays airdrop projects available today, including token, quantity, estimated value, stage, type, and other key information
- **Upcoming Airdrops**: Lists upcoming airdrops with expected date, time, and reward size for advance preparation
- **Price Reference**: Shows latest token prices for quick assessment of potential returns
- **Auto-update**: Automatically refreshes airdrop information every 30 minutes

### Internationalization Support

- **Multi-language Interface**: Supports Simplified Chinese and English
- **One-click Switch**: Quick language toggle in top-right corner
- **Complete Translation**: All features and tooltips support both languages

### Smart Stop Mechanism

- **Points Target Achievement**: Auto-stop (default 15 pts ≈ 32,768 USDT)
- **Order Monitoring Alerts**:
  - 5-second warning: Display alert for unfilled orders
  - 10-second emergency stop: Automatically pause strategy for unfilled sell orders
- **Manual Stop**: Pause automation at any time

## Farming Tips

### Token Selection Strategy
✅ **Priority Selection**:
- Tokens with "Stable" label in the stability dashboard
- Tokens with spread < 2 basis points
- 4x tokens (with points factor set to 4)

❌ **Avoid**:
- Tokens with high price volatility
- Tokens with excessive spread (> 5 basis points)

### Parameter Optimization Guide

| Scenario | Recommended Mode | Buy Offset | Sell Offset | Est. Cost | Use Case |
|----------|-----------------|-----------|-------------|-----------|----------|
| Stable Price | Sideways | +0.01% | -0.01% | 15pts≈5-8U | Most cases |
| Rising Price | Bullish | +0.01% | +0.02% | 15pts≈8-12U | Upward trend |
| Ultra-low Cost | Custom | +0.001% | -0.001% | 15pts≈1.6U | Very stable chart |
| Fast Execution | Custom | +0.02% | +0.02% | 15pts≈10-15U | Urgent farming |

**Negative Offset Explanation**:

- Negative sell offset (e.g., -0.01%) means placing sell orders below the average price
- Speeds up sell order execution but increases cost
- Suitable for stable prices when quick trade completion is needed

## Important Notes

### Usage Requirements
- Binance account login required
- Ensure sufficient USDT balance
- Full position trading for each order
- Trading involves risk, invest cautiously

### Security Notes
- No passwords or private keys stored
- Operations only through browser UI
- Manual login authentication required
- Fully open-source, transparent code

### License
MIT License - Free to modify and distribute


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DDDDAO/DDDD-Alpha-Extension&type=Date)](https://star-history.com/#DDDDAO/DDDD-Alpha-Extension&Date)
