"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MARKETS } from "@repo/shared";

import { Ticker } from "../utils/types";
import { getTickers } from "../utils/httpClient";
import { SignalingManager } from "../utils/SignalingManager";

const ACTIVE_MARKETS = [
  MARKETS.BTC_USDC.symbol,
  MARKETS.ETH_USDC.symbol,
  MARKETS.SOL_USDC.symbol,
];

export const Markets = () => {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [search, setSearch] = useState("");

  const router = useRouter();

  useEffect(() => {
    const signalingManager = SignalingManager.getInstance();

    // -----------------------------------------
    // 1. INITIAL REST SNAPSHOT
    // -----------------------------------------

    const loadTickers = async () => {
      try {
        const data = await getTickers();

        const activeTickerData = data.filter((ticker) =>
          ACTIVE_MARKETS.includes(ticker.symbol as any),
        );

        setTickers(activeTickerData);
      } catch (error) {
        console.error("❌ Failed to load tickers:", error);
      }
    };

    loadTickers();

    // -----------------------------------------
    // 2. LIVE TICKER CALLBACK
    // -----------------------------------------

    const callbackId = "MARKETS_TICKER_LIST";

    const handleTicker = (updatedTicker: Partial<Ticker>) => {
      if (!updatedTicker.symbol) {
        return;
      }

      if (!ACTIVE_MARKETS.includes(updatedTicker.symbol as any)) {
        return;
      }

      setTickers((previous) => {
        const exists = previous.some(
          (ticker) => ticker.symbol === updatedTicker.symbol,
        );

        // Existing market → merge update
        if (exists) {
          return previous.map((ticker) =>
            ticker.symbol === updatedTicker.symbol
              ? {
                  ...ticker,
                  ...updatedTicker,
                }
              : ticker,
          );
        }

        // First ticker event before REST returned
        return [...previous, updatedTicker as Ticker];
      });
    };

    signalingManager.registerCallback("ticker", handleTicker, callbackId);

    // -----------------------------------------
    // 3. SUBSCRIBE ALL 3 MARKETS
    // -----------------------------------------

    const channels = ACTIVE_MARKETS.map((market) => `ticker@${market}`);

    signalingManager.sendMessage({
      method: "SUBSCRIBE",
      params: channels,
    });

    console.log("📡 Markets subscribed:", channels);

    // -----------------------------------------
    // 4. CLEANUP
    // -----------------------------------------

    return () => {
      void signalingManager.deRegisterCallback("ticker", callbackId);

      signalingManager.sendMessage({
        method: "UNSUBSCRIBE",
        params: channels,
      });
    };
  }, []);

  const filtered = tickers.filter((ticker) =>
    ticker.symbol.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0e0f14] px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-white">Markets</h1>

          <p className="text-sm text-baseTextMedEmphasis">
            Trade your favourite assets
          </p>
        </div>

        {/* SEARCH */}

        <div className="relative mb-4 max-w-sm">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-baseTextMedEmphasis"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            type="text"
            placeholder="Search market..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-baseBorderLight bg-baseBackgroundL1 pl-9 pr-4 text-sm text-white placeholder-baseTextMedEmphasis transition focus:border-accentBlue focus:outline-none"
          />
        </div>

        {/* TABLE */}

        <div className="overflow-hidden rounded-xl border border-baseBorderLight bg-baseBackgroundL1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-baseBorderLight">
                <th className="px-6 py-3 text-left text-xs font-medium text-baseTextMedEmphasis">
                  #
                </th>

                <th className="px-4 py-3 text-left text-xs font-medium text-baseTextMedEmphasis">
                  Name
                </th>

                <th className="px-4 py-3 text-right text-xs font-medium text-baseTextMedEmphasis">
                  Price
                </th>

                <th className="px-4 py-3 text-right text-xs font-medium text-baseTextMedEmphasis">
                  24h Change
                </th>

                <th className="px-4 py-3 text-right text-xs font-medium text-baseTextMedEmphasis">
                  24h High
                </th>

                <th className="px-4 py-3 text-right text-xs font-medium text-baseTextMedEmphasis">
                  24h Low
                </th>

                <th className="px-6 py-3 text-right text-xs font-medium text-baseTextMedEmphasis">
                  Volume
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-16 text-center text-sm text-baseTextMedEmphasis"
                  >
                    No markets found
                  </td>
                </tr>
              )}

              {filtered.map((market, index) => {
                const change = Number(market.priceChangePercent ?? 0);

                const isPositive = change >= 0;

                const [base, quote] = market.symbol.split("_");

                return (
                  <tr
                    key={market.symbol}
                    onClick={() => router.push(`/trade/${market.symbol}`)}
                    className="cursor-pointer border-b border-baseBorderLight transition-colors last:border-0 hover:bg-baseBackgroundL2"
                  >
                    <td className="px-6 py-4 text-sm text-baseTextMedEmphasis">
                      {index + 1}
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-baseBackgroundL2 text-sm font-bold text-white">
                          {base?.[0]}
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-white">
                            {base}
                          </p>

                          <p className="text-xs text-baseTextMedEmphasis">
                            {base}/{quote}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* PRICE */}

                    <td className="px-4 py-4 text-right">
                      <p className="tabular-nums text-sm font-medium text-white">
                        {Number(market.lastPrice ?? 0).toLocaleString(
                          undefined,
                          {
                            maximumFractionDigits: 2,
                          },
                        )}
                      </p>

                      <p className="text-xs text-baseTextMedEmphasis">
                        {quote}
                      </p>
                    </td>

                    {/* CHANGE */}

                    <td className="px-4 py-4 text-right">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-sm font-medium tabular-nums ${
                          isPositive
                            ? "bg-greenBackgroundTransparent text-greenText"
                            : "bg-redBackgroundTransparent text-redText"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {change.toFixed(2)}%
                      </span>
                    </td>

                    {/* HIGH */}

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis">
                      {Number(market.high ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    {/* LOW */}

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis">
                      {Number(market.low ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    {/* VOLUME */}

                    <td className="px-6 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis">
                      {Number(market.volume ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 4,
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
