import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { MarketSignal } from '../../market/interfaces/market-signal.interface.js';

@Injectable()
export class TelegramAlertService {
  private readonly logger = new Logger(
    TelegramAlertService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async sendSignal(signal: MarketSignal): Promise<void> {
    const token = this.configService.getOrThrow<string>(
      'TELEGRAM_BOT_TOKEN',
    );

    const chatId = this.configService.getOrThrow<string>(
      'TELEGRAM_CHAT_ID',
    );

    const message = this.createMessage(signal);

    await firstValueFrom(
      this.httpService.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        },
      ),
    );

    this.logger.log(
      `Telegram alert sent for ${signal.symbol}`,
    );
  }

  private createMessage(signal: MarketSignal): string {
    const directionEmoji =
      signal.direction === 'LONG' ? '🟢' : '🔴';

    return [
      '🚨 <b>MEXC Fair Price Alert</b>',
      '',
      `<b>Symbol:</b> ${signal.symbol}`,
      `<b>Direction:</b> ${directionEmoji} ${signal.direction}`,
      `<b>Deviation:</b> ${signal.deviationPercent}%`,
      '',
      `<b>Last Price:</b> ${signal.lastPrice}`,
      `<b>Fair Price:</b> ${signal.fairPrice}`,
      '',
      `<b>24h turnover:</b> ${signal.volume24hUsdt.toLocaleString()} USDT`,
      `<b>Max leverage:</b> ${signal.maxLeverage}x`,
    ].join('\n');
  }
}