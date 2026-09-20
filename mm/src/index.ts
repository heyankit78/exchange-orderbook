import "dotenv/config";
import axios from "axios";
import { MARKETS } from "@repo/shared";
import { seedBotBalances } from "./seedBotBalances";

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

const BASE_URL = requiredEnv("API_URL");
const MM_EMAIL = requiredEnv("MM_EMAIL");
const MM_PASSWORD = requiredEnv("MM_PASSWORD");
const TAKER_EMAIL = requiredEnv("TAKER_EMAIL");
const TAKER_PASSWORD = requiredEnv("TAKER_PASSWORD");

const TOTAL_BIDS = Number(process.env.MM_TOTAL_BIDS ?? 5);
const TOTAL_ASKS = Number(process.env.MM_TOTAL_ASKS ?? 5);
const LOOP_INTERVAL_MS = Number(process.env.MM_LOOP_INTERVAL_MS ?? 2000);
const TRADE_PROBABILITY = Number(process.env.MM_TRADE_PROBABILITY ?? 0.1);

const ACTIVE_MARKETS = [MARKETS.BTC_USDC, MARKETS.ETH_USDC, MARKETS.SOL_USDC];

type MarketConfig = (typeof ACTIVE_MARKETS)[number];

async function login(email: string, password: string) {
  const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email,
    password,
  });

  return response.data.accessToken;
}

async function runMarketLoop(
  config: MarketConfig,
  mmToken: string,
  takerToken: string,
) {
  console.log(`🚀 Starting market loop for ${config.symbol}`);

  while (true) {
    try {
      await maintainMarket(config, mmToken, takerToken);
    } catch (error: any) {
      console.error(
        `❌ ${config.symbol} market loop error:`,
        error?.response?.data || error,
      );
    }

    await sleep(LOOP_INTERVAL_MS);
  }
}

async function maintainMarket(
  config: MarketConfig,
  mmToken: string,
  takerToken: string,
) {
  const price =
    config.startPrice + (Math.random() - 0.5) * config.minuteVolatility;

  // --------------------------------------------------
  // GET MM OPEN ORDERS
  // --------------------------------------------------

  const openOrdersResponse = await axios.get(
    `${BASE_URL}/api/v1/order/open?market=${config.symbol}`,
    {
      headers: {
        Authorization: `Bearer ${mmToken}`,
      },
    },
  );

  const openOrders = openOrdersResponse.data;

  const totalBids = openOrders.filter((o: any) => o.side === "buy").length;

  const totalAsks = openOrders.filter((o: any) => o.side === "sell").length;

  // --------------------------------------------------
  // CANCEL STALE ORDERS
  // --------------------------------------------------

  const cancelledBids = await cancelBidsMoreThan(
    config,
    openOrders,
    price,
    mmToken,
  );

  const cancelledAsks = await cancelAsksLessThan(
    config,
    openOrders,
    price,
    mmToken,
  );

  const remainingBids = totalBids - cancelledBids;

  const remainingAsks = totalAsks - cancelledAsks;

  let bidsToAdd = TOTAL_BIDS - remainingBids;

  let asksToAdd = TOTAL_ASKS - remainingAsks;

  // --------------------------------------------------
  // REPLENISH ORDER BOOK
  // --------------------------------------------------

  while (bidsToAdd > 0 || asksToAdd > 0) {
    if (bidsToAdd > 0) {
      const bidPrice = price - Math.random() * config.spread;

      await axios.post(
        `${BASE_URL}/api/v1/order`,
        {
          market: config.symbol,

          price: bidPrice.toFixed(config.priceDecimals),

          quantity: String(config.mmQuantity),

          side: "buy",
        },
        {
          headers: {
            Authorization: `Bearer ${mmToken}`,
          },
        },
      );

      bidsToAdd--;
    }

    if (asksToAdd > 0) {
      const askPrice = price + Math.random() * config.spread;

      await axios.post(
        `${BASE_URL}/api/v1/order`,
        {
          market: config.symbol,

          price: askPrice.toFixed(config.priceDecimals),

          quantity: String(config.mmQuantity),

          side: "sell",
        },
        {
          headers: {
            Authorization: `Bearer ${mmToken}`,
          },
        },
      );

      asksToAdd--;
    }
  }

  // --------------------------------------------------
  // OCCASIONALLY CREATE A TRADE
  // --------------------------------------------------

  if (Math.random() < TRADE_PROBABILITY) {
    const refreshedOrdersResponse = await axios.get(
      `${BASE_URL}/api/v1/order/open?market=${config.symbol}`,
      {
        headers: {
          Authorization: `Bearer ${mmToken}`,
        },
      },
    );

    await generateTrade(config, refreshedOrdersResponse.data, takerToken);
  }
}

