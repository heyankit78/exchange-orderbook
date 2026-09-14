import "dotenv/config";
import axios from "axios";
import { MARKETS } from "@repo/shared";
import { seedBotBalances } from "./seedBotBalances";

const BASE_URL = process.env.API_URL;

const MM_EMAIL = process.env.MM_EMAIL;
const MM_PASSWORD = process.env.MM_PASSWORD;

const TAKER_EMAIL = process.env.TAKER_EMAIL;
const TAKER_PASSWORD = process.env.TAKER_PASSWORD;

if (!BASE_URL || !MM_EMAIL || !MM_PASSWORD || !TAKER_EMAIL || !TAKER_PASSWORD) {
  throw new Error("Missing MM environment variables");
}

const TOTAL_BIDS = 15;
const TOTAL_ASKS = 15;

const ACTIVE_MARKETS = [MARKETS.BTC_USDC, MARKETS.ETH_USDC, MARKETS.SOL_USDC];

type MarketConfig = (typeof ACTIVE_MARKETS)[number];

async function login(email: string, password: string) {
  const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email,
    password,
  });

  return response.data.token;
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

    await sleep(1000);
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

  if (Math.random() < 0.3) {
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

  await seedBotBalances(mmToken, takerToken);

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
