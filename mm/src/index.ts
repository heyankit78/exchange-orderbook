import axios from "axios";

const BASE_URL = "http://localhost:3000";

const TOTAL_BIDS = 15;
const TOTAL_ASKS = 15;

const MARKET = "TATA_INR";

const MM_EMAIL = "mm@test.com";
const MM_PASSWORD = "password123";

const TAKER_EMAIL = "taker@test.com";
const TAKER_PASSWORD = "password123";

async function login(email: string, password: string) {
  const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email,
    password,
  });

  return response.data.token;
}

async function main(mmToken: string, takerToken: string) {
  const price = 1000 + Math.random() * 10;

  // -----------------------------
  // GET MM OPEN ORDERS
  // -----------------------------

  const openOrdersResponse = await axios.get(
    `${BASE_URL}/api/v1/order/open?market=${MARKET}`,
    {
      headers: {
        Authorization: `Bearer ${mmToken}`,
      },
    },
  );

  const openOrders = openOrdersResponse.data;

  const totalBids = openOrders.filter((o: any) => o.side === "buy").length;

  const totalAsks = openOrders.filter((o: any) => o.side === "sell").length;

  // -----------------------------
  // CANCEL STALE ORDERS
  // -----------------------------

  const cancelledBids = await cancelBidsMoreThan(openOrders, price, mmToken);

  const cancelledAsks = await cancelAsksLessThan(openOrders, price, mmToken);

  const remainingBids = totalBids - cancelledBids;

  const remainingAsks = totalAsks - cancelledAsks;

  let bidsToAdd = TOTAL_BIDS - remainingBids;

  let asksToAdd = TOTAL_ASKS - remainingAsks;

  // -----------------------------
  // REPLENISH ORDER BOOK
  // -----------------------------

  while (bidsToAdd > 0 || asksToAdd > 0) {
    if (bidsToAdd > 0) {
      await axios.post(
        `${BASE_URL}/api/v1/order`,
        {
          market: MARKET,
          price: (price - Math.random()).toFixed(1),
          quantity: "1",
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
      await axios.post(
        `${BASE_URL}/api/v1/order`,
        {
          market: MARKET,
          price: (price + Math.random()).toFixed(1),
          quantity: "1",
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

  // -----------------------------
  // OCCASIONALLY CREATE A TRADE
  // -----------------------------

  if (Math.random() < 0.3) {
    const refreshedOrdersResponse = await axios.get(
      `${BASE_URL}/api/v1/order/open?market=${MARKET}`,
      {
        headers: {
          Authorization: `Bearer ${mmToken}`,
        },
      },
    );

    await generateTrade(refreshedOrdersResponse.data, takerToken);
  }

  // -----------------------------
  // WAIT
  // -----------------------------

  await sleep(1000);

  await main(mmToken, takerToken);
}

async function generateTrade(openOrders: any[], takerToken: string) {
  const bids = openOrders
    .filter((o: any) => o.side === "buy")
    .sort((a: any, b: any) => Number(b.price) - Number(a.price));

  const asks = openOrders
    .filter((o: any) => o.side === "sell")
    .sort((a: any, b: any) => Number(a.price) - Number(b.price));

  const bestBid = bids[0];
  const bestAsk = asks[0];

  if (!bestBid || !bestAsk) {
    console.log("⚠️ No bid/ask available for trade");

    return;
  }

  // 50/50:
  // aggressive BUY or aggressive SELL

  if (Math.random() < 0.5) {
    // -----------------------------
    // TAKER BUY
    // -----------------------------
    // Buy exactly at best ask.
    // This should match the MM sell.

    await axios.post(
      `${BASE_URL}/api/v1/order`,
      {
        market: MARKET,
        price: String(bestAsk.price),
        quantity: "1",
        side: "buy",
      },
      {
        headers: {
          Authorization: `Bearer ${takerToken}`,
        },
      },
    );

    console.log("🔥 TAKER BUY @", bestAsk.price);
  } else {
    // -----------------------------
    // TAKER SELL
    // -----------------------------
    // Sell exactly at best bid.
    // This should match the MM buy.

    await axios.post(
      `${BASE_URL}/api/v1/order`,
      {
        market: MARKET,
        price: String(bestBid.price),
        quantity: "1",
        side: "sell",
      },
      {
        headers: {
          Authorization: `Bearer ${takerToken}`,
        },
      },
    );

    console.log("🔥 TAKER SELL @", bestBid.price);
  }
}

async function cancelBidsMoreThan(
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
            market: MARKET,
          },
        }),
      );
    }
  });

  await Promise.all(promises);

  return promises.length;
}

async function cancelAsksLessThan(
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
            market: MARKET,
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

  await main(mmToken, takerToken);
}

start().catch((error) => {
  console.error("❌ MM crashed:", error?.response?.data || error);
});
