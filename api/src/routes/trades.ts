import { Router } from "express";
import { Client } from "pg";
import { authenticate, AuthRequest } from "../middleware/auth";

export const tradesRouter = Router();

const pgClient = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});
pgClient.connect();

tradesRouter.get("/", async (req: AuthRequest, res) => {
  const market = req.query.symbol as string;

  if (!market) {
    return res.json([]);
  }

  try {
    const result = await pgClient.query(
      `SELECT time, price, volume, market
             FROM market_prices
             WHERE market = $1
             ORDER BY time DESC
             LIMIT 50`,
      [market],
    );

    const trades = result.rows.map((row, i) => ({
      id: i,
      isBuyerMaker: false,
      price: String(row.price),
      quantity: String(row.volume),
      quoteQuantity: String(row.price * row.volume),
      timestamp: new Date(row.time).getTime(),
    }));

    res.json(trades);
  } catch (e) {
    console.error("Trades query error:", e);
    res.json([]);
  }
});

tradesRouter.get("/my-trades", authenticate, async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  if (!userId) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
  const market = req.query.market as string | undefined;

  try {
    let query = `
      SELECT
        trade_id,
        market,
        price,
        quantity,
        quote_quantity,
        buyer_user_id,
        seller_user_id,
        created_at
      FROM trades
      WHERE (buyer_user_id = $1 OR seller_user_id = $1)
    `;

    const values: any[] = [userId];

    if (market) {
      query += ` AND market = $2`;
      values.push(market);
    }

    query += `
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await pgClient.query(query, values);

    const trades = result.rows.map((row) => ({
      tradeId: row.trade_id,
      market: row.market,
      price: String(row.price),
      quantity: String(row.quantity),
      quoteQuantity: String(row.quote_quantity),

      side: row.buyer_user_id === userId ? "buy" : "sell",

      createdAt: row.created_at,
    }));

    return res.json(trades);
  } catch (e) {
    console.error("My trades error:", e);

    return res.status(500).json({
      message: "Failed to fetch trades",
    });
  }
});
