# DDDD Alpha Extension

一个用于在币安 Alpha 页面上自动计算 VWAP（成交量加权平均价格）并执行交易的 Chrome 浏览器扩展。

## 安装方法

### 方式一：使用预构建版本（推荐）

1. **下载扩展**：
   - 从本仓库下载 `dddd-alpha-extension.zip`
2. **解压 zip 文件**：
   - 将 `dddd-alpha-extension.zip` 解压到你电脑上的一个文件夹
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
1. 方式二：从源码构建

```bash
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension
npm install
npm run build
```

然后按照方式一的步骤 3-6 加载 `extension/` 文件夹。

## 使用说明

1. **打开币安 Alpha 页面**
   访问任意币安 Alpha BSC 代币页面，例如：
   `https://www.binance.com/zh-CN/alpha/bsc/0x...`

2. **打开扩展**
   点击浏览器工具栏中的扩展图标

3. **配置参数**（可选）
   - **价格偏移百分比**：控制订单价格与 VWAP 的偏离程度（默认 0.01%）
   - **积分系数**：用于调整积分累积速度（默认 1，4 倍代币可修改为 4）
   - **积分目标**：达到此积分后自动停止（默认 15）

4. **启动自动化**
   点击**启动**按钮，扩展将：
   - 每 30 秒自动计算 VWAP
   - 在 VWAP + 偏移价格处下限价买单
   - 同时创建反向卖单
   - 自动跟踪交易量和积分

5. **停止自动化**
   点击**停止**按钮即可暂停

## 重要提示

- ⚠️ 需要登录币安账户
- ⚠️ 确保账户有足够的 USDT 余额
- ⚠️ 交易有风险，投资需谨慎
- ⚠️ 此工具仅供学习和个人使用

## 许可证

MIT 许可证 - 可自由修改和分发

## 免责声明

本扩展仅供教育和个人使用。使用风险自负。作者对使用此工具可能产生的任何交易损失或账户问题概不负责。

---

# DDDD Alpha Extension

A Chrome extension for automating VWAP (Volume-Weighted Average Price) calculation and trade execution on Binance Alpha pages.

## Installation

### Option 1: Use Pre-built Extension (Recommended)

1. Download `dddd-alpha-extension.zip`
2. Extract to any folder
3. Open Chrome and visit `chrome://extensions`
4. Enable **Developer mode** (toggle in top-right)
5. Click **Load unpacked**
6. Select the extracted folder

### Option 2: Build from Source

```bash
git clone git@github.com:DDDDAO/dddd-alpha-extension.git
cd dddd-alpha-extension
npm install
npm run build
```

Then follow steps 3-6 from Option 1 to load the `extension/` folder.

## Usage

1. **Open Binance Alpha Page**
   Visit any Binance Alpha BSC token page, e.g.:
   `https://www.binance.com/en/alpha/bsc/0x...`

2. **Open Extension**
   Click the extension icon in your browser toolbar

3. **Configure Settings** (Optional)
   - **Price Offset Percent**: Controls order price deviation from VWAP (default 0.01%)
   - **Points Factor**: Adjusts point accumulation speed (default 1, use 4 for 4x tokens)
   - **Points Target**: Auto-stops when this point threshold is reached (default 15)

4. **Start Automation**
   Click **Start** button. The extension will:
   - Calculate VWAP every 30 seconds
   - Place limit buy orders at VWAP + offset
   - Create reverse sell orders
   - Track volume and points automatically

5. **Stop Automation**
   Click **Stop** button to pause

## Important Notes

- ⚠️ Binance account login required
- ⚠️ Ensure sufficient USDT balance
- ⚠️ Trading involves risk
- ⚠️ For educational and personal use only

## License

MIT License - feel free to modify and distribute

## Disclaimer

This extension is for educational and personal use only. Use at your own risk. The authors are not responsible for any trading losses or account issues resulting from using this tool.
