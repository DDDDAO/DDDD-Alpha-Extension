# DDDD Alpha Extension Release Reference

## Release Checklist

- [ ] Update `manifest.json` and `package.json` version numbers and tag the release commit.
- [ ] Review recent changes and draft release notes (features, fixes, breaking changes, migration steps).
- [ ] Run `npm install` to ensure dependencies are up to date.
- [ ] Execute quality gates:
  - [ ] `npm run lint`
  - [ ] `npm run test`
- [ ] Produce a fresh production build with `npm run build`.
- [ ] Smoke-test the built extension via `Load unpacked` pointing to `extension/`.
- [ ] Generate the distribution archive with `npm run zip` and confirm `manifest.json` sits at the root of the zip.
- [ ] Verify icons/screenshots meet Chrome Web Store requirements (128×128 icon, 1280×800 screenshots, <2 MB each).
- [ ] Update documentation (README, FAQs, support links) if user-facing behaviour changed.
- [ ] Publish GitHub release attaching `dddd-alpha-extension.zip` and the drafted notes.
- [ ] Submit the new version to the Chrome Web Store and monitor for review feedback.
- [ ] Announce availability in community channels after Chrome approval.

## Release Guide

### 1. Prepare the Release

1. Sync `main` and ensure your working tree is clean.
2. Update `manifest.json` and `package.json` `version` fields (Chrome rejects duplicate versions).
3. Capture highlights since the last release to form draft notes (features, fixes, known issues).

### 2. Run Quality Checks

1. Install dependencies (`npm install`).
2. Run `npm run lint` and address any reported issues.
3. Run `npm run test`; investigate and resolve failures.

### 3. Build & Verify Locally

1. Execute `npm run build`. The output should populate `extension/dist`.
2. Load the unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked → select `extension/`).
3. Manually exercise critical flows (popup render, background alarms, Binance injection) and confirm there are no console errors.

### 4. Package the Release

1. Run `npm run zip`. This produces `dddd-alpha-extension.zip` with `manifest.json` at the root and the compiled `dist/` content.
2. Inspect the archive to confirm only production assets are present (no source maps, no stray configs).

### 5. Publish to Repositories

1. Commit changes, push to `main`, and create an annotated git tag (`git tag -a vX.Y.Z -m "Release vX.Y.Z"`).
2. Open a GitHub release for the tag, paste the release notes, and attach `dddd-alpha-extension.zip`.

### 6. Submit to Chrome Web Store

1. Visit the Chrome Web Store Developer Dashboard and select the extension listing.
2. Upload the new zip under **Package** → **Upload new package**.
3. Refresh the store listing metadata as needed:
   - Title, short summary, and long description (keep aligned with release notes).
   - Primary category, subcategory, supported languages, and contact email/website.
   - Privacy disclosures, data collection statements, and promotional tags (if required).
   - Required artwork: 128×128 icon (PNG) and at least one screenshot (1280×800 or 640×400, <2 MB).
4. Choose visibility and target regions, acknowledge policy checkboxes, and submit for review.

## Chrome Web Store Listing Copy

Keep the following copy handy when updating the Chrome listing. Adjust wording, contact details, and localisation to match the current release as needed.

### Title & Summary

- **Title**: `DDDD Alpha Extension`
- **Short Summary (≤132 chars)**: `Automate Binance Alpha VWAP trades with stability scoring, dashboards, and smart stops.`
- **简短描述**：`自动化币安 Alpha VWAP 交易，提供稳定性评分、实时看板和智能停止。`

### Long Description

```
DDDD Alpha Extension is an automation co-pilot for Binance Alpha farmers. It combines a live stability dashboard, VWAP-based trading assistant, and airdrop intelligence so you can focus on strategy instead of repetitive clicks.

Key features
• Auto VWAP trading: Calculates buy/sell prices, places balanced orders, and tracks results in real time.
• Stability insights: Scores Binance Alpha pairs every 8 seconds to surface the most efficient farming targets.
• Progress tracking: Visualises daily volume, Alpha points, slippage, trade count, and cost ratios on a single screen.
• Smart stop rules: Pauses automation when targets are reached or risk conditions change.
• Airdrop radar: Highlights active and upcoming campaigns with token, allocation, and timeline details.

Usage tips
• Tune price offset and points factor to balance speed versus slippage.
• Use separate Chrome profiles to manage multiple accounts safely.
• Test the draft release via "Load unpacked" before pushing updates to the store.

Privacy
• Runs entirely in the browser; no passwords or API keys are collected.
• Stores state with `chrome.storage` locally on your device.
• Open-source at https://github.com/DDDDAO/DDDD-Alpha-Extension.

Disclaimer: Trading involves risk. Review Binance Alpha rules and operate within your jurisdiction’s regulations.
```

### 长描述（简体中文）

