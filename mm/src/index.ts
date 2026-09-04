import axios from "axios";

const BASE_URL = "http://localhost:3000";
const TOTAL_BIDS = 15;
const TOTAL_ASKS = 15;
const MARKET = "TATA_INR";

const MM_EMAIL = "mm@test.com";
const MM_PASSWORD = "password123";

async function loginMarketMaker() {
  const response = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email: MM_EMAIL,
    password: MM_PASSWORD,
  });

  return response.data.token;
}

async function main(token: string) {
  const price = 1000 + Math.random() * 10;

  const openOrders = await axios.get(
    `${BASE_URL}/api/v1/order/open?market=${MARKET}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  const totalBids = openOrders.data.filter((o: any) => o.side === "buy").length;

  const totalAsks = openOrders.data.filter(
    (o: any) => o.side === "sell",
  ).length;

  const cancelledBids = await cancelBidsMoreThan(openOrders.data, price, token);

  const cancelledAsks = await cancelAsksLessThan(openOrders.data, price, token);

  const remainingBids = totalBids - cancelledBids;
  const remainingAsks = totalAsks - cancelledAsks;

  let bidsToAdd = TOTAL_BIDS - remainingBids;
  let asksToAdd = TOTAL_ASKS - remainingAsks;

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
            Authorization: `Bearer ${token}`,
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
            Authorization: `Bearer ${token}`,
          },
        },
      );

      asksToAdd--;
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));

  await main(token);
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

async function start() {
  const token = await loginMarketMaker();

  console.log("Market maker logged in");

  await main(token);
}

start().catch((error) => {
  console.error("MM crashed:", error);
});
