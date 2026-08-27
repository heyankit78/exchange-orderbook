import { Client } from "pg";
import { Router } from "express";

const pgClient = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
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
  quoteVolume: string;
  trades: number;
  start: Date;
};

klineRouter.get("/", async (req, res) => {
  const { market, interval, startTime, endTime } = req.query;

  if (!startTime || !endTime) {
    return res.status(400).json({
      message: "startTime and endTime are required",
    });
  }

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
        SELECT *
        FROM klines_1m
        WHERE bucket >= $1
          AND bucket <= $2
        ORDER BY bucket ASC
      `;
      break;

    case "1h":
      query = `
        SELECT *
        FROM klines_1h
        WHERE bucket >= $1
          AND bucket <= $2
        ORDER BY bucket ASC
      `;
      break;

    case "1w":
      query = `
        SELECT *
        FROM klines_1w
        WHERE bucket >= $1
          AND bucket <= $2
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
      new Date(start * 1000),
      new Date(end * 1000),
    ]);

    return res.json(
      result.rows.map((x) => ({
        close: x.close,
        end: x.bucket,
        high: x.high,
        low: x.low,
        open: x.open,
        quoteVolume: x.quoteVolume,
        start: x.start,
        trades: x.trades,
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
