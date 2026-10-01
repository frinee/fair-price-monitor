import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { MarketModule } from './market/market.module.js';
import { AlertsModule } from './alerts/alerts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DEVIATION_THRESHOLD_PERCENT: Joi.number()
          .positive()
          .default(7),

        MIN_VOLUME_24H_USDT: Joi.number()
          .min(0)
          .default(1_000_000),

        MIN_LEVERAGE: Joi.number()
          .integer()
          .positive()
          .default(50),
        
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        TELEGRAM_CHAT_ID: Joi.string().required(),

        ALERT_COOLDOWN_SECONDS: Joi.number()
          .integer()
          .min(0)
          .default(300),
      }),
    }),

    MarketModule,

    AlertsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}