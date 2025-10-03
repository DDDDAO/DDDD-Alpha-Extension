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
