import type { Side } from "./engine";

export type OrderUpdateMessage = {
  type: "ORDER_UPDATE";
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
        cancelled?: boolean;
      };
};

export type TradeAddedMessage = {
  type: "TRADE_ADDED";
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
