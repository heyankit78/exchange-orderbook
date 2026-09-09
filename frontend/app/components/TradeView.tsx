"use client";

import { useEffect, useRef, useState } from "react";

import { ChartManager } from "../utils/ChartManager";
import { getKlines } from "../utils/httpClient";
import { KLine } from "../utils/types";
import { SignalingManager } from "../utils/SignalingManager";

type Timeframe = "1m" | "5m" | "15m" | "1h";

type LiveCandle = {
  time: number; // bucket start in milliseconds

  open: number;
  high: number;
  low: number;
  close: number;
};

type PublicTrade = {
  price: string | number;
  quantity: string | number;
  tradeId: string | number;
  isBuyerMaker: boolean;
  market: string;
  timestamp: number;
};

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h"];

const RANGE_MS: Record<Timeframe, number> = {
  "1m": 6 * 60 * 60 * 1000,

  "5m": 2 * 24 * 60 * 60 * 1000,

  "15m": 5 * 24 * 60 * 60 * 1000,

  "1h": 7 * 24 * 60 * 60 * 1000,
};

const INTERVAL_MS: Record<Timeframe, number> = {
  "1m": 60 * 1000,

  "5m": 5 * 60 * 1000,

  "15m": 15 * 60 * 1000,

  "1h": 60 * 60 * 1000,
};

/**
 * Example:
 *
 * trade = 22:37:42
 *
 * 1m  -> 22:37
 * 5m  -> 22:35
 * 15m -> 22:30
 * 1h  -> 22:00
 */
function getBucketStart(timestamp: number, interval: Timeframe) {
  const bucketSize = INTERVAL_MS[interval];

  return Math.floor(timestamp / bucketSize) * bucketSize;
}

export function TradeView({ market }: { market: string }) {
  const chartRef = useRef<HTMLDivElement>(null);

  const chartManagerRef = useRef<ChartManager | null>(null);

  /**
   * Stores the candle currently
   * being changed by live trades.
   *
   * Important:
   * using ref means every trade
   * does NOT cause React re-render.
   */
  const liveCandleRef = useRef<LiveCandle | null>(null);

  const [interval, setInterval] = useState<Timeframe>("1h");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    let subscribed = false;

    const signalingManager = SignalingManager.getInstance();

    const callbackId = `TRADE_CHART_${market}_${interval}`;

    const tradeChannel = `trade@${market}`;

    // ==========================================
    // LIVE TRADE HANDLER
    // ==========================================

    const handleTrade = (trade: PublicTrade) => {
      /**
       * SignalingManager callbacks are grouped
       * by event type ("trade").
       *
       * BTC + ETH + SOL trade callbacks can
       * therefore reach this function.
       *
       * Only process the market this chart
       * is currently displaying.
       */
      if (trade.market !== market) {
        return;
      }

      const price = Number(trade.price);

      if (!Number.isFinite(price)) {
        return;
      }

      const tradeTime = trade.timestamp ?? Date.now();

      const bucketStart = getBucketStart(tradeTime, interval);

      const current = liveCandleRef.current;

      // ========================================
      // NO CURRENT CANDLE
      // ========================================

      if (!current) {
        const candle: LiveCandle = {
          time: bucketStart,

          open: price,
          high: price,
          low: price,
          close: price,
        };

        liveCandleRef.current = candle;

        chartManagerRef.current?.update(candle);

        return;
      }

      // ========================================
      // SAME CANDLE
      // ========================================

      if (current.time === bucketStart) {
        const candle: LiveCandle = {
          time: current.time,

          open: current.open,

          high: Math.max(current.high, price),

          low: Math.min(current.low, price),

          close: price,
        };

        liveCandleRef.current = candle;

        chartManagerRef.current?.update(candle);

        return;
      }

      // ========================================
      // NEW TIME BUCKET
      // ========================================

      if (bucketStart > current.time) {
        const candle: LiveCandle = {
          time: bucketStart,

          open: price,
          high: price,
          low: price,
          close: price,
        };

        liveCandleRef.current = candle;

        chartManagerRef.current?.update(candle);
      }
    };

    // ==========================================
    // INITIAL HISTORICAL LOAD
    // ==========================================

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

        if (cancelled) {
          return;
        }

        console.log(`📊 ${market} ${interval} KLINES:`, klineData.length);

        const formattedData = klineData
          .map((x) => ({
            open: Number(x.open),

            high: Number(x.high),

            low: Number(x.low),

            close: Number(x.close),

            timestamp: new Date(x.end),
          }))
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        if (!chartRef.current) {
          return;
        }

        // ======================================
        // DESTROY OLD CHART
        // ======================================

        chartManagerRef.current?.destroy();

        // ======================================
        // CREATE HISTORICAL CHART
        // ======================================

        chartManagerRef.current = new ChartManager(
          chartRef.current,
          formattedData,
          {
            background: "#0e0f14",

            color: "white",
          },
        );

        // ======================================
        // INITIALIZE LIVE CANDLE
        // FROM LAST HISTORICAL CANDLE
        // ======================================

        const lastCandle = formattedData[formattedData.length - 1];

        if (lastCandle) {
          liveCandleRef.current = {
            /**
             * Normalize it to the currently
             * selected timeframe.
             */
            time: getBucketStart(lastCandle.timestamp.getTime(), interval),

            open: lastCandle.open,

            high: lastCandle.high,

            low: lastCandle.low,

            close: lastCandle.close,
          };
        } else {
          liveCandleRef.current = null;
        }

        // ======================================
        // REGISTER LIVE TRADE CALLBACK
        // ======================================

        await signalingManager.registerCallback(
          "trade",
          handleTrade,
          callbackId,
        );

        if (cancelled) {
          await signalingManager.deRegisterCallback("trade", callbackId);

          return;
        }

        // ======================================
        // SUBSCRIBE TO MARKET TRADE STREAM
        // ======================================

        signalingManager.sendMessage({
          method: "SUBSCRIBE",

          params: [tradeChannel],
        });

        subscribed = true;

        console.log(`📡 Chart subscribed: ${tradeChannel}`);
      } catch (error) {
        console.error("❌ Failed to load chart:", error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    initChart();

    // ==========================================
    // CLEANUP
    // ==========================================

    return () => {
      cancelled = true;

      liveCandleRef.current = null;

      void signalingManager.deRegisterCallback("trade", callbackId);

      if (subscribed) {
        signalingManager.sendMessage({
          method: "UNSUBSCRIBE",

          params: [tradeChannel],
        });
      }

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

        {!loading && (
          <span className="ml-auto text-[10px] text-green-400">● Live</span>
        )}
      </div>

      {/* CHART */}

      <div className="min-h-0 flex-1">
        <div ref={chartRef} className="h-full min-h-[400px] w-full" />
      </div>
    </div>
  );
}
