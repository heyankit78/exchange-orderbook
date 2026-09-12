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
  // =========================================================
  // 1. TRADE ADDED
  // =========================================================
  if (data.type === "TRADE_ADDED") {
    try {
      await pgClient.query("BEGIN");
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

      // Duplicate trade is still considered successfully processed.
      // This prevents duplicate market_prices rows on retry.
      if (tradeResult.rowCount === 0) {
        await pgClient.query("COMMIT");
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
      await pgClient.query("COMMIT");

      return;
    } catch (error) {
      await pgClient.query("ROLLBACK");
      throw error;
    }
  }

  // =========================================================
  // 2. ORDER UPDATE
  // =========================================================
  if (data.type === "ORDER_UPDATE") {
    const orderData = data.data;

    // ---------------------------------------------------------
    // 2A. ORDER CANCELLATION
    // ---------------------------------------------------------
    if ("cancelled" in orderData && orderData.cancelled) {
      await pgClient.query(
        `
    UPDATE orders
    SET
      order_status = CASE
        WHEN order_status = 'FILLED'
          THEN 'FILLED'
        ELSE 'CANCELLED'
      END,

      updated_at = NOW()

    WHERE order_id = $1
  `,
        [orderData.orderId],
      );

      console.log("Order cancelled:", orderData.orderId);

      return;
    }

    // ---------------------------------------------------------
    // 2B. NEW / INCOMING ORDER
    // ---------------------------------------------------------
    if ("userId" in orderData) {
      const {
        orderId,
        userId,
        market,
        price,
        quantity,
        side,
        executedQuantity,
        orderType,
        status: incomingStatus,
      } = orderData;

      const qty = Number(quantity);
      const filled = Number(executedQuantity);

      if (!Number.isFinite(qty)) {
        throw new Error(`Invalid quantity for order ${orderId}: ${quantity}`);
      }

      if (!Number.isFinite(filled)) {
        throw new Error(
          `Invalid executedQuantity for order ${orderId}: ${executedQuantity}`,
        );
      }

      const normalizedOrderType = orderType === "MARKET" ? "MARKET" : "LIMIT";

      const status =
        incomingStatus ??
        (normalizedOrderType === "MARKET"
          ? filled >= qty
            ? "FILLED"
            : "CANCELLED"
          : filled >= qty
            ? "FILLED"
            : filled > 0
              ? "PARTIALLY_FILLED"
              : "OPEN");

      await pgClient.query(
        `
    INSERT INTO orders (
      order_id,
      user_id,
      market,
      side,
      price,
      order_type,
      quantity,
      filled,
      order_status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)

    ON CONFLICT (order_id)
    DO UPDATE SET
      filled = GREATEST(
        orders.filled,
        EXCLUDED.filled
      ),

      order_status =
        CASE
          WHEN orders.order_status IN ('FILLED', 'CANCELLED')
            THEN orders.order_status

          WHEN EXCLUDED.order_status = 'FILLED'
            THEN 'FILLED'

          WHEN EXCLUDED.order_status = 'CANCELLED'
            THEN 'CANCELLED'

          WHEN GREATEST(
            orders.filled,
            EXCLUDED.filled
          ) > 0
            THEN 'PARTIALLY_FILLED'

          ELSE 'OPEN'
        END,

      updated_at = NOW()
    `,
        [
          orderId,
          userId,
          market,
          side,
          price,
          normalizedOrderType,
          quantity,
          filled,
          status,
        ],
      );

      console.log("Order saved:", {
        orderId,
        orderType: normalizedOrderType,
        filled,
        status,
      });

      return;
    }

    // ---------------------------------------------------------
    // 2C. EXISTING MAKER ORDER FILLED MORE
    // ---------------------------------------------------------

    const { orderId, makerFilledQuantity } = orderData;

    const absoluteFilled = Number(makerFilledQuantity);

    if (!Number.isFinite(absoluteFilled)) {
      throw new Error(
        `Invalid makerFilledQuantity for ${orderId}: ${makerFilledQuantity}`,
      );
    }

    const result = await pgClient.query(
      `
      SELECT quantity, filled
      FROM orders
      WHERE order_id = $1
      `,
      [orderId],
    );

    if (result.rows.length === 0) {
      throw new Error(`Maker order not found: ${orderId}`);
    }

    const totalQuantity = Number(result.rows[0].quantity);
    const currentFilled = Number(result.rows[0].filled);

    if (!Number.isFinite(totalQuantity)) {
      throw new Error(
        `Invalid total quantity stored for maker order ${orderId}`,
      );
    }

    if (!Number.isFinite(currentFilled)) {
      throw new Error(
        `Invalid current filled quantity stored for maker order ${orderId}`,
      );
    }

    await pgClient.query(
      `
      UPDATE orders
      SET
        filled = GREATEST(filled, $1),
        order_status =
          CASE
            WHEN GREATEST(filled, $1) >= quantity
              THEN 'FILLED'
            ELSE 'PARTIALLY_FILLED'
          END,
        updated_at = NOW()
      WHERE order_id = $2
      `,
      [absoluteFilled, orderId],
    );

    console.log("Maker order updated:", {
      orderId,
      currentFilled,
      makerFilledQuantity: absoluteFilled,
      finalFilled: Math.max(currentFilled, absoluteFilled),
      status:
        Math.max(currentFilled, absoluteFilled) >= totalQuantity
          ? "FILLED"
          : "PARTIALLY_FILLED",
    });

    return;
  }
}

