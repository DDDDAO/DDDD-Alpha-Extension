# Repository Guidelines

## Project Structure & Module Organization
- `extension/` contains the MV3 surface (manifest, popup, options placeholder, static assets) and the compiled `dist/` bundle that Chrome consumes.
- `src/background/`, `src/content/`, and `src/options/` house TypeScript entry points for the service worker, in-page automation, and options UI; shared selectors and defaults live under `src/config/`, while `src/lib/` exposes messaging, storage, and timing utilities.
- `tests/unit/` and `tests/e2e/` mirror the runtime code for Vitest unit coverage and future Playwright-style end-to-end checks; `tools/` is reserved for MCP helpers and diagnostics referenced throughout the project.

## Build, Test, and Development Commands
- `npm install` — install TypeScript, ESLint, and Chrome typings (run locally; network install is blocked in CI bots).
- `npm run dev` — start `tsc --watch` for incremental builds while iterating on the background or content logic.
- `npm run build` — emit production-ready JavaScript into `extension/dist/`; reload this folder in `chrome://extensions` after each run.
- `npm run test` — execute Vitest suites; pair with `npm run lint` to enforce ESLint + Prettier before reviews.

## Coding Style & Naming Conventions
- Use TypeScript with strict null checks enabled; prefer async/await and avoid mixing `then` chains.
- Name background modules `*.worker.ts`, content scripts `*.content.ts`, and shared helpers descriptively (e.g., `storage.repository.ts`).
- Format with Prettier’s default 2-space indentation and ensure imports remain sorted and side-effect free.

## Testing Guidelines
- Place unit specs beside the related module in `tests/unit/**`; follow the `*.spec.ts` suffix and target parsing, storage, and messaging helpers first.
- Stage browser-level scenarios under `tests/e2e/` to validate alarm scheduling, popup controls, and DOM automation once selectors stabilize.
- Capture edge cases: empty trade history, modal confirmations, and disabled automation states; document known gaps in PR descriptions.

## Commit & Pull Request Guidelines
- Use concise imperative subjects (e.g., `feat: track daily buy volume`) and include context in the body when touching automation flows.
- Reference related issues, list manual verification steps (build, reload extension, smoke test in Binance), and attach screenshots of popup changes when relevant.
- Ensure `npm run build`, `npm run lint`, and `npm run test` succeed locally before requesting review; highlight remaining TODOs or blocked items for follow-up.

## Automation & Operational Notes
- Automation starts only when toggled from the popup; background alarms run every 30 s while enabled and persist UTC-scoped buy-volume and alpha-point metrics.
- Maintain an authenticated Binance session, monitor selector drift under `src/config/selectors.ts`, and adjust delays or permissions in `extension/manifest.json` as site behavior evolves.
