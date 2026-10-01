import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import WebSocket from 'ws';
import { TelegramAlertService } from '../alerts/telegram-alert/telegram-alert.service.js';
import { MarketSignal } from './interfaces/market-signal.interface.js';

export interface MexcTicker {
  symbol: string;
  lastPrice: number;
  fairPrice: number;
  amount24: number;
  volume24: number;
}

export interface MexcContract {
  symbol: string;
  quoteCoin: string;
  maxLeverage: number;
  state: number;
}

@Injectable()
export class MarketService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MarketService.name);

  private socket: WebSocket | null = null;

  private pingInterval: NodeJS.Timeout | null = null;

  private reconnectTimeout: NodeJS.Timeout | null = null;

  private isConnected = false;
  private isShuttingDown = false;
  private isProcessingSignals = false;

  private readonly tickers = new Map<
    string,
    MexcTicker
  >();

  private readonly contracts = new Map<
    string,
    MexcContract
  >();

  private readonly lastAlertAt = new Map<
    string,
    number
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly telegramAlertService: TelegramAlertService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadContracts();
    this.connect();
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;

    this.stopPing();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.socket?.close();
  }

  private async loadContracts(): Promise<void> {
    const restUrl =
      this.configService.getOrThrow<string>(
        'MEXC_REST_URL',
      );

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${restUrl}/api/v1/contract/detail`,
        ),
      );

      const contracts = response.data?.data;

      if (!Array.isArray(contracts)) {
        throw new Error(
          'Invalid MEXC contracts response',
        );
      }

      this.contracts.clear();

      for (const item of contracts) {
        const contract: MexcContract = {
          symbol: String(item.symbol),
          quoteCoin: String(item.quoteCoin),
          maxLeverage: Number(item.maxLeverage),
          state: Number(item.state),
        };

        const isActiveUsdtContract =
          contract.quoteCoin === 'USDT' &&
          contract.state === 0 &&
          contract.maxLeverage > 0;

        if (!isActiveUsdtContract) {
          continue;
        }

        this.contracts.set(
          contract.symbol,
          contract,
        );
      }

      this.logger.log(
        `Loaded ${this.contracts.size} active MEXC contracts`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown contracts error';

      this.logger.error(
        `Cannot load MEXC contracts: ${message}`,
      );
    }
  }

  private connect(): void {
    const wsUrl =
      this.configService.getOrThrow<string>(
        'MEXC_WS_URL',
      );

    this.logger.log(
      `Connecting to MEXC WebSocket: ${wsUrl}`,
    );

    this.socket = new WebSocket(wsUrl);

    this.socket.on('open', () => {
      this.isConnected = true;

      this.logger.log(
        'Connected to MEXC WebSocket',
      );

      this.subscribeToTickers();
      this.startPing();
    });

    this.socket.on(
      'message',
      (message: WebSocket.RawData) => {
        this.handleMessage(message);
      },
    );

    this.socket.on('close', () => {
      this.isConnected = false;

      this.stopPing();

      this.logger.warn(
        'MEXC WebSocket disconnected',
      );

      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('error', (error) => {
      this.logger.error(
        `MEXC WebSocket error: ${error.message}`,
      );
    });
  }

  private subscribeToTickers(): void {
    this.send({
      method: 'sub.tickers',
      param: {},
      gzip: false,
    });

    this.logger.log(
      'Subscribed to MEXC tickers',
    );
  }

  private startPing(): void {
    this.stopPing();

    this.pingInterval = setInterval(() => {
      this.send({
        method: 'ping',
      });
    }, 15_000);
  }

  private stopPing(): void {
    if (!this.pingInterval) {
      return;
    }

    clearInterval(this.pingInterval);
    this.pingInterval = null;
  }

  private scheduleReconnect(): void {
    if (
      this.reconnectTimeout ||
      this.isShuttingDown
    ) {
      return;
    }

    this.logger.log(
      'Reconnecting to MEXC in 5 seconds',
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 5_000);
  }

  private send(data: object): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    this.socket.send(JSON.stringify(data));
  }

  private handleMessage(
    message: WebSocket.RawData,
  ): void {
    try {
      const response = JSON.parse(
        message.toString(),
      );

      if (response.channel === 'pong') {
        return;
      }

      if (
        response.channel !== 'push.tickers' ||
        !Array.isArray(response.data)
      ) {
        return;
      }

      for (const item of response.data) {
        const ticker: MexcTicker = {
          symbol: String(item.symbol),
          lastPrice: Number(item.lastPrice),
          fairPrice: Number(item.fairPrice),
          amount24: Number(item.amount24 ?? 0),
          volume24: Number(item.volume24 ?? 0),
        };

        const isValidTicker =
          ticker.symbol.length > 0 &&
          Number.isFinite(ticker.lastPrice) &&
          Number.isFinite(ticker.fairPrice) &&
          ticker.lastPrice > 0 &&
          ticker.fairPrice > 0;

        if (!isValidTicker) {
          continue;
        }

        this.tickers.set(
          ticker.symbol,
          ticker,
        );
      }

      this.logger.debug(
        `Received ${response.data.length} MEXC tickers`,
      );

      void this.processSignals();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown parsing error';

      this.logger.error(
        `Cannot process MEXC message: ${message}`,
      );
    }
  }

  private async processSignals(): Promise<void> {
    if (this.isProcessingSignals) {
      return;
    }

    this.isProcessingSignals = true;

    try {
      const signals = this.getSignals();

      const cooldownSeconds = Number(
        this.configService.get(
          'ALERT_COOLDOWN_SECONDS',
          300,
        ),
      );

      const cooldownMilliseconds =
        cooldownSeconds * 1000;

      for (const signal of signals) {
        const now = Date.now();

        const lastAlertTime =
          this.lastAlertAt.get(
            signal.symbol,
          ) ?? 0;

        const cooldownFinished =
          now - lastAlertTime >=
          cooldownMilliseconds;

        if (!cooldownFinished) {
          continue;
        }

        this.lastAlertAt.set(
          signal.symbol,
          now,
        );

        try {
          await this.telegramAlertService.sendSignal(
            signal,
          );
        } catch (error) {
          this.lastAlertAt.delete(
            signal.symbol,
          );

          const message =
            error instanceof Error
              ? error.message
              : 'Unknown Telegram error';

          this.logger.error(
            `Cannot send ${signal.symbol} alert: ${message}`,
          );
        }
      }
    } finally {
      this.isProcessingSignals = false;
    }
  }

  getSignals(): MarketSignal[] {
    const minimumDeviation = Number(
      this.configService.get(
        'DEVIATION_THRESHOLD_PERCENT',
        7,
      ),
    );

    const minimumVolume = Number(
      this.configService.get(
        'MIN_VOLUME_24H_USDT',
        1_000_000,
      ),
    );

    const minimumLeverage = Number(
      this.configService.get(
        'MIN_LEVERAGE',
        50,
      ),
    );

    return Array.from(
      this.tickers.values(),
    )
      .map((ticker): MarketSignal => {
        const signedDeviation =
          ((ticker.lastPrice -
            ticker.fairPrice) /
            ticker.fairPrice) *
          100;

        const contract =
          this.contracts.get(
            ticker.symbol,
          );

        return {
          symbol: ticker.symbol,

          direction:
            signedDeviation > 0
              ? 'SHORT'
              : 'LONG',

          lastPrice: ticker.lastPrice,
          fairPrice: ticker.fairPrice,

          deviationPercent: Number(
            Math.abs(
              signedDeviation,
            ).toFixed(4),
          ),

          volume24hUsdt:
            ticker.amount24,

          maxLeverage:
            contract?.maxLeverage ?? 0,
        };
      })
      .filter((signal) => {
        return (
          signal.deviationPercent >=
            minimumDeviation &&
          signal.volume24hUsdt >=
            minimumVolume &&
          signal.maxLeverage >=
            minimumLeverage
        );
      })
      .sort(
        (firstSignal, secondSignal) =>
          secondSignal.deviationPercent -
          firstSignal.deviationPercent,
      );
  }

  getStatus() {
    return {
      status: this.isConnected
        ? 'connected'
        : 'disconnected',

      exchange: 'MEXC',

      tickersCount:
        this.tickers.size,

      contractsCount:
        this.contracts.size,

      activeSignalsCount:
        this.getSignals().length,

      settings: {
        deviationThresholdPercent:
          Number(
            this.configService.get(
              'DEVIATION_THRESHOLD_PERCENT',
              7,
            ),
          ),

        minimumVolume24hUsdt:
          Number(
            this.configService.get(
              'MIN_VOLUME_24H_USDT',
              1_000_000,
            ),
          ),

        minimumLeverage:
          Number(
            this.configService.get(
              'MIN_LEVERAGE',
              50,
            ),
          ),

        alertCooldownSeconds:
          Number(
            this.configService.get(
              'ALERT_COOLDOWN_SECONDS',
              300,
            ),
          ),
      },

      timestamp: new Date().toISOString(),
    };
  }

  getTickers(): MexcTicker[] {
    return Array.from(
      this.tickers.values(),
    );
  }
}