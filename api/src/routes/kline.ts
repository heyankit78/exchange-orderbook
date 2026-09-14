import { Client } from "pg";
import { Router } from "express";

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

export const klineRouter = Router();

type KlineRow = {
  bucket: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  market: string;
};

klineRouter.get("/", async (req, res) => {
  const { symbol, interval, startTime, endTime } = req.query;

  if (!symbol) {
    return res.status(400).json({
      message: "symbol is required",
    });
  }

  if (!startTime || !endTime) {
    return res.status(400).json({
      message: "startTime and endTime are required",
    });
  }

  const market = String(symbol);

  const start = Number(startTime);
  const end = Number(endTime);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return res.status(400).json({
      message: "Invalid startTime or endTime",
    });
  }

  let query: string;

  switch (interval) {
    case "1m":
      query = `
        SELECT
          bucket,
          open,
          high,
          low,
          close,
          volume,
          market
        FROM klines_1m
        WHERE market = $1
          AND bucket >= $2
          AND bucket <= $3
        ORDER BY bucket ASC
      `;
      break;

    case "1h":
      query = `
        SELECT
          bucket,
          open,
          high,
          low,
          close,
          volume,
          market
        FROM klines_1h
        WHERE market = $1
          AND bucket >= $2
          AND bucket <= $3
        ORDER BY bucket ASC
      `;
      break;

    case "1w":
      query = `
        SELECT
          bucket,
          open,
          high,
          low,
          close,
          volume,
          market
        FROM klines_1w
        WHERE market = $1
          AND bucket >= $2
          AND bucket <= $3
        ORDER BY bucket ASC
      `;
    case "5m":
      query = `
    SELECT
      bucket,
      open,
      high,
      low,
      close,
      volume,
      market
    FROM klines_5m
    WHERE market = $1
      AND bucket >= $2
      AND bucket <= $3
    ORDER BY bucket ASC
  `;
      break;

    case "15m":
      query = `
    SELECT
      bucket,
      open,
      high,
      low,
      close,
      volume,
      market
    FROM klines_15m
    WHERE market = $1
      AND bucket >= $2
      AND bucket <= $3
    ORDER BY bucket ASC
  `;
      break;

    default:
      return res.status(400).json({
        message: "Invalid interval",
      });
  }

  try {
    const result = await pgClient.query<KlineRow>(query, [
      market,
      new Date(start * 1000),
      new Date(end * 1000),
    ]);

    return res.json(
      result.rows.map((x) => ({
        start: x.bucket,
        end: x.bucket,
        open: x.open,
        high: x.high,
        low: x.low,
        close: x.close,
        volume: x.volume,
      })),
    );
  } catch (err) {
    console.error("Kline query error:", err);

    return res.status(500).json({
      message: "Failed to fetch klines",
    });
  }
});
