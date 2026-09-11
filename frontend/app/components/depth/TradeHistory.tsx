"use client";

import React, { memo, useEffect, useState } from "react";
import { getTrades } from "../../utils/httpClient";
import { SignalingManager } from "../../utils/SignalingManager";
import { List, RowComponentProps } from "react-window";
// import { List } from "react-window";

interface Trade {
  price: string;
  quantity: string;
  timestamp?: number;
  isBuyerMaker?: boolean;
}
type TradeRowProps = {
  trades: Trade[];
};
function TradeRow({ index, style, trades }: RowComponentProps<TradeRowProps>) {
  const trade = trades[index];

  return (
    <div style={style} className="grid grid-cols-3 px-3 py-1 text-xs">
      <span className={trade.isBuyerMaker ? "text-red-500" : "text-green-500"}>
        {trade.price}
      </span>

      <span className="text-right">{trade.quantity}</span>

      <span className="text-right text-baseTextMedEmphasis">
        {trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : "-"}
      </span>
    </div>
  );
}
export const TradeHistory = memo(function TradeHistory({
  market,
}: {
  market: string;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    getTrades(market)
      .then((data) => {
        if (Array.isArray(data)) {
          console.log("data trade", data);
          setTrades(data);
        }
      })
      .catch(console.error);

    SignalingManager.getInstance().registerCallback(
      "trade",
      (trade: Trade) => {
        setTrades((prev) => [trade, ...prev]);
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-3 px-3 py-2 text-xs text-baseTextMedEmphasis">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Time</span>
      </div>

      <div className="min-h-0 flex-1 ">
        {/* {trades.map((trade, index) => (
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
        ))} */}
        <List
          style={{
            height: 450,
            width: "100%",
          }}
          rowCount={trades.length}
          rowHeight={28}
          rowComponent={TradeRow}
          rowProps={{
            trades,
          }}
          overscanCount={5}
        />
      </div>
    </div>
  );
});
