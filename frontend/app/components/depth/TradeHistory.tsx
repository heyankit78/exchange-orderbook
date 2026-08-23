"use client";

import { useEffect, useState } from "react";
import { getTrades } from "../../utils/httpClient";
import { SignalingManager } from "../../utils/SignalingManager";

interface Trade {
  price: string;
  quantity: string;
  timestamp?: number;
  isBuyerMaker?: boolean;
}

export function TradeHistory({ market }: { market: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    getTrades(market)
      .then((data) => {
        if (Array.isArray(data)) {
          setTrades(data);
        }
      })
      .catch(console.error);

    SignalingManager.getInstance().registerCallback(
      "trade",
      (trade: Trade) => {
        setTrades((prev) => [trade, ...prev].slice(0, 50));
      },
      `TRADE-${market}`,
    );

    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`trade@${market}`],
    });

    return () => {
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`trade@${market}`],
      });

      SignalingManager.getInstance().deRegisterCallback(
        "trade",
        `TRADE-${market}`,
      );
    };
  }, [market]);

  return (
    <div>
      <div className="grid grid-cols-3 px-3 py-2 text-xs text-baseTextMedEmphasis">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Time</span>
      </div>

      {trades.map((trade, index) => (
        <div key={index} className="grid grid-cols-3 px-3 py-1 text-xs">
          <span
            className={trade.isBuyerMaker ? "text-red-500" : "text-green-500"}
          >
            {trade.price}
          </span>

          <span className="text-right">{trade.quantity}</span>

          <span className="text-right text-baseTextMedEmphasis">
            {trade.timestamp
              ? new Date(trade.timestamp).toLocaleTimeString()
              : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}
