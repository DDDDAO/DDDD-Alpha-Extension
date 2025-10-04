# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Alpha Auto Bot is a Chrome Manifest V3 extension that automates VWAP (Volume-Weighted Average Price) monitoring and trade execution on Binance Alpha pages. The extension uses a background service worker with alarms, content scripts for DOM interaction, and popup UI for control.

## Commands

### Development
- `npm run dev` — Start TypeScript watch mode for incremental compilation during development
- `npm run build` — Compile TypeScript to JavaScript, output to `extension/dist/`
- `npm run test` — Run Vitest unit tests (environment: jsdom, globals enabled)
- `npm run lint` — Run ESLint with TypeScript + Prettier rules

### Testing a single unit test
- `npm run test -- path/to/test.spec.ts` — Run a specific test file

### Extension Development Workflow
1. Run `npm run build` to compile TypeScript to `extension/dist/`
2. Load `extension/` directory in Chrome at `chrome://extensions` (enable Developer mode)
3. After code changes, run `npm run build` again and click "Reload" in Chrome Extensions page

**IMPORTANT**: Always run `npm run build` after every code update to ensure the extension uses the latest compiled code.

## Architecture

### Entry Points
- **Background Service Worker** (`src/background/index.worker.ts`): Manages scheduling via Chrome alarms (every 30s when enabled), handles start/stop/manual-refresh messages, calculates alpha points and daily metrics, persists state to Chrome storage
- **Content Script** (`src/content/main.content.ts`): Injected into Binance pages, executes VWAP calculations from limit trade history, automates order placement with reverse orders, polls every 1 second when automation is enabled
- **Popup UI** (`extension/popup.html` + `extension/popup.js`): User controls for starting/stopping automation, displays current metrics and errors

### Key Modules
- **`src/lib/storage.ts`**: Chrome storage abstraction for scheduler state (last run, errors, daily metrics, settings). State shape includes `isEnabled`, `isRunning`, `dailyBuyVolume`, `lastResult`, `settings` (priceOffsetPercent, tokenAddress, pointsFactor, pointsTarget)
- **`src/lib/messages.ts`**: Runtime message types for background ↔ content script communication (`RUN_TASK`, `TASK_COMPLETE`, `TASK_ERROR`, `CONTROL_START`, `CONTROL_STOP`, `MANUAL_REFRESH`)
- **`src/lib/tabs.ts`**: Tab management utilities for locating or creating Binance Alpha tabs
- **`src/config/selectors.ts`**: DOM selectors for Binance UI elements (trade history panel, token symbol, etc.). Selectors may drift with site updates
- **`src/config/defaults.ts`**: Default token address, alarm interval (0.5 min), price offset (0.01%), points factor (1), points target (15)

### Data Flow
1. Background worker creates Chrome alarm when automation is enabled
2. On alarm, background sends `RUN_TASK` message to content script
3. Content script:
   - Extracts limit trades from DOM
   - Calculates VWAP
   - Places limit buy order at VWAP + offset, with reverse sell order at VWAP - offset
   - Sends `TASK_COMPLETE` with metadata (averagePrice, buyVolumeDelta, tradeCount, currentBalance)
4. Background worker updates daily metrics:
   - Accumulates buy volume per UTC day
   - Calculates alpha points: `floor(log2(volume))` when volume ≥ 2
   - Tracks trade count, first/current balance, total cost
   - Auto-stops when points ≥ configured target
5. Popup polls storage state every second to display live updates

### Automation Behavior
- Automation starts only when toggled from popup
- Background alarm runs every 30 seconds while enabled
- Content script polls DOM every 1 second when automation is active
- Order placement has 15-second cooldown between attempts
- Login errors pause automation until user authenticates manually
- Points target auto-stop: when daily alpha points reach configured threshold, automation pauses and clears alarm

### Critical Implementation Details
- **React input manipulation**: Content script uses `Object.getOwnPropertyDescriptor` to set React-controlled input values, then dispatches `input` and `change` events
- **Order confirmation**: Uses randomized delay (1-3s) then polls for confirmation dialog button every 100ms for 2 seconds
- **Extension context validation**: Content script checks `chrome.runtime.id` validity before every message send; tears down polling if extension context is invalidated
- **Message retry logic**: Background worker retries tab messages up to 12 times with exponential backoff (250ms * attempt + 250ms) for "Receiving end does not exist" errors
- **Storage normalization**: All settings are clamped and validated when read from storage (priceOffsetPercent: 0-5%, pointsFactor: 1-1000, pointsTarget: 1-1000)

## File Organization
- `extension/` — Manifest V3 surface, popup HTML/JS, static assets, `dist/` compilation target
- `src/background/` — Service worker entry point
- `src/content/` — In-page automation logic
- `src/lib/` — Shared messaging, storage, tab utilities
- `src/config/` — Selectors and default configuration
- `tests/unit/` — Vitest specs for core logic
- `tests/e2e/` — Placeholder for future Playwright-style browser tests

## Coding Conventions
- TypeScript strict mode with `noImplicitAny` enabled
- Async/await preferred over `.then()` chains
- Background modules use `*.worker.ts` suffix, content scripts use `*.content.ts`
- Shared helpers use descriptive names (e.g., `storage.repository.ts` pattern not currently used but recommended for new helpers)
- Prettier format: 2-space indentation, imports sorted, no side-effect imports
- ESLint enforces import rules and TypeScript best practices

## Testing Strategy
- Unit tests live in `tests/unit/**/*.spec.ts` (mirror source structure)
- Target parsing, storage, messaging helpers first
- E2E tests in `tests/e2e/` for alarm scheduling, popup controls, DOM automation (not yet implemented)
- Edge cases to cover: empty trade history, modal confirmations, disabled automation states
- Document known gaps in PR descriptions

## Selector Maintenance
- Binance UI selectors may change without notice
- Selectors are configured in `src/config/selectors.ts`
- Content script has fallback logic for some selectors (e.g., trade history panel via `.order-4` class)
- Monitor for selector drift when site updates; adjust `SELECTORS` object as needed
- Permissions and delays configured in `extension/manifest.json`

## State Persistence
- All scheduler state stored in Chrome local storage under key `alpha-auto-bot::state`
- Content script also reads storage to sync automation enabled flag and settings (priceOffsetPercent, pointsFactor)
- Daily metrics reset at UTC day boundary (detected by comparing `date` field)
- Storage listeners in both background and content scripts for real-time sync
- always lint and format and check before npm run build