"use client";

import { useEffect, useState } from "react";
import { getDepth, getTicker, getTrades } from "../../utils/httpClient";
import { SignalingManager } from "../../utils/SignalingManager";
import { TradeHistory } from "./TradeHistory";
import { OrderBookView } from "./OrderBookView";

function depthPriceKey(price: string): string {
  const value = Number(price);

  return Number.isFinite(value) ? String(value) : price;
}

function mergeLevels(
  current: [string, string][],
  updates: [string, string][],
): [string, string][] {
  const map = new Map<string, string>();

  for (const [price, quantity] of current) {
    map.set(depthPriceKey(price), quantity);
  }

  for (const [price, quantity] of updates || []) {
    const key = depthPriceKey(price);

    if (Number(quantity) === 0) {
      map.delete(key);
    } else {
      map.set(key, quantity);
    }
  }

  return Array.from(map.entries());
}

export function Depth({ market }: { market: string }) {
  const [bids, setBids] = useState<[string, string][]>([]);
  const [asks, setAsks] = useState<[string, string][]>([]);
  const [price, setPrice] = useState<string>();

  const [activeView, setActiveView] = useState<"orderbook" | "trades">(
    "orderbook",
  );

  useEffect(() => {
    let cancelled = false;
    let snapshotApplied = false;

    const pendingDeltas: {
      bids?: [string, string][];
      asks?: [string, string][];
    }[] = [];

    const signaling = SignalingManager.getInstance();

    // ----------------------------------------
    // APPLY DEPTH DELTA
    // ----------------------------------------

    const applyDelta = (data: {
      bids?: [string, string][];
      asks?: [string, string][];
    }) => {
      setBids((originalBids) => {
        const merged = mergeLevels(originalBids, data.bids || []);

        merged.sort((a, b) => Number(b[0]) - Number(a[0]));

        return merged;
      });

      setAsks((originalAsks) => {
        const merged = mergeLevels(originalAsks, data.asks || []);

        merged.sort((a, b) => Number(a[0]) - Number(b[0]));

        return merged;
      });
    };

    // ----------------------------------------
    // DEPTH CALLBACK
    // ----------------------------------------

    const handleDepth = (data: {
      bids?: [string, string][];
      asks?: [string, string][];
    }) => {
      if (cancelled) {
        return;
      }

      console.log("🔥 LIVE DEPTH:", data);

      // REST snapshot has not arrived yet.
      // Store WS updates temporarily.
      if (!snapshotApplied) {
        pendingDeltas.push(data);

        return;
      }

      applyDelta(data);
    };

    // ----------------------------------------
    // PUBLIC TRADE CALLBACK
    // ----------------------------------------

    const handleTrade = (trade: {
      tradeId: string;
      price: string;
      quantity: string;
      market: string;
      isBuyerMaker: boolean;
      timestamp: number;
    }) => {
      if (cancelled) {
        return;
      }

      if (trade.market !== market) {
        return;
      }

      console.log("🔥 LIVE PUBLIC TRADE:", trade);

      // update middle "Last Price"
      setPrice(String(trade.price));
    };

    // ----------------------------------------
    // REGISTER CALLBACKS
    // ----------------------------------------

    signaling.registerCallback("depth", handleDepth, `DEPTH-${market}`);

    signaling.registerCallback("trade", handleTrade, `DEPTH-TRADE-${market}`);

    // ----------------------------------------
    // SUBSCRIBE
    // ----------------------------------------

    signaling.sendMessage({
      method: "SUBSCRIBE",
      params: [`depth@${market}`, `trade@${market}`],
    });

    // ----------------------------------------
    // INITIAL ORDERBOOK SNAPSHOT
    // ----------------------------------------

    getDepth(market)
      .then((d) => {
        if (cancelled) {
          return;
        }

        const initialBids = [...(d.bids || [])]
          .filter(([, quantity]) => Number(quantity) > 0)
          .sort((a, b) => Number(b[0]) - Number(a[0]));

        const initialAsks = [...(d.asks || [])]
          .filter(([, quantity]) => Number(quantity) > 0)
          .sort((a, b) => Number(a[0]) - Number(b[0]));

        setBids(initialBids);
        setAsks(initialAsks);

        // Snapshot now exists.
        snapshotApplied = true;

        // Apply WS updates received while REST was loading.
        pendingDeltas.forEach(applyDelta);
      })
      .catch((error) => {
        console.error("Failed to fetch depth:", error);

        // Important:
        // allow realtime depth to continue even if snapshot failed.
        snapshotApplied = true;

        pendingDeltas.forEach(applyDelta);
      });

    // ----------------------------------------
    // INITIAL PRICE
    // ----------------------------------------

    getTicker(market)
      .then((ticker) => {
        if (!cancelled && ticker?.lastPrice) {
          setPrice(String(ticker.lastPrice));
        }
      })
      .catch(() => {});

    // Prefer latest trade price if available.
    getTrades(market)
      .then((trades) => {
        if (!cancelled && Array.isArray(trades) && trades.length > 0) {
          setPrice(String(trades[0].price));
        }
      })
      .catch(() => {});

    // ----------------------------------------
    // CLEANUP
    // ----------------------------------------

    return () => {
      cancelled = true;

      signaling.deRegisterCallback("depth", `DEPTH-${market}`);

      signaling.deRegisterCallback("trade", `DEPTH-TRADE-${market}`);

      signaling.sendMessage({
        method: "UNSUBSCRIBE",
        params: [`depth@${market}`, `trade@${market}`],
      });
    };
  }, [market]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 border-b border-baseBorderLight">
        <button
          onClick={() => setActiveView("orderbook")}
          className={`px-4 py-3 text-sm ${
            activeView === "orderbook"
              ? "border-b-2 border-red-500 text-white"
              : "text-baseTextMedEmphasis"
          }`}
        >
          Order Book
        </button>

        <button
          onClick={() => setActiveView("trades")}
          className={`px-4 py-3 text-sm ${
            activeView === "trades"
              ? "border-b-2 border-red-500 text-white"
              : "text-baseTextMedEmphasis"
          }`}
        >
          Trade History
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeView === "orderbook" ? (
          <OrderBookView bids={bids} asks={asks} price={price} />
        ) : (
          <TradeHistory market={market} />
        )}
      </div>
    </div>
  );
}