// =========================================================
// PROCESS ONE REDIS STREAM MESSAGE
// =========================================================

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

    // if (data.type === "ORDER_UPDATE" && "makerFilledQuantity" in data.data) {
    //   console.log("SIMULATED MAKER UPDATE CRASH BEFORE XACK:", {
    //     streamId,
    //     orderId: data.data.orderId,
    //     makerFilledQuantity: data.data.makerFilledQuantity,
    //   });

    //   process.exit(1);
    // }

    await redisClient.xAck("db_stream", "db-group", streamId);

    console.log("DB EVENT ACKED:", {
      streamId,
      type: data.type,
    });
    return true;
  } catch (error) {
    console.error("DB EVENT FAILED:", {
      streamId,
      type: data.type,
      error,
    });

    return false;
    // No XACK.
    // Message remains pending in Redis.
  }
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  // ---------------------------------------------------------
  // PostgreSQL
  // ---------------------------------------------------------

  await pgClient.connect();

  console.log("DB worker connected to PostgreSQL");

  // ---------------------------------------------------------
  // Redis
  // ---------------------------------------------------------

  const redisClient = createClient();

  await redisClient.connect();

  console.log("DB worker connected to Redis");

  // ---------------------------------------------------------
  // Ensure stream + consumer group exist
  // ---------------------------------------------------------

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

  // =========================================================
  // 1. RECOVER PENDING MESSAGES
  // =========================================================

  console.log("Starting DB pending recovery...");
  let retryCount = 0;
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

    // await processStreamMessage(redisClient, streamId, rawMessage);
    const success = await processStreamMessage(
      redisClient,
      streamId,
      rawMessage,
    );

    if (success) {
      retryCount = 0;
      continue;
    }
    retryCount++;
    if (retryCount >= 3) {
      console.log("Message failed 3 times. Stopping recovery.");
      break;
    }
  }

  console.log("DB pending recovery finished");

  // =========================================================
  // 2. READ NEW DB EVENTS
  // =========================================================

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

    // await processStreamMessage(redisClient, streamId, rawMessage);
    const success = await processStreamMessage(
      redisClient,
      streamId,
      rawMessage,
    );

    if (!success) {
      console.log("New DB event failed. Message remains pending:", streamId);
    }
  }
}

main().catch((error) => {
  console.error("DB WORKER FATAL ERROR:", error);

  process.exit(1);
});
