# DDDD Alpha Extension Privacy Policy

_Last updated: 2025-10-05_

## Overview

DDDD Alpha Extension (“the Extension”) is an open-source project maintained by the DDDDAO community. It runs entirely within your browser and does not require server-side services provided by the developers. This policy explains what data the Extension accesses and how that data is used.

## Data Collection & Usage

- **No personal data collection**: The Extension does not collect, transmit, or sell any personally identifiable information, account credentials, or financial details.
- **Local automation data**: The Extension stores automation preferences, scheduling state, and cached Alpha dashboard data in `chrome.storage.local`. This data stays on your device and is only used to operate the extension features.
- **Binance Alpha interactions**: All trading actions simulated by the Extension occur within the Binance web interface using the credentials you are already logged in with. No additional data is sent to the developers.
- **Alpha123 data fetches**: The Extension requests JSON data from `https://alpha123.uk` to populate the stability and airdrop dashboards. Responses are processed locally and are not forwarded elsewhere.

## Permissions Justification

- `alarms`: Schedules background refresh jobs (e.g., updating airdrop and price data every 30 minutes).
- `storage`: Saves user settings, automation status, and cached dashboard data locally.
- `tabs`: Detects active Binance Alpha tabs so that helpers can interact with the correct page.
- `declarativeNetRequestWithHostAccess`: Adjusts request headers for `https://alpha123.uk` API calls to avoid CORS blocks.
- Host permissions for `https://www.binance.com/*` and `https://alpha123.uk/*`: Required to inject scripts on Binance Alpha pages and query Alpha123 APIs.

## Data Sharing & Selling

- The Extension does not share data with third parties.
- The Extension does not sell user data.
- The Extension does not transfer data outside the user’s device except when the user interacts with Binance or Alpha123 as part of the core functionality.

## Security Practices

- No remote code execution: All executable code ships within the Extension package. Remote JSON responses are parsed but never executed as code.
- Open-source transparency: The full source code is available at https://github.com/DDDDAO/DDDD-Alpha-Extension for public review.

## Contact

For questions about this policy or privacy-related concerns, please contact `support@ddddao.top`.

---

# DDDD Alpha Extension 隐私政策

_最后更新日期：2025-10-05_

## 概述

DDDD Alpha Extension（以下简称“本扩展”）由 DDDDAO 社区维护，完全在浏览器本地运行，不依赖开发者提供的服务器。本政策说明本扩展访问的数据及其使用方式。

## 数据收集与使用

- **不收集个人数据**：本扩展不会收集、传输或出售任何可识别个人身份的信息、账号凭证或财务数据。
- **本地自动化数据**：通过 `chrome.storage.local` 保存的自动化偏好、任务状态以及 Alpha 看板缓存数据仅用于扩展功能，并保留在本地设备上。
- **Binance Alpha 交互**：所有交易操作均在 Binance 网页端模拟完成，使用用户已登录的账号，本扩展不会向开发者发送任何附加数据。
- **Alpha123 数据请求**：扩展会从 `https://alpha123.uk` 拉取 JSON 数据，填充稳定性与空投看板。收到的数据仅在本地处理，不会上传至其他地方。

## 权限说明

- `alarms`：定时刷新空投和价格数据。
- `storage`：本地保存设置、自动化状态和仪表盘数据。
- `tabs`：识别当前活动的 Binance Alpha 标签页，确保脚本运行在正确页面。
- `declarativeNetRequestWithHostAccess`：调整访问 `https://alpha123.uk` 的请求头，避免 CORS 拒绝。
- 主机权限（`https://www.binance.com/*`、`https://alpha123.uk/*`）：用于在 Binance Alpha 页面注入脚本及访问 Alpha123 API。

## 数据共享与出售

- 不与第三方共享数据。
- 不出售用户数据。
- 除用户与 Binance 或 Alpha123 交互所需外，不会将数据传出本地设备。

## 安全措施

- 不执行远程代码：所有可执行代码均打包在扩展中，远程 JSON 仅用于数据展示。
- 开源透明：完整源代码公开于 https://github.com/DDDDAO/DDDD-Alpha-Extension ，欢迎审查。

## 联系方式

如有隐私相关疑问，请发送邮件至 `support@ddddao.top`。
