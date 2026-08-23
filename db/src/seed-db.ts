const { Client } = require("pg");

const client = new Client({
  user: "your_user",
  host: "localhost",
  database: "my_database",
  password: "your_password",
  port: 5432,
});

async function initializeDB() {
  await client.connect();

  await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
  console.log("users table ready");

  await client.query(`
        CREATE TABLE IF NOT EXISTS balances (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            asset VARCHAR(20) NOT NULL,
            available NUMERIC(30, 10) NOT NULL DEFAULT 0,
            locked NUMERIC(30, 10) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (user_id, asset)
        );
    `);
  console.log("balances table ready");

  await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
            order_id VARCHAR(50) PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            market VARCHAR(20) NOT NULL,
            side VARCHAR(10) NOT NULL,
            price NUMERIC(30, 10) NOT NULL,
            quantity NUMERIC(30, 10) NOT NULL,
            filled NUMERIC(30, 10) NOT NULL DEFAULT 0,
            order_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
  console.log("orders table ready");

  await client.query(`
  CREATE TABLE IF NOT EXISTS trades (
    trade_id VARCHAR(50) PRIMARY KEY,

    market VARCHAR(30) NOT NULL,

    price NUMERIC(30, 10) NOT NULL,

    quantity NUMERIC(30, 10) NOT NULL,

    quote_quantity NUMERIC(30, 10) NOT NULL,

    buyer_user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    seller_user_id INTEGER NOT NULL
      REFERENCES users(id)
      ON DELETE CASCADE,

    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`);

  console.log("Trades table ready");

  await client.query(`
        CREATE TABLE IF NOT EXISTS market_prices (
            time   TIMESTAMPTZ NOT NULL,
            price  DOUBLE PRECISION NOT NULL,
            volume DOUBLE PRECISION NOT NULL,
            market VARCHAR(20) NOT NULL
        );
    `);
  await client.query(`
        SELECT create_hypertable('market_prices', 'time', if_not_exists => TRUE);
    `);
  console.log("market_prices hypertable ready");

  await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1m AS
        SELECT
            time_bucket('1 minute', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            market
        FROM market_prices
        GROUP BY bucket, market;
    `);

  await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1h AS
        SELECT
            time_bucket('1 hour', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            market
        FROM market_prices
        GROUP BY bucket, market;
    `);

  await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS klines_1w AS
        SELECT
            time_bucket('1 week', time) AS bucket,
            first(price, time) AS open,
            max(price) AS high,
            min(price) AS low,
            last(price, time) AS close,
            sum(volume) AS volume,
            market
        FROM market_prices
        GROUP BY bucket, market;
    `);
  console.log("klines views ready");

  await client.end();
  console.log("Database initialized successfully");
}

initializeDB().catch(console.error);
