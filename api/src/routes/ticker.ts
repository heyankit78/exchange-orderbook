import { Router } from "express";
import { Client } from "pg";

export const tickersRouter = Router();

const pgClient = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

pgClient.connect();

tickersRouter.get("/", async (req, res) => {
  try {
    const result = await pgClient.query(`
      SELECT
        market,

        MIN(price) AS low,
        MAX(price) AS high,

        SUM(volume) AS volume,

        SUM(price * volume) AS quote_volume,

        COUNT(*) AS trades,

        (
          SELECT mp2.price
          FROM market_prices mp2
          WHERE mp2.market = mp.market
            AND mp2.time >= NOW() - INTERVAL '24 hours'
          ORDER BY mp2.time ASC
          LIMIT 1
        ) AS first_price,

        (
          SELECT mp3.price
          FROM market_prices mp3
          WHERE mp3.market = mp.market
            AND mp3.time >= NOW() - INTERVAL '24 hours'
          ORDER BY mp3.time DESC
          LIMIT 1
        ) AS last_price

      FROM market_prices mp

      WHERE mp.time >= NOW() - INTERVAL '24 hours'

      GROUP BY market

      ORDER BY market
    `);

    const tickers = result.rows.map((row) => {
      const firstPrice = Number(row.first_price);
      const lastPrice = Number(row.last_price);

      const priceChange = lastPrice - firstPrice;

      const priceChangePercent =
        firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;

      return {
        symbol: row.market,

        firstPrice: firstPrice.toString(),

        lastPrice: lastPrice.toString(),

        high: Number(row.high).toString(),

        low: Number(row.low).toString(),

        volume: Number(row.volume).toString(),

        quoteVolume: Number(row.quote_volume).toString(),

        trades: Number(row.trades).toString(),

        priceChange: priceChange.toString(),

        priceChangePercent: priceChangePercent.toString(),
      };
    });

    return res.json(tickers);
  } catch (error) {
    console.error("Ticker query error:", error);

    return res.status(500).json({
      message: "Failed to fetch tickers",
    });
  }
});
