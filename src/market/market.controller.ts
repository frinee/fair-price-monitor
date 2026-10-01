import { Controller, Get } from '@nestjs/common';
import { MarketService } from './market.service.js';

@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
  ) {}

  @Get('status')
  getStatus() {
    return this.marketService.getStatus();
  }

  @Get('tickers')
  getTickers() {
    return this.marketService.getTickers();
  }

  @Get('signals')
getSignals() {
  return this.marketService.getSignals();
}
}