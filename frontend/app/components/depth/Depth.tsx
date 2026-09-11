"use client";

import { useEffect, useState } from "react";
import { getDepth, getTicker, getTrades } from "../../utils/httpClient";
import { BidTable } from "./BidTable";
import { AskTable } from "./AskTable";
import { SignalingManager } from "../../utils/SignalingManager";
import { TradeHistory } from "./TradeHistory";
import { OrderBookView } from "./OrderBookView";

function mergeLevels(
  current: [string, string][],
  updates: [string, string][],
): [string, string][] {
  // Convert current to a Map for fast lookup
  const map = new Map<string, string>();
  for (const [price, quantity] of current) {
    map.set(price, quantity);
  }
  // Apply every update — qty of "0" means remove the level
  for (const [price, quantity] of updates || []) {
    if (Number(quantity) === 0) {
      map.delete(price);
    } else {
      map.set(price, quantity);
    }
  }
  return Array.from(map.entries());
}

export function Depth({ market }: { market: string }) {
  const [bids, setBids] = useState<[string, string][]>();
  const [asks, setAsks] = useState<[string, string][]>();
  const [price, setPrice] = useState<string>();

  const [activeView, setActiveView] = useState<"orderbook" | "trades">(
    "orderbook",
  );
  useEffect(() => {
    SignalingManager.getInstance().registerCallback(
      "depth",
      (data: any) => {
        console.log("depth has been updated", data);

        setBids((originalBids) => {
          const merged = mergeLevels(originalBids || [], data.bids || []);
          // Bids: highest price first
          merged.sort((a, b) => Number(b[0]) - Number(a[0]));
          return merged;
        });

        setAsks((originalAsks) => {
          const merged = mergeLevels(originalAsks || [], data.asks || []);
          // Asks: lowest price first (or reverse for display)
          merged.sort((a, b) => Number(a[0]) - Number(b[0]));
          return merged;
        });
      },
      `DEPTH-${market}`,
    );

    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`depth@${market}`],
    });

    getDepth(market).then((d) => {
      // Bids highest first
      const initialBids = [...d.bids].sort(
        (a, b) => Number(b[0]) - Number(a[0]),
      );
      // Asks lowest first
      const initialAsks = [...d.asks].sort(
        (a, b) => Number(a[0]) - Number(b[0]),
      );
      setBids(initialBids);
      setAsks(initialAsks);
    });

    getTicker(market)
      .then((t) => setPrice(t.lastPrice))
      .catch(() => {});
    getTrades(market)
      .then((t) => {
        if (Array.isArray(t) && t.length > 0) setPrice(t[0].price);
      })
      .catch(() => {});

    return () => {
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`depth@${market}`],
      });
      SignalingManager.getInstance().deRegisterCallback(
        "depth",
        `DEPTH-${market}`,
      );
    };
  }, [market]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 flex border-b border-baseBorderLight">
        <button
          onClick={() => setActiveView("orderbook")}
          className={`px-4 py-3 text-sm ${
            activeView === "orderbook"
              ? "text-white border-b-2 border-red-500"
              : "text-baseTextMedEmphasis"
          }`}
        >
          Order Book
        </button>

        <button
          onClick={() => setActiveView("trades")}
          className={`px-4 py-3 text-sm ${
            activeView === "trades"
              ? "text-white border-b-2 border-red-500"
              : "text-baseTextMedEmphasis"
          }`}
        >
          Trade History
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {activeView === "orderbook" ? (
          <OrderBookView bids={bids || []} asks={asks || []} price={price} />
        ) : (
          <TradeHistory market={market} />
        )}
      </div>
    </div>
  );
}
