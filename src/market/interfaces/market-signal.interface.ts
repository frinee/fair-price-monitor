export interface MarketSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  lastPrice: number;
  fairPrice: number;
  deviationPercent: number;
  volume24hUsdt: number;
  maxLeverage: number;
}