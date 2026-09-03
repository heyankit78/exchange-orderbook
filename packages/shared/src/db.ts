import type { Side } from "./common";

export const ORDER_UPDATE = "ORDER_UPDATE";
export const TRADE_ADDED = "TRADE_ADDED";

export type OrderUpdateMessage = {
  type: typeof ORDER_UPDATE;
  data:
    | {
        orderId: string;
        userId: string;
        market: string;
        price: string;
        quantity: string;
        side: Side;
        executedQuantity: number;
      }
    | {
        orderId: string;
        executedQuantity: number;
        makerFilledQuantity?: number;
        cancelled?: boolean;
      };
};

export type TradeAddedMessage = {
  type: typeof TRADE_ADDED;
  data: {
    id: string;
    market: string;
    price: string;
    quantity: string;
    quoteQuantity: string;
    timestamp: number;
    buyerUserId: string;
    sellerUserId: string;
    isBuyerMaker: boolean;
  };
};

export type DbMessage = OrderUpdateMessage | TradeAddedMessage;