async function generateTrade(
  config: MarketConfig,
  openOrders: any[],
  takerToken: string,
) {
  const bids = openOrders
    .filter((o: any) => o.side === "buy")
    .sort((a: any, b: any) => Number(b.price) - Number(a.price));

  const asks = openOrders
    .filter((o: any) => o.side === "sell")
    .sort((a: any, b: any) => Number(a.price) - Number(b.price));

  const bestBid = bids[0];
  const bestAsk = asks[0];

  if (!bestBid || !bestAsk) {
    console.log(`⚠️ ${config.symbol}: no bid/ask available`);

    return;
  }

  // --------------------------------------------------
  // 50/50 TAKER BUY OR SELL
  // --------------------------------------------------

  if (Math.random() < 0.5) {
    // ----------------------------------------------
    // TAKER BUY
    // ----------------------------------------------
    //
    // Buy exactly at best ask.
    // This crosses the spread and should execute.
    //

    await axios.post(
      `${BASE_URL}/api/v1/order`,
      {
        market: config.symbol,

        price: String(bestAsk.price),

        quantity: String(config.mmQuantity),

        side: "buy",
      },
      {
        headers: {
          Authorization: `Bearer ${takerToken}`,
        },
      },
    );

    console.log(`🔥 ${config.symbol} TAKER BUY @ ${bestAsk.price}`);
  } else {
    // ----------------------------------------------
    // TAKER SELL
    // ----------------------------------------------
    //
    // Sell exactly at best bid.
    // This crosses the spread and should execute.
    //

    await axios.post(
      `${BASE_URL}/api/v1/order`,
      {
        market: config.symbol,

        price: String(bestBid.price),

        quantity: String(config.mmQuantity),

        side: "sell",
      },
      {
        headers: {
          Authorization: `Bearer ${takerToken}`,
        },
      },
    );

    console.log(`🔥 ${config.symbol} TAKER SELL @ ${bestBid.price}`);
  }
}

async function cancelBidsMoreThan(
  config: MarketConfig,
  openOrders: any[],
  price: number,
  token: string,
) {
  const promises: Promise<any>[] = [];

  openOrders.forEach((o) => {
    if (o.side === "buy" && (Number(o.price) > price || Math.random() < 0.1)) {
      promises.push(
        axios.delete(`${BASE_URL}/api/v1/order`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          data: {
            orderId: o.orderId,

            market: config.symbol,
          },
        }),
      );
    }
  });

  await Promise.all(promises);

  return promises.length;
}

async function cancelAsksLessThan(
  config: MarketConfig,
  openOrders: any[],
  price: number,
  token: string,
) {
  const promises: Promise<any>[] = [];

  openOrders.forEach((o) => {
    if (o.side === "sell" && (Number(o.price) < price || Math.random() < 0.5)) {
      promises.push(
        axios.delete(`${BASE_URL}/api/v1/order`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },

          data: {
            orderId: o.orderId,

            market: config.symbol,
          },
        }),
      );
    }
  });

  await Promise.all(promises);

  return promises.length;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start() {
  const mmToken = await login(MM_EMAIL, MM_PASSWORD);

  console.log("✅ Market maker logged in");

  const takerToken = await login(TAKER_EMAIL, TAKER_PASSWORD);

  console.log("✅ Taker bot logged in");

  if (process.env.SEED_BOT_BALANCES === "true") {
    await seedBotBalances(mmToken, takerToken);
    console.log("✅ Bot balances ready");
  } else {
    console.log("ℹ️ Bot balance seeding skipped");
  }
  console.log(
    "📈 Active markets:",
    ACTIVE_MARKETS.map((market) => market.symbol),
  );

  await Promise.all(
    ACTIVE_MARKETS.map((config) => runMarketLoop(config, mmToken, takerToken)),
  );
}

start().catch((error) => {
  console.error("❌ MM crashed:", error?.response?.data || error);
});
