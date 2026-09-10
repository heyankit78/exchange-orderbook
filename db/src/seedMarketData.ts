import { MARKETS } from "@repo/shared";
import { Client } from "pg";

const client = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

const MARKET_CONFIGS = Object.values(MARKETS);

const DAYS = 7;
const MINUTE_MS = 60 * 1000;
const TICKS_PER_MINUTE = 5;

type SeedRow = {
  time: Date;
  price: number;
  volume: number;
};

function createRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

async function seedMarket(
  config: (typeof MARKET_CONFIGS)[number],
  seedNumber: number,
) {
  const random = createRandom(seedNumber);

  const now = new Date();
  now.setSeconds(0, 0);

  const endTime = now.getTime();

  const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;

  let currentPrice: number = config.startPrice;

  const rows: SeedRow[] = [];

  for (
    let minuteStart = startTime;
    minuteStart < endTime;
    minuteStart += MINUTE_MS
  ) {
    const minuteTrend = (random() - 0.5) * config.minuteVolatility;

    for (let tick = 0; tick < TICKS_PER_MINUTE; tick++) {
      const tickOffset = Math.floor((tick / TICKS_PER_MINUTE) * MINUTE_MS);

      const timestamp = minuteStart + tickOffset;

      const noise = (random() - 0.5) * config.tickVolatility;

      currentPrice += minuteTrend / TICKS_PER_MINUTE + noise;

      currentPrice = Math.max(
        config.minPrice,
        Math.min(config.maxPrice, currentPrice),
      );

      const volume =
        config.minVolume + random() * (config.maxVolume - config.minVolume);

      rows.push({
        time: new Date(timestamp),

        price: Number(currentPrice.toFixed(config.priceDecimals)),

        volume: Number(volume.toFixed(6)),
      });
    }
  }

  console.log(`📊 ${config.symbol}: generated ${rows.length} ticks`);

  const BATCH_SIZE = 500;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const values: unknown[] = [];

    const placeholders = batch.map((row, index) => {
      const offset = index * 5;

      values.push(row.time, row.price, row.volume, config.symbol, "seed");

      return `
            (
              $${offset + 1},
              $${offset + 2},
              $${offset + 3},
              $${offset + 4},
              $${offset + 5}
            )
          `;
    });

    await client.query(
      `
        INSERT INTO market_prices (
          time,
          price,
          volume,
          market,
          source
        )
        VALUES
        ${placeholders.join(",")}
      `,
      values,
    );
  }

  console.log(`✅ ${config.symbol} seeded`);
}

async function seed() {
  await client.connect();

  try {
    await client.query("BEGIN");

    // -----------------------------------------
    // ENSURE SOURCE COLUMN EXISTS
    // -----------------------------------------

    await client.query(`
      ALTER TABLE market_prices
      ADD COLUMN IF NOT EXISTS source VARCHAR(20)
      DEFAULT 'live'
    `);

    // -----------------------------------------
    // REMOVE ONLY OLD GENERATED HISTORY
    // -----------------------------------------

    const deleted = await client.query(`
        DELETE FROM market_prices
        WHERE source = 'seed'
      `);

    console.log(`🧹 Removed ${deleted.rowCount ?? 0} old seeded rows`);

    // -----------------------------------------
    // CREATE FRESH HISTORY
    // -----------------------------------------

    for (let i = 0; i < MARKET_CONFIGS.length; i++) {
      await seedMarket(MARKET_CONFIGS[i], 123456 + i * 1000);
    }

    await client.query("COMMIT");

    console.log("✅ Fresh historical data committed");

    // -----------------------------------------
    // REFRESH KLINES
    // -----------------------------------------

    console.log("🔄 Refreshing kline views...");

    await client.query(`REFRESH MATERIALIZED VIEW klines_1m`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_5m`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_15m`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_1h`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_1w`);

    console.log("✅ All kline views refreshed");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("❌ Historical seed failed:", error);

    throw error;
  } finally {
    await client.end();
  }
}

seed().catch(() => {
  process.exit(1);
});
