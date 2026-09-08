"use client";
import { useEffect, useState } from "react";
import { Ticker } from "../utils/types";
import { getTicker } from "../utils/httpClient";
import { SignalingManager } from "../utils/SignalingManager";

export const MarketBar = ({ market }: { market: string }) => {
  const [ticker, setTicker] = useState<Ticker | null>(null);

  useEffect(() => {
    getTicker(market).then(setTicker);
    SignalingManager.getInstance().registerCallback(
      "ticker",
      (data: Partial<Ticker>) =>
        setTicker((prevTicker) => ({
          firstPrice: data?.firstPrice ?? prevTicker?.firstPrice ?? "",
          high: data?.high ?? prevTicker?.high ?? "",
          lastPrice: data?.lastPrice ?? prevTicker?.lastPrice ?? "",
          low: data?.low ?? prevTicker?.low ?? "",
          priceChange: data?.priceChange ?? prevTicker?.priceChange ?? "",
          priceChangePercent:
            data?.priceChangePercent ?? prevTicker?.priceChangePercent ?? "",
          quoteVolume: data?.quoteVolume ?? prevTicker?.quoteVolume ?? "",
          symbol: data?.symbol ?? prevTicker?.symbol ?? "",
          trades: data?.trades ?? prevTicker?.trades ?? "",
          volume: data?.volume ?? prevTicker?.volume ?? "",
        })),
      `TICKER-${market}`,
    );
    SignalingManager.getInstance().sendMessage({
      method: "SUBSCRIBE",
      params: [`ticker.${market}`],
    });

    return () => {
      SignalingManager.getInstance().deRegisterCallback(
        "ticker",
        `TICKER-${market}`,
      );
      SignalingManager.getInstance().sendMessage({
        method: "UNSUBSCRIBE",
        params: [`ticker.${market}`],
      });
    };
  }, [market]);
  //

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
          alt="SOL Logo"
          loading="lazy"
          decoding="async"
          data-nimg="1"
          className="z-10 rounded-full h-6 w-6 mt-4 outline-baseBackgroundL1"
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVvBqZC_Q1TSYObZaMvK0DRFeHZDUtVMh08Q&s"
        />
        <img
          alt="USDC Logo"
          loading="lazy"
          decoding="async"
          data-nimg="1"
          className="h-6 w-6 -ml-2 mt-4 rounded-full"
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTVvBqZC_Q1TSYObZaMvK0DRFeHZDUtVMh08Q&s"
        />
      </div>
      <button type="button" className="react-aria-Button" data-rac="">
        <div className="flex items-center justify-between flex-row cursor-pointer rounded-lg p-3 hover:opacity-80">
          <div className="flex items-center flex-row gap-2 undefined">
            <div className="flex flex-row relative">
              <p className="font-medium text-sm undefined">
                {market.replace("_", " / ")}
              </p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
