import { Order } from "../trade/Orderbook";

export const CREATE_ORDER = "CREATE_ORDER";
export const CANCEL_ORDER = "CANCEL_ORDER";
export const ON_RAMP = "ON_RAMP";

export const GET_DEPTH = "GET_DEPTH";

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
        fills: {
          price: string;
          quantity: number;
          tradeId: string;
        }[];
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
      type: "BALANCE";
      payload: {
        [asset: string]: {
          available: number;
          locked: number;
        };
      };
    }
  | {
      type: "OPEN_ORDERS";
      payload: Order[];
    };
