import axios from "axios";
import { Balances, Depth, KLine, Ticker, Trade, OpenOrder } from "./types";

function requiredPublicEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

const API_URL = requiredPublicEnv("NEXT_PUBLIC_API_URL");

const api = axios.create({
  baseURL: API_URL,
});

/*
  If any protected API says the JWT is expired/invalid,
  send the user back to login instead of leaving empty UI.
*/
api.interceptors.response.use(
  (response) => response,

  async (error) => {
    return Promise.reject(error);
  },
);
export async function getOpenOrders(
  market: string,
  token: string,
): Promise<OpenOrder[]> {
  const response = await api.get(`/order/open?market=${market}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function cancelOrder(
  orderId: string,
  market: string,
  token: string,
) {
  const response = await api.delete("/order", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    data: {
      orderId,
      market,
    },
  });

  return response.data;
}

export async function getTicker(market: string): Promise<Ticker> {
  const tickers = await getTickers();

  const ticker = tickers.find((t) => t.symbol === market);

  if (!ticker) {
    throw new Error(`No ticker found for ${market}`);
  }

  return ticker;
}

export async function getTickers(): Promise<Ticker[]> {
  const response = await api.get("/tickers");

  const data = response.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    return Object.entries(data).map(([symbol, ticker]: [string, any]) => ({
      symbol,
      ...ticker,
    }));
  }

  return [];
}

export async function getDepth(market: string): Promise<Depth> {
  const response = await api.get(`/depth?symbol=${market}`);

  return response.data;
}

export async function getTrades(market: string): Promise<Trade[]> {
  const response = await api.get(`/trades?symbol=${market}`);

  return response.data;
}

export async function getMyTrades(market: string, token: string) {
  const response = await api.get(`/trades/my-trades?market=${market}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function placeOrder(
  market: string,
  orderType: "limit" | "market",
  price: string | undefined,
  quantity: string,
  side: "buy" | "sell",
  token: string,
) {
  const response = await api.post(
    "/order",
    {
      market,
      orderType,
      price,
      quantity,
      side,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return response.data;
}

export async function getOrderHistory(market: string, token: string) {
  const response = await api.get(`/order/history?market=${market}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function getBalance(token: string): Promise<Balances> {
  const response = await api.get("/balance", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
}

export async function getKlines(
  market: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<KLine[]> {
  const response = await api.get(
    `/klines?symbol=${market}&interval=${interval}&startTime=${startTime}&endTime=${endTime}`,
  );

  const data: KLine[] = response.data;

  return data.sort((x, y) => (Number(x.end) < Number(y.end) ? -1 : 1));
}
