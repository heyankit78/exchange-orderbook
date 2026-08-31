import { Client } from "pg";
import { createClient } from "redis";
import { DbMessage } from "@repo/shared";

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
      const orderData = data.data;

      // 1. Cancellation update
      if ("cancelled" in orderData && orderData.cancelled) {
        await pgClient.query(
          `
      UPDATE orders
      SET order_status = 'CANCELLED',
          updated_at = NOW()
      WHERE order_id = $1
      `,
          [orderData.orderId],
        );

        continue;
      }

      // 2. New/incoming order
      if ("userId" in orderData) {
        const {
          orderId,
          userId,
          market,
          price,
          quantity,
          side,
          executedQuantity,
        } = orderData;

        const qty = Number(quantity);
        const filled = Number(executedQuantity);

        if (!Number.isFinite(filled)) {
          console.error("INVALID executedQuantity:", {
            executedQuantity,
            data: orderData,
          });
          continue;
        }

        let status = "OPEN";

        if (filled > 0 && filled < qty) {
          status = "PARTIALLY_FILLED";
        } else if (filled >= qty) {
          status = "FILLED";
        }

        await pgClient.query(
          `
      INSERT INTO orders (
        order_id,
        user_id,
        market,
        side,
        price,
        quantity,
        filled,
        order_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (order_id) DO NOTHING
      `,
          [orderId, userId, market, side, price, quantity, filled, status],
        );

        continue;
      }

      // 3. Existing maker order was filled more
      const { orderId, executedQuantity } = orderData;

      const result = await pgClient.query(
        `
    SELECT quantity, filled
    FROM orders
    WHERE order_id = $1
    `,
        [orderId],
      );

      if (result.rows.length === 0) {
        continue;
      }

      const totalQuantity = Number(result.rows[0].quantity);
      const oldFilled = Number(result.rows[0].filled);
      const additionalFilled = Number(executedQuantity);

      if (!Number.isFinite(additionalFilled)) {
        console.error("INVALID executedQuantity:", {
          executedQuantity,
          data: orderData,
        });
        continue;
      }

      const newFilled = oldFilled + additionalFilled;

      const status = newFilled >= totalQuantity ? "FILLED" : "PARTIALLY_FILLED";

      await pgClient.query(
        `
    UPDATE orders
    SET filled = $1,
        order_status = $2,
        updated_at = NOW()
    WHERE order_id = $3
    `,
        [newFilled, status, orderId],
      );
    }
  }
}

main();
