"use client";

import { useEffect, useState } from "react";
import type { Ticker } from "../utils/types";
import { getTicker } from "../utils/httpClient";
import { SignalingManager } from "../utils/SignalingManager";

export const MarketBar = ({ market }: { market: string }) => {
  const [ticker, setTicker] = useState<Ticker | null>(null);

  useEffect(() => {
    let cancelled = false;

    const signaling = SignalingManager.getInstance();

    // Initial REST snapshot
    getTicker(market)
      .then((data) => {
        if (!cancelled) {
          setTicker(data);
        }
      })
      .catch((error) => {
        console.error("Failed to load ticker:", error);
      });

    // Live trade callback
    const callbackId = `MARKET-BAR-TRADE-${market}`;

    const handleTrade = (trade: {
      tradeId: string;
      price: string;
      quantity: string;
      market: string;
      isBuyerMaker: boolean;
      timestamp: number;
    }) => {
      if (cancelled) return;

      if (trade.market !== market) {
        return;
      }

      console.log("🔥 MARKET BAR LIVE TRADE:", trade);

      setTicker((prevTicker) => {
        if (!prevTicker) {
          return prevTicker;
        }

        return {
          ...prevTicker,
          lastPrice: String(trade.price),
        };
      });
    };

    signaling.registerCallback("trade", handleTrade, callbackId);

    signaling.sendMessage({
      method: "SUBSCRIBE",
      params: [`trade@${market}`],
    });

    return () => {
      cancelled = true;

      signaling.deRegisterCallback("trade", callbackId);

      signaling.sendMessage({
        method: "UNSUBSCRIBE",
        params: [`trade@${market}`],
      });
    };
  }, [market]);

  return (
    <div className="h-[61px] border-b border-baseBorderLight bg-baseBackgroundL1">
      <div className="flex h-full items-center overflow-x-auto no-scrollbar px-3">
        <div className="flex shrink-0 items-center">
          <Ticker market={market} />
        </div>

        <div className="ml-5 flex h-full items-center gap-8">
          <div className="flex min-w-[100px] flex-col justify-center">
            <p className="text-lg font-semibold tabular-nums text-greenText">
              {ticker?.lastPrice || "--"}
            </p>

            <p className="text-xs tabular-nums text-baseTextMedEmphasis">
              {ticker?.lastPrice || "--"}
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-[11px] text-baseTextMedEmphasis">24H Change</p>

            <p
              className={`mt-1 text-xs font-medium tabular-nums ${
                Number(ticker?.priceChange) > 0
                  ? "text-greenText"
                  : "text-redText"
              }`}
            >
              {Number(ticker?.priceChange) > 0 ? "+" : ""}
              {ticker?.priceChange || "--"}{" "}
              {ticker?.priceChangePercent
                ? `${Number(ticker.priceChangePercent).toFixed(2)}%`
                : "--"}
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-[11px] text-baseTextMedEmphasis">24H High</p>

            <p className="mt-1 text-xs font-medium tabular-nums text-baseTextHighEmphasis">
              {ticker?.high || "--"}
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-[11px] text-baseTextMedEmphasis">24H Low</p>

            <p className="mt-1 text-xs font-medium tabular-nums text-baseTextHighEmphasis">
              {ticker?.low || "--"}
            </p>
          </div>

          <div className="flex flex-col justify-center">
            <p className="text-[11px] text-baseTextMedEmphasis">24H Volume</p>

            <p className="mt-1 text-xs font-medium tabular-nums text-baseTextHighEmphasis">
              {ticker?.volume || "--"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function Ticker({ market }: { market: string }) {
  return (
    <div className="flex h-[60px] shrink-0 space-x-4">
      <div className="flex flex-row relative ml-2 -mr-4">
        <img
          alt="Base Logo"
          loading="lazy"
          decoding="async"
          className="z-10 rounded-full h-6 w-6 mt-4 outline-baseBackgroundL1"
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVvBqZC_Q1TSYObZaMvK0DRFeHZDUtVMh08Q&s"
        />

        <img
          alt="USDC Logo"
          loading="lazy"
          decoding="async"
          className="h-6 w-6 -ml-2 mt-4 rounded-full"
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVvBqZC_Q1TSYObZaMvK0DRFeHZDUtVMh08Q&s"
        />
      </div>

      <button type="button" className="react-aria-Button">
        <div className="flex items-center justify-between flex-row cursor-pointer rounded-lg p-3 hover:opacity-80">
          <div className="flex items-center flex-row gap-2">
            <div className="flex flex-row relative">
              <p className="font-medium text-sm">
                {market.replace("_", " / ")}
              </p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
