"use client";

import { useEffect, useState } from "react";
import type { Ticker } from "../utils/types";
import { getTicker } from "../utils/httpClient";
import { SignalingManager } from "../utils/SignalingManager";
import { AssetIcon } from "./AssetIcon";

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

  function formatNumber(value: string | number | undefined, decimals = 2) {
    const num = Number(value);

    if (!Number.isFinite(num)) {
      return "--";
    }

    return num.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const priceChange = Number(ticker?.priceChange ?? 0);

  return (
    <div className="border-b border-baseBorderLight bg-baseBackgroundL1">
      <div
        className="
          mx-auto flex w-full flex-col
          px-3 py-3
          sm:px-4
          lg:h-[61px] lg:flex-row lg:items-center lg:py-0
        "
      >
        {/* MARKET + PRICE */}

        <div className="flex items-center justify-between lg:justify-start">
          <Ticker market={market} />

          {/* Mobile price */}
          <div className="text-right lg:hidden">
            <p className="text-lg font-semibold tabular-nums text-greenText">
              {formatNumber(ticker?.lastPrice)}
            </p>

            <p className="text-[11px] text-baseTextMedEmphasis">Last Price</p>
          </div>
        </div>

        {/* STATS */}

        <div
          className="
            mt-3 grid grid-cols-2 gap-x-5 gap-y-4
            border-t border-baseBorderLight pt-3
            sm:grid-cols-4
            lg:ml-7 lg:mt-0 lg:flex lg:h-full
            lg:flex-1 lg:items-center lg:gap-8
            lg:border-t-0 lg:pt-0
          "
        >
          {/* Desktop price */}

          <div className="hidden min-w-[110px] flex-col justify-center lg:flex">
            <p className="text-lg font-semibold tabular-nums text-greenText">
              {formatNumber(ticker?.lastPrice)}
            </p>

            <p className="text-[13px] tabular-nums text-baseTextMedEmphasis">
              {formatNumber(ticker?.lastPrice)}
            </p>
          </div>

          {/* CHANGE */}

          <StatItem label="24H Change">
            <p
              className={`mt-1 text-[13px] font-medium tabular-nums ${
                priceChange >= 0 ? "text-greenText" : "text-redText"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {formatNumber(ticker?.priceChange)}{" "}
              {ticker?.priceChangePercent
                ? `(${Number(ticker.priceChangePercent).toFixed(2)}%)`
                : "--"}
            </p>
          </StatItem>

          {/* HIGH */}

          <StatItem label="24H High">
            <p className="mt-1 text-[13px] font-medium tabular-nums text-baseTextHighEmphasis">
              {formatNumber(ticker?.high)}
            </p>
          </StatItem>

          {/* LOW */}

          <StatItem label="24H Low">
            <p className="mt-1 text-[13px] font-medium tabular-nums text-baseTextHighEmphasis">
              {formatNumber(ticker?.low)}
            </p>
          </StatItem>

          {/* VOLUME */}

          <StatItem label="24H Volume">
            <p className="mt-1 text-[13px] font-medium tabular-nums text-baseTextHighEmphasis">
              {formatNumber(ticker?.volume, 4)}
            </p>
          </StatItem>
        </div>
      </div>
    </div>
  );
};

function StatItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center">
      <p className="text-[11px] text-baseTextMedEmphasis sm:text-xs">
        {label}
      </p>

      {children}
    </div>
  );
}

function Ticker({ market }: { market: string }) {
  const [base, quote] = market.split("_");

  return (
    <div className="flex shrink-0 items-center gap-3">
      {/* LOGOS */}

      <div className="flex items-center">
        <AssetIcon
          asset={base}
          size={30}
          className="z-10 border-2 border-baseBackgroundL1"
        />

        <AssetIcon
          asset={quote}
          size={30}
          className="-ml-2 border-2 border-baseBackgroundL1"
        />
      </div>

      <div>
        <p className="text-sm font-semibold text-baseTextHighEmphasis">
          {base} / {quote}
        </p>

        <p className="text-[11px] text-baseTextMedEmphasis">Spot</p>
      </div>
    </div>
  );
}
