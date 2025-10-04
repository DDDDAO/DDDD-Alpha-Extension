# DDDD Alpha Extension

一个智能化的币安 Alpha 刷分助手，集成稳定性看板、自动 VWAP 交易和多账号管理功能。由 DDDDAO 量化社区开发，欢迎进群一起讨论刷分技巧：https://t.me/ddddao2025

### 免责声明
本扩展仅供教育和个人使用。使用风险自负。作者对使用此工具可能产生的任何交易损失或账户问题概不负责。

本插件仅仅辅助计算挂单价格，并且在网页端模拟人工操作进行填写订单信息并点击下单按钮，不会记录和传输任何敏感数据。

插件完全开源免费，仅为学习交流目的，请使用者自行明确是否会因使用插件违反币安Alpha活动规则。

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
3. 点击推荐币种名称跳转到交易页面

#### 第二步：配置参数

**价格偏移百分比**
- **工作原理**：
  - 买单 = VWAP + 偏移
  - 卖单 = VWAP - 偏移
- **推荐值**：
  - 平衡模式：0.01%（万1）或 0.005%（万0.5）
  - 极低磨损：0.001%（万0.1）- K线稳定时
  - 快速成交：0.02%（万2）及以上

**积分系数**
- 4倍Alpha代币设为 4
- 普通代币保持 1

**积分目标**
- 推荐 15 分（≈ 32,768 USDT）

#### 第三步：启动自动化
1. 点击**启动**按钮
3. 达到目标或点击**停止**结束

#### 第四步：查看数据
- 实时查看磨损和交易量
- 监控积分增长
- 检查成本比率

## 核心功能

### 稳定性看板

- **实时数据更新**：每 8 秒自动刷新币种稳定性数据
- **智能评分系统**：基于稳定性（50分）+ 价差（50分）综合评分
- **Top 3 推荐**：自动筛选最适合刷分的稳定币种
- **一键跳转**：点击币种名称直接跳转到 Alpha 交易页面

### 自动 VWAP 交易

- **智能价格计算**：自动计算成交量加权平均价格（VWAP）
- **双向挂单策略**：
  - 买单：VWAP + 偏移价格（默认万1）
  - 卖单：VWAP - 偏移价格（默认万1）
- **全仓交易**：每次使用全部可用 USDT 进行交易

### 实时数据面板

- **今日买入量**：累计交易量（UTC 时区）
- **Alpha 积分**：自动计算 `floor(log2(交易量))`
- **成功交易次数**：统计成交订单数量
- **余额跟踪**：
  - 初始余额：今日首次余额
  - 当前余额：实时更新
  - 总成本：初始余额 - 当前余额
  - 成本比率：磨损百分比

### 智能停止机制

- **积分目标达成**：自动停止（默认 15 分 ≈ 32,768 USDT）
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

| 场景 | 价格偏移 | 预估磨损 | 适用情况 |
|------|---------|---------|---------|
| 极致低成本 | 0.001% (万0.1) | 15分≈1.6U, 16分≈3.2U | K线极稳 |
| 平衡模式 | 0.01% (万1) | 15分≈5-8U | 大多数情况 |
| 快速成交 | 0.02% (万2) | 15分≈10-15U | 急需刷分 |

### 多账号管理
**使用 Chrome Profile 功能**
1. 创建多个 Profile
2. 每个 Profile 登录不同账号
3. 同时运行多个扩展实例
4. 互不干扰，提高效率

### 风险控制
- 预留 10-20% 余额缓冲
- 突然插针时手动卖出
- 密切关注稳定性状态变化

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

### 许可证
MIT 许可证 - 可自由修改和分发


---

# DDDD Alpha Extension

An intelligent Binance Alpha points farming assistant with integrated stability dashboard, automated VWAP trading, and multi-account management.

## Core Features

### Stability Dashboard
- **Real-time Updates**: Auto-refresh stability data every 8 seconds
- **Smart Scoring**: Stability (50 pts) + Spread (50 pts) composite score
- **Top 3 Recommendations**: Auto-filter best stable tokens for farming
- **One-click Jump**: Click token name to navigate to Alpha trading page

