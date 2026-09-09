import { Router } from "express";
import { RedisManager } from "../RedisManager";
import {
  CREATE_ORDER,
  CANCEL_ORDER,
  GET_OPEN_ORDERS,
  type MessageToApi,
} from "@repo/shared";
import { AuthRequest } from "../middleware/auth";
import { Client } from "pg";

export const orderRouter = Router();

const pgClient = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

pgClient.connect();

orderRouter.post("/", async (req: AuthRequest, res) => {
  const { market, price, quantity, side } = req.body;

  const userId = req.user!.userId;

  const response = (await RedisManager.getInstance().sendAndAwait({
    type: CREATE_ORDER,
    data: {
      market,
      price,
      quantity,
      side,
      userId,
    },
  })) as MessageToApi;

  if (response.type === "ORDER_CANCELLED") {
    return res.status(400).json({
      message: response.payload.error ?? "Order rejected",
    });
  }

  if (response.type !== "ORDER_PLACED") {
    return res.status(500).json({
      message: "Unexpected response from engine",
    });
  }

  return res.json(response.payload);
});

orderRouter.delete("/", async (req: AuthRequest, res) => {
  const { orderId, market } = req.body;

  const userId = req.user!.userId;

  const response = (await RedisManager.getInstance().sendAndAwait({
    type: CANCEL_ORDER,
    data: {
      orderId,
      market,

      // IMPORTANT:
      // trusted userId comes from JWT
      userId,
    },
  })) as MessageToApi;

  if (response.type !== "ORDER_CANCELLED") {
    return res.status(500).json({
      message: "Unexpected response from engine",
    });
  }

  if (response.payload.error) {
    return res.status(400).json({
      message: response.payload.error,
    });
  }

  return res.json(response.payload);
});

orderRouter.get("/open", async (req: AuthRequest, res) => {
  const response = (await RedisManager.getInstance().sendAndAwait({
    type: GET_OPEN_ORDERS,
    data: {
      userId: req.user!.userId,
      market: req.query.market as string,
    },
  })) as MessageToApi;

  if (response.type !== "OPEN_ORDERS") {
    return res.status(500).json({
      message: "Unexpected response from engine",
    });
  }

  return res.json(response.payload);
});

orderRouter.get("/history", async (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const market = req.query.market as string | undefined;

  try {
    let query = `
      SELECT
        order_id,
        market,
        side,
        price,
        quantity,
        filled,
        order_status,
        created_at,
        updated_at
      FROM orders
      WHERE user_id = $1
       AND order_status IN ('FILLED', 'CANCELLED')
    `;

    const values: unknown[] = [Number(userId)];

    if (market) {
      query += ` AND market = $2`;
      values.push(market);
    }

    query += `
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await pgClient.query(query, values);

    const myOrders = result.rows.map((row) => ({
      orderId: row.order_id,
      market: row.market,
      side: row.side,
      price: String(row.price),
      quantity: String(row.quantity),
      filled: String(row.filled),

      remaining: String(Number(row.quantity) - Number(row.filled)),

      status: row.order_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return res.json(myOrders);
  } catch (e) {
    console.error("Order history query error:", e);

    return res.status(500).json({
      message: "Failed to fetch order history",
    });
  }
});
