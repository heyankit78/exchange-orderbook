import { Router } from "express";
import { RedisManager } from "../RedisManager";
import {
  CREATE_ORDER,
  CANCEL_ORDER,
  GET_OPEN_ORDERS,
  MARKETS,
  type MessageToApi,
} from "@repo/shared";
import { AuthRequest } from "../middleware/auth";
import { Client } from "pg";

export const orderRouter = Router();

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

const configuredPriceBandPercent = Number(
  process.env.ORDER_PRICE_BAND_PERCENT ?? 5,
);
const PRICE_BAND_PERCENT =
  Number.isFinite(configuredPriceBandPercent) &&
  configuredPriceBandPercent > 0 &&
  configuredPriceBandPercent < 100
    ? configuredPriceBandPercent
    : 5;

orderRouter.post("/", async (req: AuthRequest, res) => {
  const { market, orderType = "limit", price, quantity, side } = req.body;

  const userId = req.user!.userId;

  if (!market || !quantity || !side) {
    return res.status(400).json({
      message: "market, quantity and side are required",
    });
  }

  if (!["buy", "sell"].includes(side)) {
    return res.status(400).json({
      message: "Invalid side",
    });
  }

  if (!["limit", "market"].includes(orderType)) {
    return res.status(400).json({
      message: "Invalid order type",
    });
  }

  if (orderType === "limit" && !price) {
    return res.status(400).json({
      message: "price is required for limit orders",
    });
  }

  const numericQuantity = Number(quantity);

  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    return res.status(400).json({
      message: "Quantity must be greater than zero",
    });
  }

  if (price !== undefined) {
    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        message: "Price must be greater than zero",
      });
    }

    if (orderType === "limit") {
      const marketConfig = Object.values(MARKETS).find(
        (config) => config.symbol === market,
      );

      if (!marketConfig) {
        return res.status(400).json({
          message: "Unsupported market",
        });
      }

      const bandRatio = PRICE_BAND_PERCENT / 100;
      const minimumPrice = marketConfig.startPrice * (1 - bandRatio);
      const maximumPrice = marketConfig.startPrice * (1 + bandRatio);

      if (numericPrice < minimumPrice || numericPrice > maximumPrice) {
        return res.status(400).json({
          message: `Limit price must be within ${PRICE_BAND_PERCENT}% of the reference price (${minimumPrice.toFixed(2)}-${maximumPrice.toFixed(2)} ${marketConfig.quoteAsset})`,
        });
      }
    }
  }

  const response = (await RedisManager.getInstance().sendAndAwait({
    type: CREATE_ORDER,
    data: {
      market,
      orderType,
      price,
      quantity,
      side,
      userId,
    },
  })) as MessageToApi;

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
