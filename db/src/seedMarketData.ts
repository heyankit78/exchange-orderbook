import { Client } from "pg";

const client = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

const MARKET = "TATA_INR";

/**
 * Change this only when you intentionally want
 * to generate a NEW historical seed.
 */
const SEED_KEY = "TATA_INR_7D_1M_V1";

const DAYS = 7;
const INTERVAL_MS = 60 * 1000; // 1 minute

const START_PRICE = 1000;

type SeedRow = {
  time: Date;
  price: number;
  volume: number;
};

/**
 * Deterministic pseudo-random generator.
 *
 * Same seed:
 * → same random sequence
 * → same historical chart every time.
 */
function createRandom(seed: number) {
  let value = seed;

  return () => {
    value = (value * 16807) % 2147483647;

    return (value - 1) / 2147483646;
  };
}

async function seed() {
  await client.connect();

  try {
    // --------------------------------------------------
    // 1. CREATE SEED MARKER TABLE
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS market_data_seed_runs (
        seed_key VARCHAR(120) PRIMARY KEY,
        market VARCHAR(30) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // --------------------------------------------------
    // 2. START TRANSACTION
    // --------------------------------------------------

    await client.query("BEGIN");

    /**
     * Try to claim this seed.
     *
     * First execution:
     * → row inserted
     *
     * Second execution:
     * → ON CONFLICT
     * → nothing inserted
     */
    const markerResult = await client.query(
      `
        INSERT INTO market_data_seed_runs (
          seed_key,
          market
        )
        VALUES ($1, $2)

        ON CONFLICT (seed_key)
        DO NOTHING

        RETURNING seed_key
      `,
      [SEED_KEY, MARKET],
    );

    // --------------------------------------------------
    // ALREADY SEEDED
    // --------------------------------------------------

    if (markerResult.rows.length === 0) {
      await client.query("ROLLBACK");

      console.log(`ℹ️ Seed "${SEED_KEY}" already exists.`);

      console.log("No historical market data was inserted.");

      await client.end();

      return;
    }

    // --------------------------------------------------
    // 3. CREATE DETERMINISTIC TIME RANGE
    // --------------------------------------------------

    /**
     * Important:
     *
     * We don't use Date.now() directly.
     *
     * Instead, round current time to the beginning
     * of the current minute.
     *
     * Example:
     *
     * 21:43:37
     *
     * becomes
     *
     * 21:43:00
     */

    const now = new Date();

    now.setSeconds(0, 0);

    const endTime = now.getTime();

    const startTime = endTime - DAYS * 24 * 60 * 60 * 1000;

    // --------------------------------------------------
    // 4. DETERMINISTIC RANDOM WALK
    // --------------------------------------------------

    const random = createRandom(123456);

    let currentPrice = START_PRICE;

    const rows: SeedRow[] = [];

    for (
      let timestamp = startTime;
      timestamp < endTime;
      timestamp += INTERVAL_MS
    ) {
      /**
       * Price movement between roughly
       * -2 and +2
       */
      const movement = (random() - 0.5) * 4;

      currentPrice += movement;

      /**
       * Keep demo price within sensible range.
       */
      currentPrice = Math.max(950, Math.min(1050, currentPrice));

      const volume = 0.5 + random() * 5;

      rows.push({
        time: new Date(timestamp),
        price: Number(currentPrice.toFixed(2)),
        volume: Number(volume.toFixed(4)),
      });
    }

    console.log(`📊 Generated ${rows.length} historical market points`);

    console.log(`📅 From ${new Date(startTime).toISOString()}`);

    console.log(`📅 To   ${new Date(endTime).toISOString()}`);

    // --------------------------------------------------
    // 5. INSERT IN BATCHES
    // --------------------------------------------------

    const BATCH_SIZE = 500;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const values: unknown[] = [];

      const placeholders = batch.map((row, index) => {
        const offset = index * 4;

        values.push(row.time, row.price, row.volume, MARKET);

        return `
            (
              $${offset + 1},
              $${offset + 2},
              $${offset + 3},
              $${offset + 4}
            )
          `;
      });

      await client.query(
        `
          INSERT INTO market_prices (
            time,
            price,
            volume,
            market
          )
          VALUES
          ${placeholders.join(",")}
        `,
        values,
      );

      console.log(
        `Inserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`,
      );
    }

    // --------------------------------------------------
    // 6. COMMIT
    // --------------------------------------------------

    await client.query("COMMIT");

    console.log(`✅ Historical seed "${SEED_KEY}" committed`);

    // --------------------------------------------------
    // 7. REFRESH CURRENT MATERIALIZED VIEWS
    // --------------------------------------------------

    console.log("🔄 Refreshing kline views...");

    await client.query(`REFRESH MATERIALIZED VIEW klines_1m`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_1h`);

    await client.query(`REFRESH MATERIALIZED VIEW klines_1w`);

    console.log("✅ Kline views refreshed");

    console.log("✅ Historical market data seeded successfully");
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
