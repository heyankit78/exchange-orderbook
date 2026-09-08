import { Client } from "pg";

const client = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

const REFRESH_INTERVAL_MS = 10_000;

let isRefreshing = false;

async function refreshViews() {
  if (isRefreshing) {
    console.log("⏳ Previous kline refresh still running, skipping...");
    return;
  }

  try {
    isRefreshing = true;

    const startedAt = Date.now();

    await client.query("REFRESH MATERIALIZED VIEW klines_1m");
    await client.query("REFRESH MATERIALIZED VIEW klines_5m");
    await client.query("REFRESH MATERIALIZED VIEW klines_15m");
    await client.query("REFRESH MATERIALIZED VIEW klines_1h");
    await client.query("REFRESH MATERIALIZED VIEW klines_1w");

    console.log(`✅ Kline views refreshed in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error("❌ Failed to refresh kline views:", error);
  } finally {
    isRefreshing = false;
  }
}

async function start() {
  await client.connect();

  console.log("✅ Kline refresh worker connected to PostgreSQL");

  // refresh immediately when worker starts
  await refreshViews();

  setInterval(() => {
    refreshViews();
  }, REFRESH_INTERVAL_MS);
}

async function shutdown() {
  console.log("🛑 Stopping kline refresh worker...");

  await client.end();

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch(async (error) => {
  console.error("❌ Kline refresh worker crashed:", error);

  try {
    await client.end();
  } catch {}

  process.exit(1);
});
