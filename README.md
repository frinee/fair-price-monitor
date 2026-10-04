# Fair Price Monitor

A real-time MEXC futures monitoring service built with Node.js, TypeScript and NestJS.

The application compares the latest traded price with the MEXC fair price and sends a Telegram alert when the deviation matches the configured filters. It is a monitoring tool only: it does not place orders and does not require access to an exchange account.

## Features

- Real-time MEXC futures ticker updates through WebSocket
- Fair-price deviation calculation for active USDT contracts
- Filters by minimum deviation, 24-hour turnover and maximum leverage
- Per-symbol alert cooldown to prevent duplicate Telegram notifications
- Automatic WebSocket heartbeat and reconnect
- REST endpoints for service status, current tickers and active signals
- Configuration through environment variables

## How it works

1. Contract metadata is loaded from the MEXC REST API.
2. The service connects to the public MEXC WebSocket and subscribes to ticker updates.
3. Incoming prices are parsed and validated.
4. The percentage deviation is calculated:

   ```text
   ((lastPrice - fairPrice) / fairPrice) * 100
   ```

5. Signals are filtered by deviation, 24-hour turnover and leverage.
6. A per-symbol cooldown prevents repeated alerts.
7. Matching signals are sent to Telegram.

## Tech stack

- Node.js
- TypeScript
- NestJS
- WebSocket (`ws`)
- Axios / NestJS HTTP module
- Telegram Bot API

## Project structure

```text
src/
├── alerts/                 # Telegram notification module
├── market/                 # MEXC connection and signal processing
│   ├── interfaces/         # Market signal types
│   ├── market.controller.ts
│   ├── market.module.ts
│   └── market.service.ts
├── app.module.ts
└── main.ts
```

## Installation

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Fill in your Telegram bot token and chat ID in `.env`.

## Configuration

| Variable | Description | Example |
| --- | --- | --- |
| `DEVIATION_THRESHOLD_PERCENT` | Minimum absolute deviation between last and fair price | `7` |
| `MIN_VOLUME_24H_USDT` | Minimum 24-hour turnover in USDT | `1000000` |
| `MIN_LEVERAGE` | Minimum maximum leverage supported by the contract | `50` |
| `ALERT_COOLDOWN_SECONDS` | Per-symbol Telegram alert cooldown | `300` |
| `MEXC_WS_URL` | Public MEXC futures WebSocket URL | `wss://contract.mexc.com/edge` |
| `MEXC_REST_URL` | MEXC futures REST base URL | `https://contract.mexc.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Required |
| `TELEGRAM_CHAT_ID` | Target Telegram chat ID | Required |

## Run

Development mode:

```bash
npm run start:dev
```

Production build:

```bash
npm run build
npm run start:prod
```

The application runs on `http://localhost:3000` by default.

## API endpoints

| Endpoint | Description |
| --- | --- |
| `GET /market/status` | Connection status, loaded contract/ticker counts and active settings |
| `GET /market/tickers` | Latest validated MEXC tickers held in memory |
| `GET /market/signals` | Signals currently matching all configured filters |

## Notes

- Runtime state and alert cooldowns are stored in memory and are reset after an application restart.
- `.env` is excluded from Git and must never be committed.
- This project is intended for monitoring and educational purposes. A market signal does not guarantee a profitable trade.

