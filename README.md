# Alpha 自动交易机器人

一个用于在币安 Alpha 页面上自动监控 VWAP（成交量加权平均价格）并执行交易的 Chrome 扩展程序。

## 功能特点

- **后台服务工作器**：基于闹钟的定时调度（启用时每 30 秒运行一次）
- **自动 VWAP 计算**：提取限价交易历史并计算成交量加权平均价格
- **智能下单**：在 VWAP + 偏移价格处下限价买单，并自动创建反向卖单
- **余额跟踪**：从页面加载时自动跟踪 USDT 余额
- **每日指标**：跟踪买入量、Alpha 积分、成功交易次数和余额变化（基于 UTC 时间）
- **自动停止**：达到配置的积分目标时自动暂停
- **可配置设置**：
  - 价格偏移百分比（0-5%）
  - 积分系数（1-1000 倍的成交量记录乘数）
  - 积分目标（1-1000 积分）
- **手动 VWAP 刷新**：无需下单即可检查 VWAP

## 快速开始（无需构建）

### 选项 1：使用预构建扩展（推荐）

1. **下载扩展**：
   - 从本仓库下载 `alpha-auto-bot-extension.zip`

2. **解压 zip 文件**：
   - 将 `alpha-auto-bot-extension.zip` 解压到你电脑上的一个文件夹
   - 你应该能看到 `manifest.json`、`popup.html` 和 `dist/` 文件夹等文件

3. **在 Chrome 中加载**：
   - 打开 Chrome 并导航至 `chrome://extensions`
   - 启用**开发者模式**（右上角的开关）
   - 点击**加载已解压的扩展程序**
   - 选择解压后的 `extension` 文件夹

4. **开始使用**：
   - 导航到币安 Alpha 代币页面（例如：`https://www.binance.com/zh-CN/alpha/bsc/0x...`）
   - 点击工具栏中的扩展图标
   - 配置你的设置（价格偏移、积分系数、积分目标）
   - 点击**启动**开始自动化

### 选项 2：从源代码构建

如果你想修改代码或从源代码构建：

```bash
# 克隆仓库
git clone git@github.com:DDDDAO/alpha-auto-bot.git
cd alpha-auto-bot

# 安装依赖
npm install

# 构建扩展
npm run build

# 编译后的扩展将在 extension/ 文件夹中
```

然后按照选项 1 中的步骤 3-4 操作。

## 工作原理

### 自动化流程

1. **当自动化启动时**：
   - 后台工作器创建一个每 30 秒触发的 Chrome 闹钟
   - 内容脚本被注入到币安 Alpha 页面
   - 初始余额被捕获并存储

2. **每次闹钟触发时**：
   - 内容脚本从页面提取限价交易历史
   - 根据交易计算 VWAP
   - 检查是否存在未成交订单
   - 如果没有订单且冷却时间已过：
     - 在 `VWAP + (VWAP × 偏移%)` 处下限价买单
     - 自动在 `VWAP - (VWAP × 偏移%)` 处创建反向卖单
     - 记录买入量（乘以积分系数）
   - 更新当前余额
   - 将结果发送回后台工作器

3. **指标计算**：
   - **买入量**：买单总 USDT 花费（×积分系数）
   - **Alpha 积分**：当成交量 ≥ 2 时为 `floor(log2(成交量))`
   - **余额跟踪**：初始余额、当前余额、总成本、成本比率
   - 所有指标在 UTC 午夜重置

4. **自动停止**：
   - 当每日 Alpha 积分 ≥ 配置的目标时，自动化暂停
   - 闹钟被清除，不再下新订单

### 关键实现细节

- **React 输入操作**：使用 `Object.getOwnPropertyDescriptor` 正确设置 React 控制的输入值
- **订单确认**：随机延迟（1-3 秒）然后轮询确认对话框
- **扩展上下文验证**：每次发送消息前检查 `chrome.runtime.id` 有效性
- **消息重试逻辑**：对"接收端不存在"错误进行指数退避
- **存储规范化**：从 Chrome 存储读取时，所有设置都经过限制和验证

## 配置

