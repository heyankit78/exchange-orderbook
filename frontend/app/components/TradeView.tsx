"use client";

import { useEffect, useRef } from "react";
import { ChartManager } from "../utils/ChartManager";
import { getKlines } from "../utils/httpClient";
import { KLine } from "../utils/types";

export function TradeView({ market }: { market: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartManagerRef = useRef<ChartManager | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const startTime = Math.floor(
          (Date.now() - 1000 * 60 * 60 * 24 * 7) / 1000,
        );

        const endTime = Math.floor(Date.now() / 1000);

        console.log("📊 FETCHING KLINES:", {
          market,
          interval: "1h",
          startTime,
          endTime,
        });

        const klineData: KLine[] = await getKlines(
          market,
          "1h",
          startTime,
          endTime,
        );

        console.log("📊 KLINES RESPONSE:", klineData);
        console.log("📊 KLINES COUNT:", klineData?.length);

        if (cancelled) return;

        if (!chartRef.current) return;

        if (!Array.isArray(klineData) || klineData.length === 0) {
          console.warn("⚠️ No kline data returned for", market);
          return;
        }

        const formattedData = klineData
          .map((x) => ({
            open: Number(x.open),
            high: Number(x.high),
            low: Number(x.low),
            close: Number(x.close),
            timestamp: new Date(x.end),
          }))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        console.log("📊 FIRST FORMATTED CANDLE:", formattedData[0]);

        console.log(
          "📊 LAST FORMATTED CANDLE:",
          formattedData[formattedData.length - 1],
        );

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
        console.error("❌ KLINE/CHART ERROR:", error);
      }
    };

    init();

    return () => {
      cancelled = true;

      chartManagerRef.current?.destroy();
      chartManagerRef.current = null;
    };
  }, [market]);

  return (
    <div className="h-full min-h-0 w-full">
      <div ref={chartRef} className="h-full min-h-[400px] w-full" />
    </div>
  );
}
