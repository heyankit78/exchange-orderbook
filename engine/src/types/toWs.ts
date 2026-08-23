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
