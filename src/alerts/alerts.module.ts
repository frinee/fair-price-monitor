import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TelegramAlertService } from './telegram-alert/telegram-alert.service.js';

@Module({
  imports: [HttpModule],
  providers: [TelegramAlertService],
  exports: [TelegramAlertService],
})
export class AlertsModule {}