import { Client } from "pg";
import { createClient } from "redis";
import { DbMessage } from "./types";

const pgClient = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});
pgClient.connect();

async function main() {
  const redisClient = createClient();
  await redisClient.connect();
  console.log("DB worker connected to Redis");

  while (true) {
    const response = await redisClient.rPop("db_processor");
    if (!response) continue;

    const data: DbMessage = JSON.parse(response);

    if (data.type === "TRADE_ADDED") {
      try {
        await pgClient.query(
          `INSERT INTO market_prices (time, price, volume, market)
                     VALUES ($1, $2, $3, $4)`,
          [
            new Date(data.data.timestamp),
            data.data.price,
            data.data.quoteQuantity,
            data.data.market,
          ],
        );

        await pgClient.query(
          `
          INSERT INTO trades (
            trade_id,
            market,
            price,
            quantity,
            quote_quantity,
            buyer_user_id,
            seller_user_id,
            created_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (trade_id) DO NOTHING
          `,
          [
            data.data.id,
            data.data.market,
            data.data.price,
            data.data.quantity,
            data.data.quoteQuantity,
            Number(data.data.buyerUserId),
            Number(data.data.sellerUserId),
            new Date(data.data.timestamp),
          ],
        );

        console.log(
          "Trade saved:",
          data.data.id,
          data.data.market,
          data.data.price,
        );
      } catch (e) {
        console.error("TRADE_ADDED error:", e);
      }
    }

    if (data.type === "ORDER_UPDATE") {
      const {
        orderId,
        userId,
        market,
        price,
        quantity,
        side,
        executedQuantity,
        cancelled,
      } = data.data;

      try {
        if (cancelled) {
          await pgClient.query(
            `
            UPDATE orders
            SET
              order_status = 'CANCELLED',
              updated_at = NOW()
            WHERE order_id = $1
            `,
            [orderId],
          );

          console.log("Order cancelled in DB:", orderId);

          continue;
        }
        // Has userId → this is a new order being inserted
        if (userId && market && price && quantity && side) {
          const qty = Number(quantity);
          const filled = Number(executedQuantity);

          let orderStatus = "OPEN";
          if (filled > 0 && filled < qty) orderStatus = "PARTIALLY_FILLED";
          else if (filled >= qty) orderStatus = "FILLED";

          await pgClient.query(
            `INSERT INTO orders (order_id, user_id, market, side, price, quantity, filled, order_status)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (order_id) DO NOTHING`,
            [
              orderId,
              Number(userId),
              market,
              side,
              price,
              quantity,
              filled,
              orderStatus,
            ],
          );
          console.log("Order inserted:", orderId, orderStatus);
        }
        // No userId → maker order got partially/fully filled, update it
        else {
          const result = await pgClient.query(
            `SELECT quantity, filled FROM orders WHERE order_id = $1`,
            [orderId],
          );

          if (result.rows.length === 0) {
            console.log("Maker order not found:", orderId);
            continue;
          }

          const totalQty = Number(result.rows[0].quantity);
          const oldFilled = Number(result.rows[0].filled);
          const newFilled = oldFilled + Number(executedQuantity);
          const orderStatus =
            newFilled >= totalQty ? "FILLED" : "PARTIALLY_FILLED";

          await pgClient.query(
            `UPDATE orders
                         SET filled = $1, order_status = $2, updated_at = NOW()
                         WHERE order_id = $3`,
            [newFilled, orderStatus, orderId],
          );
          console.log("Order updated:", orderId, orderStatus);
        }
      } catch (e) {
        console.error("ORDER_UPDATE error:", e);
      }
    }
  }
}

main();