### 价格偏移百分比
- 范围：0-5%
- 默认值：0.01%
- 控制限价订单与 VWAP 的偏离距离
- 示例：VWAP = $1.00，偏移 = 0.5%
  - 买单下在 $1.005
  - 反向卖单下在 $0.995

### 积分系数
- 范围：1-1000
- 默认值：1
- 应用于买入量以计算积分的乘数
- 系数越高 = 积分累积越快

### 积分目标
- 范围：1-1000
- 默认值：15
- 当每日 Alpha 积分达到此阈值时停止自动化

## 弹窗控制

- **启动**：在当前币安 Alpha 页面开始自动化
- **停止**：暂停自动化并清除计划的闹钟
- **刷新 VWAP**：手动计算 VWAP 而不下单

## 显示指标

弹窗显示实时指标：

- **平均价格**：最新的 VWAP 计算
- **今日买入量（UTC）**：当前 UTC 日的累计买入量
- **今日 Alpha 积分**：计算为 `floor(log2(成交量))`
- **距下一积分**：达到下一个 Alpha 积分所需的 USDT
- **今日成功交易**：成功下单的次数
- **今日初始余额（UTC）**：今天捕获的初始 USDT 余额
- **当前余额**：最新的 USDT 余额
- **今日总成本（UTC）**：初始余额 - 当前余额
- **成本比率**：总成本 ÷ 初始余额（百分比）
- **时间戳**：最后更新时间

## 开发

### 命令

```bash
# 启动 TypeScript 监视模式
npm run dev

# 生产构建
npm run build

# 运行测试
npm run test

# 运行特定测试文件
npm run test -- path/to/test.spec.ts

# 代码检查
npm run lint
```

### 项目结构

```
alpha-auto-bot/
├── extension/              # 扩展清单和 UI
│   ├── manifest.json      # Chrome 扩展清单
│   ├── popup.html         # 弹窗 UI
│   ├── popup.js           # 弹窗逻辑
│   └── dist/              # 编译的 TypeScript（git 忽略）
├── src/
│   ├── background/        # 服务工作器
│   │   └── index.worker.ts
│   ├── content/           # 内容脚本
│   │   └── main.content.ts
│   ├── lib/               # 共享工具
│   │   ├── messages.ts    # 运行时消息类型
│   │   ├── storage.ts     # Chrome 存储辅助工具
│   │   └── tabs.ts        # 标签管理
│   └── config/            # 配置
│       ├── defaults.ts    # 默认值
│       └── selectors.ts   # DOM 选择器
├── tests/
│   └── unit/              # 单元测试
└── CLAUDE.md              # AI 上下文文档
```

## 重要说明

### 安全性

- **需要手动认证**：需要登录时扩展会暂停
- **订单冷却**：下单之间最少间隔 15 秒
- **不存储凭证**：扩展从不存储密码或 API 密钥
- **仅基于 DOM**：所有操作通过浏览器 UI 执行，而非 API

### 选择器维护

币安 UI 选择器可能会在没有通知的情况下更改。如果扩展停止工作：
1. 检查 `src/config/selectors.ts` 中的当前选择器
2. 更新选择器以匹配新的币安 UI 结构
3. 使用 `npm run build` 重新构建
4. 在 Chrome 中重新加载扩展

### 已知限制

- 仅适用于币安 Alpha BSC 代币页面
- 会话过期时需要手动登录
- 依赖币安 UI 结构（选择器可能随站点更新而失效）
- Chrome 闹钟最小间隔为 1 分钟（我们使用 0.5 分钟用于开发）

## 故障排除

### 扩展无法启动
- 确保你在有效的币安 Alpha 页面：`https://www.binance.com/*/alpha/bsc/0x...`
- 检查你是否已登录币安
- 刷新页面并重试

### 订单未下达
- 检查弹窗中的错误消息
- 验证你有足够的 USDT 余额
- 确保没有现有的未成交订单（如果存在订单，扩展会跳过下单）
- 等待下单之间的 15 秒冷却时间

### 指标未更新
- 检查浏览器控制台错误（`F12` → 控制台）
- 验证扩展上下文有效（如需要，重新加载扩展）
- 检查 Chrome 存储：`F12` → 应用程序 → 存储 → 本地存储

### 余额未显示
- 确保交易面板在页面上可见
- 页面加载后等待 2 秒以捕获初始余额
- 检查 UI 中"可用"USDT 值是否可见

