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

async function processDbMessage(data: DbMessage) {
  if (data.type === "TRADE_ADDED") {
    const tradeResult = await pgClient.query(
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
      RETURNING trade_id
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

    // Duplicate trade is still a successful/idempotent processing.
    // We just don't want another market_prices row.
    if (tradeResult.rowCount === 0) {
      console.log("Duplicate trade ignored:", data.data.id);
      return;
    }

    await pgClient.query(
      `
      INSERT INTO market_prices (
        time,
        price,
        volume,
        market
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        new Date(data.data.timestamp),
        data.data.price,
        data.data.quantity,
        data.data.market,
      ],
    );

    console.log(
      "Trade saved:",
      data.data.id,
      data.data.market,
      data.data.price,
    );

    return;
  }

  if (data.type === "ORDER_UPDATE") {
    const orderData = data.data;

    // 1. Cancellation
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

      console.log("Order cancelled:", orderData.orderId);

      return;
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
        throw new Error(
          `Invalid executedQuantity for order ${orderId}: ${executedQuantity}`,
        );
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

      console.log("Order saved:", {
        orderId,
        status,
      });

      return;
    }

    // 3. Existing maker order filled more
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
      console.log("Maker order not found:", orderId);

      // For now treat it as handled.
      // Later we can decide whether this should instead throw/retry.
      return;
    }

    const totalQuantity = Number(result.rows[0].quantity);
    const oldFilled = Number(result.rows[0].filled);
    const additionalFilled = Number(executedQuantity);

    if (!Number.isFinite(additionalFilled)) {
      throw new Error(
        `Invalid maker executedQuantity for ${orderId}: ${executedQuantity}`,
      );
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

    console.log("Maker order updated:", {
      orderId,
      oldFilled,
      additionalFilled,
      newFilled,
      status,
    });

    return;
  }
}

async function processStreamMessage(
  redisClient: ReturnType<typeof createClient>,
  streamId: string,
  rawMessage: string,
) {
  const data: DbMessage = JSON.parse(rawMessage);

  console.log("DB EVENT:", {
    streamId,
    type: data.type,
  });

  try {
    await processDbMessage(data);

    // console.log("SIMULATED DB WORKER CRASH BEFORE XACK:", {
    //   streamId,
    //   type: data.type,
    // });

    // process.exit(1);
    await redisClient.xAck("db_stream", "db-group", streamId);

    console.log("DB EVENT ACKED:", {
      streamId,
      type: data.type,
    });
  } catch (error) {
    console.error("DB EVENT FAILED:", {
      streamId,
      type: data.type,
      error,
    });

    // IMPORTANT:
    // no XACK
    // message stays pending
  }
}

async function main() {
  await pgClient.connect();

  console.log("DB worker connected to PostgreSQL");

  const redisClient = createClient();

  await redisClient.connect();

  console.log("DB worker connected to Redis");

  // ------------------------------------------------
  // Ensure stream + consumer group exist
  // ------------------------------------------------
  try {
    await redisClient.xGroupCreate("db_stream", "db-group", "0", {
      MKSTREAM: true,
    });

    console.log("db-group created");
  } catch (error: any) {
    if (!String(error?.message).includes("BUSYGROUP")) {
      throw error;
    }

    console.log("db-group already exists");
  }

  // ------------------------------------------------
  // 1. Recover pending messages for db-worker-1
  // ------------------------------------------------
  console.log("Starting DB pending recovery...");

  while (true) {
    const response = await redisClient.xReadGroup(
      "db-group",
      "db-worker-1",
      {
        key: "db_stream",
        id: "0",
      },
      {
        COUNT: 1,
      },
    );

    if (!response) {
      break;
    }

    const stream = response[0];

    if (!stream || stream.messages.length === 0) {
      break;
    }

    const redisMessage = stream.messages[0];

    const streamId = redisMessage.id;
    const rawMessage = redisMessage.message.message;

    console.log("RECOVERING DB EVENT:", streamId);

    await processStreamMessage(redisClient, streamId, rawMessage);
  }

  console.log("DB pending recovery finished");

  // ------------------------------------------------
  // 2. Read new DB events forever
  // ------------------------------------------------
  while (true) {
    const response = await redisClient.xReadGroup(
      "db-group",
      "db-worker-1",
      {
        key: "db_stream",
        id: ">",
      },
      {
        COUNT: 1,
        BLOCK: 0,
      },
    );

    if (!response) {
      continue;
    }

    const stream = response[0];

    if (!stream || stream.messages.length === 0) {
      continue;
    }

    const redisMessage = stream.messages[0];

    const streamId = redisMessage.id;
    const rawMessage = redisMessage.message.message;

    console.log("NEW DB EVENT:", streamId);

    await processStreamMessage(redisClient, streamId, rawMessage);
  }
}

main().catch((error) => {
  console.error("DB WORKER FATAL ERROR:", error);

  process.exit(1);
});
