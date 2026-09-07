export const SUBSCRIBE = "SUBSCRIBE";
export const UNSUBSCRIBE = "UNSUBSCRIBE";
export const AUTH = "AUTH";

export type IncomingWsMessage =
  | {
      method: typeof SUBSCRIBE;
      params: string[];
    }
  | {
      method: typeof UNSUBSCRIBE;
      params: string[];
    }
  | {
      method: typeof AUTH;
      token: string;
    };

export type WsMessage = {
  stream: string;

  data:
    | {
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
        e: "depth";
        b?: [string, string][];
        a?: [string, string][];
      }
    | {
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
        filled: string;
        status: "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
      }
    | {
        e: "my_trade";
        t: string;
        p: string;
        q: string;
        s: string;
        side: "buy" | "sell";
        timestamp: number;
      };
};