### Automated VWAP Trading
- **Smart Pricing**: Auto-calculate Volume-Weighted Average Price
- **Dual Order Strategy**:
  - Buy: VWAP + Offset (default 0.01%)
  - Sell: VWAP - Offset (default 0.01%)
- **Full Position**: Use all available USDT for each trade

### Real-time Data Panel
- **Today's Volume**: Cumulative trading volume (UTC timezone)
- **Alpha Points**: Auto-calculate `floor(log2(volume))`
- **Successful Trades**: Count of executed orders
- **Balance Tracking**:
  - Initial Balance: First balance of the day
  - Current Balance: Real-time updates
  - Total Cost: Initial - Current
  - Cost Ratio: Slippage percentage

###  Smart Stop Mechanism
- **Points Target**: Auto-stop at goal (default 15 pts ≈ 32,768 USDT)
- **Manual Stop**: Pause anytime
- **Error Protection**: Auto-pause on login failures

## Installation & Usage

### Installation Steps

**Option 1: Pre-built (Recommended)**

1. Download the [latest prebuilt package](https://github.com/DDDDAO/dddd-alpha-extension/releases/download/nightly/dddd-alpha-extension.zip)
2. Extract to any folder
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (toggle in top-right)
5. Click **Load unpacked**
6. Select the extracted folder

**Option 2: Build from Source**

```bash
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension
npm install
npm run build
# Then load extension/ folder
```

### Quick Start

#### Step 1: Select Token
1. Click extension icon
2. Check **Stability Dashboard**
3. Click recommended token name to navigate

#### Step 2: Configure Parameters

**Price Offset Percent**
- **How it works**:
  - Buy = VWAP + Offset
  - Sell = VWAP - Offset
- **Recommended**:
  - Balanced: 0.01% (0.1 bps) or 0.005% (0.05 bps)
  - Ultra-low Cost: 0.001% (0.01 bps) - when chart is stable
  - Fast Execution: 0.02% (0.2 bps) or higher

**Points Factor**
- 4x tokens = 4
- Regular tokens = 1

**Points Target**
- Recommended 15 pts (≈ 32,768 USDT)

#### Step 3: Start Automation
1. Click **Start** button
2. Extension trades every 30 seconds
3. Reaches target or click **Stop** to end

#### Step 4: View Data
- View real-time cost and volume
- Monitor points growth
- Check cost ratio

## Trading Tips

### Token Selection Strategy
✅ **Priority**:
- Tokens with "Stable" label in dashboard
- Spread < 2 basis points
- 4x tokens (with factor 4)

❌ **Avoid**:
- Highly volatile tokens
- High spread tokens (> 5 bps)

### Parameter Optimization Guide

| Scenario | Offset | Est. Cost | Use Case |
|----------|--------|-----------|----------|
| Ultra-low | 0.001% (0.01 bps) | 15pts≈1.6U, 16pts≈3.2U | Very stable chart |
| Balanced | 0.01% (0.1 bps) | 15pts≈5-8U | Most cases |
| Fast | 0.02% (0.2 bps) | 15pts≈10-15U | Urgent farming |

### Multi-Account Management
**Use Chrome Profile**
1. Create multiple Profiles
2. Each Profile for different account
3. Run multiple extension instances
4. Independent, improved efficiency

### Risk Control
- Reserve 10-20% balance buffer
- Manual sell on sudden spikes
- Monitor stability status changes

## Important Notes

### Usage Requirements
- Binance account login required
- Ensure sufficient USDT balance
- Full position for each trade
- Trading involves risk, invest cautiously

###  Security Notes
- No passwords or keys stored
- Browser UI operations only
- Manual authentication required

### License
MIT License - free to modify and distribute

### Disclaimer
This extension is for educational and personal use only. Use at your own risk. The authors are not responsible for any trading losses or account issues.
