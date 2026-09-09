import type { Fill, Order, UserBalance } from "./common";

export type MessageToApi =
  | {
      type: "DEPTH";
      payload: {
        bids: [string, string][];
        asks: [string, string][];
      };
    }
  | {
      type: "ORDER_PLACED";
      payload: {
        orderId: string;
        executedQuantity: number;
        fills: Fill[];
      };
    }
  | {
      type: "ORDER_CANCELLED";
      payload: {
        orderId: string;
        executedQuantity: number;
        remainingQty: number;
        error?: string;
      };
    }
  | {
      type: "ON_RAMP_SUCCESS";
      payload: {
        userId: string;
        asset: string;
        amount: string;
        timestamp?: number;
      };
    }
  | {
      type: "ON_RAMP_FAILED";
      payload: {
        error: string;
      };
    }
  | {
      type: "BALANCE";
      payload: UserBalance;
    }
  | {
      type: "OPEN_ORDERS";
      payload: Order[];
    };
