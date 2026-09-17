"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MARKETS } from "@repo/shared";

import type { Ticker } from "../utils/types";
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

        return [...previous, updatedTicker as Ticker];
      });
    };

    signalingManager.registerCallback("ticker", handleTicker, callbackId);

    const channels = ACTIVE_MARKETS.map((market) => `ticker@${market}`);

    signalingManager.sendMessage({
      method: "SUBSCRIBE",
      params: channels,
    });

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
    <div className="min-h-screen bg-[#0e0f14] px-3 py-5 sm:px-5 sm:py-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        {/* HEADER */}

        <div className="mb-5 sm:mb-6">
          <h1 className="text-xl font-bold text-white sm:text-2xl">Markets</h1>

          <p className="mt-1 text-xs text-baseTextMedEmphasis sm:text-sm">
            Trade your favourite assets
          </p>
        </div>

        {/* SEARCH */}

        <div className="relative mb-4 w-full sm:max-w-sm">
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
            className="
              h-10 w-full rounded-lg
              border border-baseBorderLight
              bg-baseBackgroundL1
              pl-9 pr-4
              text-sm text-white
              placeholder-baseTextMedEmphasis
              transition
              focus:border-accentBlue
              focus:outline-none
            "
          />
        </div>

        {/* ================================= */}
        {/* MOBILE CARDS */}
        {/* ================================= */}

        <div className="space-y-2 md:hidden">
          {filtered.length === 0 && (
            <div className="rounded-xl border border-baseBorderLight bg-baseBackgroundL1 py-16 text-center text-sm text-baseTextMedEmphasis">
              No markets found
            </div>
          )}

          {filtered.map((market) => {
            const change = Number(market.priceChangePercent ?? 0);

            const isPositive = change >= 0;

            const [base, quote] = market.symbol.split("_");

            return (
              <button
                key={market.symbol}
                type="button"
                onClick={() => router.push(`/trade/${market.symbol}`)}
                className="
                  w-full rounded-xl
                  border border-baseBorderLight
                  bg-baseBackgroundL1
                  p-4 text-left
                  transition
                  active:scale-[0.99]
                  hover:bg-baseBackgroundL2
                "
              >
                {/* TOP */}

                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-baseBackgroundL2 text-sm font-bold text-white">
                      {base?.[0]}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {base}
                      </p>

                      <p className="text-xs text-baseTextMedEmphasis">
                        {base}/{quote}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-white">
                      {Number(market.lastPrice ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </p>

                    <span
                      className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        isPositive
                          ? "bg-greenBackgroundTransparent text-greenText"
                          : "bg-redBackgroundTransparent text-redText"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {change.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* BOTTOM */}

                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-baseBorderLight pt-3">
                  <MobileMetric
                    label="24H High"
                    value={Number(market.high ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  />

                  <MobileMetric
                    label="24H Low"
                    value={Number(market.low ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    })}
                  />

                  <MobileMetric
                    label="Volume"
                    value={Number(market.volume ?? 0).toLocaleString(
                      undefined,
                      {
                        maximumFractionDigits: 2,
                      },
                    )}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* ================================= */}
        {/* TABLET / DESKTOP TABLE */}
        {/* ================================= */}

        <div className="hidden overflow-x-auto rounded-xl border border-baseBorderLight bg-baseBackgroundL1 md:block">
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="border-b border-baseBorderLight">
                <TableHeader>#</TableHeader>
                <TableHeader>Name</TableHeader>

                <TableHeader align="right">Price</TableHeader>

                <TableHeader align="right">24h Change</TableHeader>

                <TableHeader align="right">24h High</TableHeader>

                <TableHeader align="right">24h Low</TableHeader>

                <TableHeader align="right">Volume</TableHeader>
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
                    <td className="px-4 py-4 text-sm text-baseTextMedEmphasis lg:px-6">
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

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis">
                      {Number(market.high ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis">
                      {Number(market.low ?? 0).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>

                    <td className="px-4 py-4 text-right text-sm tabular-nums text-baseTextMedEmphasis lg:px-6">
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

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-baseTextMedEmphasis">{label}</p>

      <p className="mt-1 truncate text-xs font-medium tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

function TableHeader({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-4 py-3 text-xs font-medium text-baseTextMedEmphasis ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
