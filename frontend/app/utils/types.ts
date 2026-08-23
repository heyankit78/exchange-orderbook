export interface KLine {
  close: string;
  end: string;
  high: string;
  low: string;
  open: string;
  quoteVolume: string;
  start: string;
  trades: string;
  volume: string;
}

export interface Trade {
  id: number;
  isBuyerMaker: boolean;
  price: string;
  quantity: string;
  quoteQuantity: string;
  timestamp: number;
}

export interface Depth {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: string;
}

export interface Ticker {
  firstPrice: string;
  high: string;
  lastPrice: string;
  low: string;
  priceChange: string;
  priceChangePercent: string;
  quoteVolume: string;
  symbol: string;
  trades: string;
  volume: string;
}
export interface AssetBalance {
  available: number;
  locked: number;
}

export interface Balances {
  [asset: string]: AssetBalance;
}

export interface OpenOrder {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: "buy" | "sell";
  userId: string;
}
export interface OrderHistoryItem {
  orderId: string;
  market: string;
  side: "buy" | "sell";
  price: string;
  quantity: string;
  filled: string;
  remaining: string;
  status: "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
  createdAt?: string;
  updatedAt?: string;
}

export interface MyTrade {
  tradeId: string;
  market: string;
  price: string;
  quantity: string;
  quoteQuantity: string;
  side: "buy" | "sell";
  createdAt: string;
}