## 贡献

1. Fork 此仓库
2. 创建功能分支：`git checkout -b feature-name`
3. 进行更改并彻底测试
4. 运行代码检查：`npm run lint`
5. 使用描述性消息提交
6. 推送并创建 Pull Request

## 许可证

MIT 许可证 - 可自由修改和分发

## 免责声明

此扩展仅供教育和个人使用。使用风险自负。作者对使用此自动化工具可能发生的任何交易损失或账户问题概不负责。

**交易有风险，投资需谨慎。**

---

# Alpha Auto Bot

A Chrome extension for automating VWAP (Volume-Weighted Average Price) monitoring and trade execution on Binance Alpha pages.

## Features

- **Background Service Worker**: Alarm-based scheduling (every 30 seconds when enabled)
- **Automatic VWAP Calculation**: Extracts limit trade history and calculates volume-weighted average price
- **Smart Order Placement**: Places limit buy orders at VWAP + offset with automatic reverse sell orders
- **Balance Tracking**: Automatically tracks USDT balance from page load
- **Daily Metrics**: Tracks buy volume, alpha points, successful trades, and balance changes (UTC-based)
- **Auto-Stop**: Automatically pauses when configured points target is reached
- **Configurable Settings**:
  - Price offset percentage (0-5%)
  - Points factor (1-1000x multiplier for volume recording)
  - Points target (1-1000 points)
- **Manual VWAP Refresh**: Check VWAP without placing orders

## Quick Start (No Build Required)

### Option 1: Use Pre-built Extension (Recommended)

1. **Download the extension**:
   - Download `alpha-auto-bot-extension.zip` from this repository

2. **Extract the zip file**:
   - Unzip `alpha-auto-bot-extension.zip` to a folder on your computer
   - You should see files like `manifest.json`, `popup.html`, and a `dist/` folder

3. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **Load unpacked**
   - Select the extracted `extension` folder

4. **Start using**:
   - Navigate to a Binance Alpha token page (e.g., `https://www.binance.com/en/alpha/bsc/0x...`)
   - Click the extension icon in your toolbar
   - Configure your settings (price offset, points factor, points target)
   - Click **Start** to begin automation

### Option 2: Build from Source

If you want to modify the code or build from source:

```bash
# Clone the repository
git clone git@github.com:DDDDAO/alpha-auto-bot.git
cd alpha-auto-bot

# Install dependencies
npm install

# Build the extension
npm run build

# The compiled extension will be in the extension/ folder
```

Then follow steps 3-4 from Option 1 above.

## How It Works

### Automation Flow

1. **When automation starts**:
   - Background worker creates a Chrome alarm that fires every 30 seconds
   - Content script is injected into the Binance Alpha page
   - Initial balance is captured and stored

2. **On each alarm tick**:
   - Content script extracts limit trade history from the page
   - Calculates VWAP from the trades
   - Checks for existing open orders
   - If no orders exist and cooldown has passed:
     - Places limit buy order at `VWAP + (VWAP × offset%)`
     - Automatically creates reverse sell order at `VWAP - (VWAP × offset%)`
     - Records buy volume (multiplied by points factor)
   - Updates current balance
   - Sends results back to background worker

3. **Metrics calculation**:
   - **Buy Volume**: Total USDT spent on buy orders (×points factor)
   - **Alpha Points**: `floor(log2(volume))` when volume ≥ 2
   - **Balance Tracking**: First balance, current balance, total cost, cost ratio
   - All metrics reset at UTC midnight

4. **Auto-stop**:
   - When daily alpha points ≥ configured target, automation pauses
   - Alarm is cleared and no more orders are placed

### Key Implementation Details

- **React Input Manipulation**: Uses `Object.getOwnPropertyDescriptor` to properly set React-controlled input values
- **Order Confirmation**: Randomized delay (1-3s) then polls for confirmation dialog
- **Extension Context Validation**: Checks `chrome.runtime.id` validity before every message
- **Message Retry Logic**: Exponential backoff for "Receiving end does not exist" errors
- **Storage Normalization**: All settings are clamped and validated when read from Chrome storage

## Configuration

