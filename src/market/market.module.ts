import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlertsModule } from '../alerts/alerts.module.js';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';

@Module({
  imports: [
    HttpModule,
    AlertsModule,
  ],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}