```
DDDD Alpha Extension 是 Binance Alpha 刷分的自动化助手，提供实时稳定性看板、基于 VWAP 的交易助手以及空投情报，让你专注策略而不是重复点击。

核心功能
• 自动 VWAP 交易：计算买/卖价格，自动平衡挂单并实时记录结果。
• 稳定性洞察：每 8 秒评分 Binance Alpha 交易对，优先推荐高效刷分标的。
• 进度追踪：在一个面板中查看每日成交量、Alpha 积分、滑点、成交次数与成本比例。
• 智能停止规则：达成目标或触发风险条件时自动暂停。
• 空投雷达：展示正在进行与即将开始的空投活动，包含代币、额度与时间表。

使用建议
• 调整价格偏移与积分系数，在速度与磨损之间取得平衡。
• 通过多个 Chrome 用户配置文件管理多账号，隔离更安全。
• 发布前先用 “加载已解压的扩展程序” 自测，确保功能正常。

隐私说明
• 仅在浏览器本地运行，不会收集密码或 API Key。
• 使用 `chrome.storage` 在本地保存状态，不会上传到云端。
• 完全开源：https://github.com/DDDDAO/DDDD-Alpha-Extension。

免责声明：交易存在风险。请遵守 Binance Alpha 规则，并在法律允许的范围内操作。
```

### Metadata

- **Primary Category**: `Productivity`
- **Subcategory**: `Personal Productivity` (or `Developer Tools` if more relevant for your user base)
- **Supported Languages**: `English (en)`, `简体中文 (zh-CN)`
- **Contact Email**: `support@ddddao.top` (replace if a different inbox is preferred)
- **Developer Website / Support URL**: `https://github.com/DDDDAO/DDDD-Alpha-Extension`

### Privacy & Data Use

- **User data collection**: Declare "No data collected".
- **Usage of permissions**: Explain that `alarms`, `storage`, `tabs`, and `declarativeNetRequestWithHostAccess` are used for scheduling jobs, persisting local settings, querying the active Alpha tab, and optimising network calls.
- **Data safety form**: Indicate that data is stored locally and never sent off-device; no third-party sharing.
- **Privacy policy URL**: Link to project documentation or a hosted policy (e.g., `https://github.com/DDDDAO/DDDD-Alpha-Extension/blob/main/PRIVACY.md`). Create or update the file before submission.

### Creative Assets

- **Icons**: 128×128 PNG with transparent background matching the extension branding.
- **Screenshots**: At least one 1280×800 (or 640×400) PNG/JPG showing the popup dashboard, automation controls, and stability board. Highlight unique selling points via captions.
- **Promotional Tile (optional)**: 440×280 PNG aligned with Chrome branding guidelines.

## Privacy Practices Reference

Use the following canned responses when completing the Chrome Web Store Privacy practices tab. Localise as needed.

### Single Purpose

- **English**: `Enable Binance Alpha users to automate VWAP-based trading tasks and monitor stability/airdrop insights from a single dashboard.`
- **简体中文**：`帮助 Binance Alpha 用户自动执行基于 VWAP 的交易任务，并在一个面板内监控稳定性与空投情报。`

### Permission & Feature Justifications

| Item | Justification (English) | 说明（中文） |
| --- | --- | --- |
| `alarms` | Schedule recurring background jobs (e.g., refreshing Alpha airdrop and price data every 30 minutes). | 定期触发后台任务（每 30 分钟刷新 Alpha 空投与价格数据）。 |
| `storage` | Persist user preferences, automation state, and cached Alpha data using `chrome.storage.local`. | 通过 `chrome.storage.local` 保存用户偏好、自动化状态与 Alpha 缓存数据。 |
| `tabs` | Detect the active Binance Alpha tab to inject helpers and update the popup state. | 识别当前的 Binance Alpha 标签页，以便注入脚本并同步弹窗状态。 |
| `declarativeNetRequestWithHostAccess` | Adjust request headers for `https://alpha123.uk` API calls so the browser can fetch airdrop data without CORS blocks. | 为 `https://alpha123.uk` 接口调整请求头，避免 CORS 拒绝并获取空投数据。 |
| Host permissions (`https://www.binance.com/*`, `https://alpha123.uk/*`) | Needed to run content scripts on Binance Alpha pages and request supporting Alpha123 data. | 在 Binance Alpha 页面运行内容脚本并访问 Alpha123 数据源所必需。 |
| Remote code use | The extension only requests JSON data from `https://alpha123.uk` to populate dashboards; it never executes remote scripts. | 扩展仅从 `https://alpha123.uk` 拉取 JSON 数据用于看板展示，绝不执行远程脚本。 |

### Data Usage Certification

- Confirm in the dashboard that no user data is sold, shared, or used for unrelated purposes.
- State that all automation logic runs locally and data remains on-device unless sent by the user to Binance.

### Account Contact Requirements

- **Contact email**: Set to `support@ddddao.top` (or another monitored inbox) on the **Account** tab.
- Complete the email verification flow before submitting the release.

### 7. Post-Release Follow-up

1. Monitor email for review feedback or publish confirmation (1–3 business days typical).
2. Once live, announce the release in community channels and update any support docs.
3. Track user feedback or error reports and log follow-up tasks for the next iteration.
