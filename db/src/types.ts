export type DbMessage =
  | {
      type: "TRADE_ADDED";
      data: {
        id: string;
        isBuyerMaker: boolean;
        price: string;
        quantity: string;
        quoteQuantity: string;
        timestamp: number;
        market: string;
        buyerUserId: string;
        sellerUserId: string;
      };
    }
  | {
      type: "ORDER_UPDATE";
      data: {
        orderId: string;
        executedQuantity: number;

        userId?: string;
        market?: string;
        price?: string;
        quantity?: string;
        side?: "buy" | "sell";

        cancelled?: boolean;
      };
    };
