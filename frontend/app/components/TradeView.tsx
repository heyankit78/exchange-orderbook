"use client";

import { useEffect, useRef, useState } from "react";
import { ChartManager } from "../utils/ChartManager";
import { getKlines } from "../utils/httpClient";
import { KLine } from "../utils/types";

type Timeframe = "1m" | "5m" | "15m" | "1h";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h"];

const RANGE_MS: Record<Timeframe, number> = {
  "1m": 6 * 60 * 60 * 1000,
  "5m": 2 * 24 * 60 * 60 * 1000,
  "15m": 5 * 24 * 60 * 60 * 1000,
  "1h": 7 * 24 * 60 * 60 * 1000,
};

export function TradeView({ market }: { market: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartManagerRef = useRef<ChartManager | null>(null);

  const [interval, setInterval] = useState<Timeframe>("1h");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initChart = async () => {
      try {
        setLoading(true);

        const endTime = Math.floor(Date.now() / 1000);

        const startTime = Math.floor((Date.now() - RANGE_MS[interval]) / 1000);
        console.log("📊 FETCHING KLINES:", {
          market,
          interval,
          startTime,
          endTime,
        });

        const klineData: KLine[] = await getKlines(
          market,
          interval,
          startTime,
          endTime,
        );

        if (cancelled) return;

        console.log("📊 KLINES COUNT:", klineData.length);

        const formattedData = klineData
          .map((x) => ({
            open: Number(x.open),
            high: Number(x.high),
            low: Number(x.low),
            close: Number(x.close),
            timestamp: new Date(x.end),
          }))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        if (!chartRef.current) return;

        // Destroy old chart before building the new timeframe.
        chartManagerRef.current?.destroy();

        chartManagerRef.current = new ChartManager(
          chartRef.current,
          formattedData,
          {
            background: "#0e0f14",
            color: "white",
          },
        );
      } catch (error) {
        console.error("❌ Failed to load chart:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initChart();

    return () => {
      cancelled = true;

      chartManagerRef.current?.destroy();
      chartManagerRef.current = null;
    };
  }, [market, interval]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#0e0f14]">
      {/* TIMEFRAME BAR */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-baseBorderLight px-3">
        {TIMEFRAMES.map((timeframe) => (
          <button
            key={timeframe}
            type="button"
            onClick={() => setInterval(timeframe)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              interval === timeframe
                ? "bg-baseBackgroundL3 text-white"
                : "text-baseTextMedEmphasis hover:bg-baseBackgroundL2 hover:text-white"
            }`}
          >
            {timeframe}
          </button>
        ))}

        {loading && (
          <span className="ml-2 text-[11px] text-baseTextMedEmphasis">
            Loading...
          </span>
        )}
      </div>

      {/* CHART */}
      <div className="min-h-0 flex-1">
        <div ref={chartRef} className="h-full min-h-[400px] w-full" />
      </div>
    </div>
  );
}
