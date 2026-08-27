export const SUBSCRIBE = "SUBSCRIBE";
export const UNSUBSCRIBE = "UNSUBSCRIBE";

export type IncomingWsMessage =
  | {
      method: typeof SUBSCRIBE;
      params: string[];
    }
  | {
      method: typeof UNSUBSCRIBE;
      params: string[];
    };

export type WsMessage = {
  stream: string;

  data:
    | {
        // TICKER
        e: "ticker";
        id: number;
        c?: string;
        h?: string;
        l?: string;
        v?: string;
        V?: string;
        s?: string;
      }
    | {
        // DEPTH
        e: "depth";
        b?: [string, string][];
        a?: [string, string][];
      }
    | {
        // PUBLIC TRADE
        e: "trade";
        t: string;
        m: boolean;
        p: string;
        q: string;
        s: string;
      }
    | {
        e: "order_update";
        orderId: string;
        filled: number;
        status: "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
      }
    | {
        // PRIVATE USER TRADE
        e: "my_trade";
        t: string;
        p: string;
        q: string;
        s: string;
        side: "buy" | "sell";
        timestamp: number;
      };
};

export type TickerUpdateMessage = {
  type: "ticker";
  data: {
    c?: string;
    h?: string;
    l?: string;
    v?: string;
    V?: string;
    s?: string;
    id: number;
    e: "ticker";
  };
};

export type DepthUpdateMessage = {
  type: "depth";
  data: {
    b?: [string, string][];
    a?: [string, string][];
    id: number;
    e: "depth";
  };
};

export type OutgoingMessage = TickerUpdateMessage | DepthUpdateMessage;