### Price Offset Percent
- Range: 0-5%
- Default: 0.01%
- Controls how far limit orders deviate from VWAP
- Example: VWAP = $1.00, offset = 0.5%
  - Buy order placed at $1.005
  - Reverse sell order placed at $0.995

### Points Factor
- Range: 1-1000
- Default: 1
- Multiplier applied to buy volume for points calculation
- Higher factor = faster point accumulation

### Points Target
- Range: 1-1000
- Default: 15
- Automation stops when daily alpha points reach this threshold

## Popup Controls

- **Start**: Begins automation on current Binance Alpha page
- **Stop**: Pauses automation and clears scheduled alarms
- **Refresh VWAP**: Manually calculates VWAP without placing orders

## Display Metrics

The popup shows real-time metrics:

- **Average price**: Latest VWAP calculation
- **Today's buy volume (UTC)**: Accumulated buy volume for the current UTC day
- **Today's alpha points**: Calculated as `floor(log2(volume))`
- **Buy volume to next point**: USDT needed to reach next alpha point
- **Today's successful trades**: Number of successful order placements
- **Today's first balance (UTC)**: Initial USDT balance captured today
- **Current balance**: Latest USDT balance
- **Today's total cost (UTC)**: First balance - current balance
- **Cost ratio**: Total cost ÷ first balance (as percentage)
- **Timestamp**: Last update time

## Development

### Commands

```bash
# Start TypeScript watch mode
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run specific test file
npm run test -- path/to/test.spec.ts

# Lint code
npm run lint
```

### Project Structure

```
alpha-auto-bot/
├── extension/              # Extension manifest and UI
│   ├── manifest.json      # Chrome extension manifest
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   └── dist/              # Compiled TypeScript (gitignored)
├── src/
│   ├── background/        # Service worker
│   │   └── index.worker.ts
│   ├── content/           # Content script
│   │   └── main.content.ts
│   ├── lib/               # Shared utilities
│   │   ├── messages.ts    # Runtime message types
│   │   ├── storage.ts     # Chrome storage helpers
│   │   └── tabs.ts        # Tab management
│   └── config/            # Configuration
│       ├── defaults.ts    # Default values
│       └── selectors.ts   # DOM selectors
├── tests/
│   └── unit/              # Unit tests
└── CLAUDE.md              # AI context documentation
```

## Important Notes

### Security & Safety

- **Manual authentication required**: Extension pauses when login is needed
- **Order cooldown**: 15-second minimum between order placements
- **No credentials stored**: Extension never stores passwords or API keys
- **DOM-based only**: All actions performed through browser UI, not API

### Selector Maintenance

Binance UI selectors may change without notice. If the extension stops working:
1. Check `src/config/selectors.ts` for current selectors
2. Update selectors to match new Binance UI structure
3. Rebuild with `npm run build`
4. Reload extension in Chrome

### Known Limitations

- Only works on Binance Alpha BSC token pages
- Requires manual login if session expires
- Dependent on Binance UI structure (selectors may break with site updates)
- Chrome alarm minimum interval is 1 minute (we use 0.5 minutes for development)

## Troubleshooting

### Extension doesn't start
- Ensure you're on a valid Binance Alpha page: `https://www.binance.com/*/alpha/bsc/0x...`
- Check that you're logged into Binance
- Refresh the page and try again

### Orders not being placed
- Check popup for error messages
- Verify you have sufficient USDT balance
- Ensure no existing open orders (extension skips placement if orders exist)
- Wait for 15-second cooldown between attempts

### Metrics not updating
- Check browser console for errors (`F12` → Console)
- Verify extension context is valid (reload extension if needed)
- Check Chrome storage: `F12` → Application → Storage → Local Storage

### Balance not showing
- Ensure the trading panel is visible on the page
- Wait 2 seconds after page load for initial balance capture
- Check that "Available" USDT value is visible in the UI

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Run linter: `npm run lint`
5. Commit with descriptive message
6. Push and create a Pull Request

## License

MIT License - feel free to modify and distribute

## Disclaimer

This extension is for educational and personal use only. Use at your own risk. The authors are not responsible for any trading losses or account issues that may occur from using this automation tool.

**Trading involves risk. Never invest more than you can afford to lose.**
