import { beforeEach, describe, expect, it, vi } from "vitest";
import { Engine } from "../trade/Engine";
import {
  CANCEL_ORDER,
  CREATE_ORDER,
  GET_BALANCE,
  GET_DEPTH,
  GET_OPEN_ORDERS,
  ON_RAMP,
} from "@repo/shared";

const sendToApiMock = vi.fn();
const publishMessageMock = vi.fn();
const pushMessageMock = vi.fn();

vi.mock("../RedisManager", () => ({
  RedisManager: {
    getInstance: () => ({
      publishMessage: publishMessageMock,
      sendToApi: sendToApiMock,
      pushMessage: pushMessageMock,
    }),
  },
}));

function createTestEngine() {
  const engine = new Engine();

  // createOrder() checks PostgreSQL for an existing order.
  // The real pg.Client is never connect()ed in unit tests, so an unmocked
  // query() never settles and createOrder hangs forever.
  // Pretend the DB returns "no existing order".
  (engine as any).pgClient.query = vi.fn().mockResolvedValue({
    rows: [],
  });

  // Prevent unit tests from writing balances to real PostgreSQL.
  vi.spyOn(engine, "persistBalance").mockResolvedValue();
  vi.spyOn(engine, "persistAllBalances").mockResolvedValue();

  return engine;
}

describe("Engine", () => {
  beforeEach(() => {
    // NOTE: clearAllMocks() only clears call history, not implementations,
    // so the stubs installed by createTestEngine() survive.
    // Do NOT switch this to resetAllMocks() / mockReset: true.
    vi.clearAllMocks();
  });

  it("Publishes Trade updates", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    const publishSpy = vi.spyOn(engine, "publishWsTrades");

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "1",
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "1",
    });

    expect(publishSpy).toHaveBeenCalledTimes(2);
  });

  it("Rejects buy order when user has insufficient balance", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    expect(sendToApiMock).toHaveBeenCalledWith("client-1", {
      type: "ORDER_CANCELLED",
      payload: {
        orderId: "",
        executedQuantity: 0,
        remainingQty: 0,
        error: "Insufficient funds",
      },
    });

    expect(pushMessageMock).not.toHaveBeenCalled();
  });

  it("Locks USDC when buy order is placed", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.USDC.available).toBe(8000);
    expect(userBalance.USDC.locked).toBe(2000);
  });

  it("Locks BTC when sell order is placed", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "3",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("2");

    expect(userBalance.BTC.available).toBe(7);
    expect(userBalance.BTC.locked).toBe(3);
  });

  it("Updates buyer and seller balances after a complete trade", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Buyer places order first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // Seller matches it
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const buyerBalance = (engine as any).balances.get("1");
    const sellerBalance = (engine as any).balances.get("2");

    expect(buyerBalance.USDC.available).toBe(8000);
    expect(buyerBalance.USDC.locked).toBe(0);
    expect(buyerBalance.BTC.available).toBe(2);

    expect(sellerBalance.BTC.available).toBe(8);
    expect(sellerBalance.BTC.locked).toBe(0);
    expect(sellerBalance.USDC.available).toBe(2000);
  });

  it("Refunds buyer when trade executes below buy limit price", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller becomes maker at 900
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "900",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Buyer is willing to pay up to 1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const buyerBalance = (engine as any).balances.get("1");
    const sellerBalance = (engine as any).balances.get("2");

    expect(buyerBalance.USDC.available).toBe(8200);
    expect(buyerBalance.USDC.locked).toBe(0);
    expect(buyerBalance.BTC.available).toBe(2);

    expect(sellerBalance.USDC.available).toBe(1800);
    expect(sellerBalance.BTC.available).toBe(8);
    expect(sellerBalance.BTC.locked).toBe(0);
  });

  it("Sends trade and order updates to DB worker after a trade", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    expect(pushMessageMock).toHaveBeenCalledTimes(4);

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    const orderMessages = messages.filter(
      (message) => message.type === "ORDER_UPDATE",
    );

    expect(tradeMessages.length).toBe(1);
    expect(orderMessages.length).toBe(3);
  });

  it("Sends correct TRADE_ADDED payload", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessage = messages.find(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessage).toBeDefined();

    expect(tradeMessage).toMatchObject({
      type: "TRADE_ADDED",
      data: {
        market: "BTC_USDC",
        price: "1000",
        quantity: "1",
        quoteQuantity: "1000",
        buyerUserId: "1",
        sellerUserId: "2",
        isBuyerMaker: true,
      },
    });

    expect(tradeMessage.data.id).toBeDefined();
    expect(tradeMessage.data.timestamp).toBeDefined();
  });

  it("Sets isBuyerMaker false when seller is maker", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller rests first → seller becomes maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Buyer comes second → buyer is taker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessage = messages.find(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessage).toBeDefined();

    expect(tradeMessage).toMatchObject({
      type: "TRADE_ADDED",
      data: {
        market: "BTC_USDC",
        price: "1000",
        quantity: "1",
        quoteQuantity: "1000",
        buyerUserId: "1",
        sellerUserId: "2",
        isBuyerMaker: false,
      },
    });
  });

  it("Keeps remaining USDC locked after a partial buy fill", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Buyer places BUY 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // Seller only sells 2
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const buyerBalance = (engine as any).balances.get("1");
    const sellerBalance = (engine as any).balances.get("2");

    expect(buyerBalance.USDC.available).toBe(5000);
    expect(buyerBalance.USDC.locked).toBe(3000);
    expect(buyerBalance.BTC.available).toBe(2);

    expect(sellerBalance.BTC.available).toBe(8);
    expect(sellerBalance.BTC.locked).toBe(0);
    expect(sellerBalance.USDC.available).toBe(2000);
  });

  it("Keeps remaining BTC locked after a partial sell fill", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller places SELL 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Buyer only buys 2
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const buyerBalance = (engine as any).balances.get("1");
    const sellerBalance = (engine as any).balances.get("2");

    expect(sellerBalance.BTC.available).toBe(5);
    expect(sellerBalance.BTC.locked).toBe(3);
    expect(sellerBalance.USDC.available).toBe(2000);

    expect(buyerBalance.USDC.available).toBe(8000);
    expect(buyerBalance.USDC.locked).toBe(0);
    expect(buyerBalance.BTC.available).toBe(2);
  });

  it("Refunds locked USDC when buy order is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterOrderBalance = (engine as any).balances.get("1");

    expect(afterOrderBalance.USDC.available).toBe(5000);
    expect(afterOrderBalance.USDC.locked).toBe(5000);

    // Need the generated orderId
    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    const orderId = orderbook.bids[0].orderId;

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "BTC_USDC",
          orderId,
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterCancelBalance = (engine as any).balances.get("1");

    expect(afterCancelBalance.USDC.available).toBe(10000);
    expect(afterCancelBalance.USDC.locked).toBe(0);

    expect(orderbook.bids.length).toBe(0);
  });

  it("Refunds only remaining locked USDC after partially filled buy is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Buyer places BUY 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // Seller fills only 2
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    const remainingBuyOrder = orderbook.bids.find(
      (order: any) => order.userId === "1",
    );

    expect(remainingBuyOrder.filled).toBe(2);

    const beforeCancel = (engine as any).balances.get("1");

    expect(beforeCancel.USDC.available).toBe(5000);
    expect(beforeCancel.USDC.locked).toBe(3000);
    expect(beforeCancel.BTC.available).toBe(2);

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "BTC_USDC",
          orderId: remainingBuyOrder.orderId,
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterCancel = (engine as any).balances.get("1");

    expect(afterCancel.USDC.available).toBe(8000);
    expect(afterCancel.USDC.locked).toBe(0);
    expect(afterCancel.BTC.available).toBe(2);

    expect(orderbook.bids.length).toBe(0);
  });

  it("Refunds only remaining locked BTC after partially filled sell is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller places SELL 5
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Buyer fills only 2
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    const remainingSellOrder = orderbook.asks.find(
      (order: any) => order.userId === "2",
    );

    expect(remainingSellOrder.filled).toBe(2);

    const beforeCancel = (engine as any).balances.get("2");

    expect(beforeCancel.BTC.available).toBe(5);
    expect(beforeCancel.BTC.locked).toBe(3);
    expect(beforeCancel.USDC.available).toBe(2000);

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "BTC_USDC",
          orderId: remainingSellOrder.orderId,
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const afterCancel = (engine as any).balances.get("2");

    expect(afterCancel.BTC.available).toBe(8);
    expect(afterCancel.BTC.locked).toBe(0);
    expect(afterCancel.USDC.available).toBe(2000);

    expect(orderbook.asks.length).toBe(0);
  });

  it("Prevents self trade at Engine level", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // User 1 places SELL first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // Same user places matching BUY
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(0);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.bids.length).toBe(1);
  });

  it("Rejects sell order when user has insufficient BTC balance", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 1, locked: 0 },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    expect(sendToApiMock).toHaveBeenCalledWith("client-2", {
      type: "ORDER_CANCELLED",
      payload: {
        orderId: "",
        executedQuantity: 0,
        remainingQty: 0,
        error: "Insufficient funds",
      },
    });

    expect(pushMessageMock).not.toHaveBeenCalled();

    const userBalance = (engine as any).balances.get("2");

    expect(userBalance.BTC.available).toBe(1);
    expect(userBalance.BTC.locked).toBe(0);
  });

  it("Matches multiple maker orders in correct price order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("3", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller A
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "900",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Seller B
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "950",
          quantity: "2",
          side: "sell",
          userId: "3",
        },
      },
      clientId: "client-3",
    });

    // Buyer takes both
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "3",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(2);

    expect(tradeMessages[0].data.price).toBe("900");
    expect(tradeMessages[0].data.quantity).toBe("1");

    expect(tradeMessages[1].data.price).toBe("950");
    expect(tradeMessages[1].data.quantity).toBe("2");
  });

  it("Matches same-price maker orders in FIFO order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("3", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller A arrives first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Seller B arrives second
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "3",
        },
      },
      clientId: "client-3",
    });

    // Buyer takes 3
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "3",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(2);

    // First seller should be filled first
    expect(tradeMessages[0].data.sellerUserId).toBe("2");
    expect(tradeMessages[0].data.quantity).toBe("2");

    // Second seller gets remaining 1
    expect(tradeMessages[1].data.sellerUserId).toBe("3");
    expect(tradeMessages[1].data.quantity).toBe("1");
  });

  it("Does not create a trade when orders do not cross", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // BUY rests
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // SELL is too expensive to match
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1001",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(0);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.asks.length).toBe(1);

    expect(orderbook.bids[0].price).toBe(1000);
    expect(orderbook.asks[0].price).toBe(1001);
  });

  it("Executes at maker price when incoming buy crosses a better ask", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Seller is maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "900",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Buyer is taker, limit is 1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessage = messages.find(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessage).toBeDefined();

    expect(tradeMessage.data.price).toBe("900");
    expect(tradeMessage.data.quantity).toBe("2");
    expect(tradeMessage.data.quoteQuantity).toBe("1800");

    expect(tradeMessage.data.buyerUserId).toBe("1");
    expect(tradeMessage.data.sellerUserId).toBe("2");

    expect(tradeMessage.data.isBuyerMaker).toBe(false);
  });

  it("Executes at maker price when incoming sell crosses a better bid", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // Buyer is maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1100",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // Seller is taker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessage = messages.find(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessage).toBeDefined();

    expect(tradeMessage.data.price).toBe("1100");
    expect(tradeMessage.data.quantity).toBe("2");
    expect(tradeMessage.data.quoteQuantity).toBe("2200");

    expect(tradeMessage.data.buyerUserId).toBe("1");
    expect(tradeMessage.data.sellerUserId).toBe("2");

    expect(tradeMessage.data.isBuyerMaker).toBe(true);
  });

  it("Does not overfill a partially filled maker order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 2 },
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    orderbook.asks.push({
      price: 1000,
      quantity: 5,
      filled: 3,
      orderId: "maker-sell",
      side: "sell",
      userId: "2",
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "4",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(1);

    expect(tradeMessages[0].data.quantity).toBe("2");

    // Maker was 3/5 filled before.
    // Only remaining 2 should execute.
    expect(orderbook.asks.length).toBe(0);

    // Incoming BUY wanted 4 but only got 2,
    // so remaining BUY 2 should rest.
    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].filled).toBe(2);

    expect(orderbook.bids[0].quantity - orderbook.bids[0].filled).toBe(2);
  });

  it("Consumes multiple makers correctly when one maker is already partially filled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 0, locked: 2 },
    });

    (engine as any).balances.set("3", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 0, locked: 4 },
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    // Maker A: 5 total, already filled 3 → remaining 2
    orderbook.asks.push({
      price: 900,
      quantity: 5,
      filled: 3,
      orderId: "maker-a",
      side: "sell",
      userId: "2",
    });

    // Maker B: 4 available
    orderbook.asks.push({
      price: 950,
      quantity: 4,
      filled: 0,
      orderId: "maker-b",
      side: "sell",
      userId: "3",
    });

    // Incoming buyer wants 5
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "5",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const messages = pushMessageMock.mock.calls.map((call) => call[0]);

    const tradeMessages = messages.filter(
      (message) => message.type === "TRADE_ADDED",
    );

    expect(tradeMessages.length).toBe(2);

    // Cheapest maker first
    expect(tradeMessages[0].data.price).toBe("900");
    expect(tradeMessages[0].data.quantity).toBe("2");
    expect(tradeMessages[0].data.sellerUserId).toBe("2");

    // Remaining 3 comes from second maker
    expect(tradeMessages[1].data.price).toBe("950");
    expect(tradeMessages[1].data.quantity).toBe("3");
    expect(tradeMessages[1].data.sellerUserId).toBe("3");

    // Maker A fully filled → removed
    const makerA = orderbook.asks.find(
      (order: any) => order.orderId === "maker-a",
    );

    expect(makerA).toBeUndefined();

    // Maker B still has 1 remaining
    const makerB = orderbook.asks.find(
      (order: any) => order.orderId === "maker-b",
    );

    expect(makerB.filled).toBe(3);
    expect(makerB.quantity - makerB.filled).toBe(1);

    // Incoming BUY completely filled → should not rest in bids
    expect(orderbook.bids.length).toBe(0);
  });

  it("Does not allow user to cancel another user's order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    // User 1 creates BUY
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    const orderId = orderbook.bids[0].orderId;

    // User 2 tries to cancel User 1's order
    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "BTC_USDC",
          orderId,
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Order must still exist
    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].orderId).toBe(orderId);

    // User 1's locked money must remain locked
    const user1Balance = (engine as any).balances.get("1");

    expect(user1Balance.USDC.available).toBe(8000);
    expect(user1Balance.USDC.locked).toBe(2000);
  });

  it("Does not cancel a non-existent order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "BTC_USDC",
          orderId: "does-not-exist",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.USDC.available).toBe(10000);
    expect(userBalance.USDC.locked).toBe(0);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    expect(orderbook.bids.length).toBe(0);
    expect(orderbook.asks.length).toBe(0);
  });

  it("Returns user balance", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 2000 },
      BTC: { available: 5, locked: 1 },
    });

    await engine.process({
      message: {
        type: GET_BALANCE,
        data: {
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    expect(sendToApiMock).toHaveBeenCalledWith("client-1", {
      type: "BALANCE",
      payload: {
        USDC: { available: 10000, locked: 2000 },
        BTC: { available: 5, locked: 1 },
      },
    });
  });

  it("Returns only the user's open orders", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // User 1 BUY
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "900",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // User 2 SELL - deliberately non-crossing
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1100",
          quantity: "3",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Only clears call history — the pgClient/persist stubs stay in place.
    vi.clearAllMocks();

    await engine.process({
      message: {
        type: GET_OPEN_ORDERS,
        data: {
          market: "BTC_USDC",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    expect(sendToApiMock).toHaveBeenCalledTimes(1);

    const response = sendToApiMock.mock.calls[0][1];

    expect(response.type).toBe("OPEN_ORDERS");
    expect(response.payload.length).toBe(1);

    expect(response.payload[0]).toMatchObject({
      userId: "1",
      price: 900,
      quantity: 2,
      side: "buy",
      filled: 0,
    });
  });

  it("Returns correct market depth", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // BUY rests
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "900",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // SELL rests, does not cross
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1100",
          quantity: "3",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    vi.clearAllMocks();

    await engine.process({
      message: {
        type: GET_DEPTH,
        data: {
          market: "BTC_USDC",
        },
      },
      clientId: "client-1",
    });

    expect(sendToApiMock).toHaveBeenCalledTimes(1);

    expect(sendToApiMock).toHaveBeenCalledWith("client-1", {
      type: "DEPTH",
      payload: {
        bids: [["900", "2"]],
        asks: [["1100", "3"]],
      },
    });
  });

  it("Creates default balances for a new user on ramp", async () => {
    const engine = createTestEngine();

    await engine.process({
      message: {
        type: ON_RAMP,
        data: {
          userId: "99",
          asset: "USDC",
          amount: "5000",
          txnId: "txn-test-1",
        },
      },
      clientId: "client-99",
    });

    const userBalance = (engine as any).balances.get("99");

    expect(userBalance).toBeDefined();

    // On-ramped USDC
    expect(userBalance.USDC.available).toBe(5000);
    expect(userBalance.USDC.locked).toBe(0);
  });

  it("Adds USDC to an existing user on ramp", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 1000, locked: 0 },
      BTC: { available: 10, locked: 2 },
      ETH: { available: 1, locked: 0 },
    });

    await engine.process({
      message: {
        type: ON_RAMP,
        data: {
          userId: "1",
          asset: "USDC",
          amount: "500",
          txnId: "txn-1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    // USDC increased by the on-ramp amount
    expect(userBalance.USDC.available).toBe(1500);
    expect(userBalance.USDC.locked).toBe(0);

    // Other balances untouched
    expect(userBalance.BTC.available).toBe(10);
    expect(userBalance.BTC.locked).toBe(2);
    expect(userBalance.ETH.available).toBe(1);
  });

  it("Returns empty depth for invalid market", async () => {
    const engine = createTestEngine();

    await engine.process({
      message: {
        type: GET_DEPTH,
        data: {
          market: "INVALID_MARKET",
        },
      },
      clientId: "client-1",
    });

    expect(sendToApiMock).toHaveBeenCalledWith("client-1", {
      type: "DEPTH",
      payload: {
        bids: [],
        asks: [],
      },
    });
  });

  it("Publishes FILLED order_update for taker", async () => {
    const engine = createTestEngine();

    // Buyer
    (engine as any).balances.set("1", {
      USDC: { available: 10000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    // Seller
    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 10, locked: 0 },
    });

    // ----------------------------------
    // 1. Seller places order first
    //    Seller = MAKER
    // ----------------------------------
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Ignore messages generated by maker order
    publishMessageMock.mockClear();

    // ----------------------------------
    // 2. Buyer comes second
    //    Buyer = TAKER
    //    Full match
    // ----------------------------------
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "1000",
          quantity: "1",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    // ----------------------------------
    // 3. Taker should receive FILLED
    // ----------------------------------
    expect(publishMessageMock).toHaveBeenCalledWith(
      "user_trades@1",
      expect.objectContaining({
        data: expect.objectContaining({
          e: "order_update",
          filled: 1,
          status: "FILLED",
        }),
      }),
    );
  });
  it("Market BUY uses actual ask prices and updates balances", async () => {
    const engine = createTestEngine();

    // Buyer
    (engine as any).balances.set("1", {
      USDC: { available: 100000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    // Seller 1
    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 1, locked: 0 },
    });

    // Seller 2
    (engine as any).balances.set("3", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 1, locked: 0 },
    });

    // LIMIT SELL: 0.2 BTC @ 60000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "60000",
          quantity: "0.2",
          side: "sell",
          orderType: "limit",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // LIMIT SELL: 0.3 BTC @ 60100
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "60100",
          quantity: "0.3",
          side: "sell",
          orderType: "limit",
          userId: "3",
        },
      },
      clientId: "client-3",
    });

    // MARKET BUY 0.4 BTC
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          quantity: "0.4",
          side: "buy",
          orderType: "market",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const buyer = (engine as any).balances.get("1");
    const seller1 = (engine as any).balances.get("2");
    const seller2 = (engine as any).balances.get("3");

    /*
    Buyer consumes:

    0.2 × 60000 = 12000
    0.2 × 60100 = 12020

    Total spent = 24020
  */

    expect(buyer.USDC.available).toBeCloseTo(75980);
    expect(buyer.USDC.locked).toBeCloseTo(0);
    expect(buyer.BTC.available).toBeCloseTo(0.4);

    expect(seller1.USDC.available).toBeCloseTo(12000);
    expect(seller1.BTC.available).toBeCloseTo(0.8);
    expect(seller1.BTC.locked).toBeCloseTo(0);

    expect(seller2.USDC.available).toBeCloseTo(12020);
    expect(seller2.BTC.available).toBeCloseTo(0.7);
    expect(seller2.BTC.locked).toBeCloseTo(0.1);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    // Market BUY itself must never rest in bids.
    expect(orderbook.bids.some((order: any) => order.userId === "1")).toBe(
      false,
    );

    // First ask fully consumed.
    // Second ask has 0.1 remaining.
    expect(orderbook.asks.length).toBe(1);

    expect(orderbook.asks[0].userId).toBe("3");

    expect(orderbook.asks[0].quantity - orderbook.asks[0].filled).toBeCloseTo(
      0.1,
    );
  });

  it("Partial Market BUY cancels unfilled remainder", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 100000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 0.2, locked: 0 },
    });

    // Only 0.2 BTC exists for sale.
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "60000",
          quantity: "0.2",
          side: "sell",
          orderType: "limit",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    // Ignore maker's WS messages.
    publishMessageMock.mockClear();

    // Buyer wants 1 BTC, but only 0.2 exists.
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          quantity: "1",
          side: "buy",
          orderType: "market",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const buyer = (engine as any).balances.get("1");

    /*
    Executed:

    0.2 × 60000 = 12000
  */

    expect(buyer.BTC.available).toBeCloseTo(0.2);

    expect(buyer.USDC.available).toBeCloseTo(88000);

    expect(buyer.USDC.locked).toBeCloseTo(0);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    // Remaining 0.8 BTC must NOT become an open bid.
    expect(orderbook.bids.some((order: any) => order.userId === "1")).toBe(
      false,
    );

    // Partial market order is terminal in our 4-status model.
    expect(publishMessageMock).toHaveBeenCalledWith(
      "user_trades@1",
      expect.objectContaining({
        data: expect.objectContaining({
          e: "order_update",
          filled: 0.2,
          status: "CANCELLED",
        }),
      }),
    );
  });

  it("Partial Market SELL refunds unfilled BTC", async () => {
    const engine = createTestEngine();

    // Buyer
    (engine as any).balances.set("1", {
      USDC: { available: 100000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    // Seller
    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 1, locked: 0 },
    });

    // Buyer places LIMIT BUY 0.2 @ 60000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "60000",
          quantity: "0.2",
          side: "buy",
          orderType: "limit",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    publishMessageMock.mockClear();

    // Seller wants to MARKET SELL 1 BTC.
    // Only 0.2 BTC can execute.
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          quantity: "1",
          side: "sell",
          orderType: "market",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const buyer = (engine as any).balances.get("1");
    const seller = (engine as any).balances.get("2");

    /*
    Executed:

    0.2 × 60000 = 12000
  */

    expect(buyer.USDC.available).toBeCloseTo(88000);

    expect(buyer.USDC.locked).toBeCloseTo(0);

    expect(buyer.BTC.available).toBeCloseTo(0.2);

    // Seller requested 1 BTC.
    // Only 0.2 sold.
    // Remaining 0.8 returned to available.
    expect(seller.BTC.available).toBeCloseTo(0.8);
    expect(seller.BTC.locked).toBeCloseTo(0);

    expect(seller.USDC.available).toBeCloseTo(12000);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "BTC_USDC",
    );

    // Market SELL remainder must not rest as an ask.
    expect(orderbook.asks.some((order: any) => order.userId === "2")).toBe(
      false,
    );

    expect(publishMessageMock).toHaveBeenCalledWith(
      "user_trades@2",
      expect.objectContaining({
        data: expect.objectContaining({
          e: "order_update",
          filled: 0.2,
          status: "CANCELLED",
        }),
      }),
    );
  });

  it("Fully filled Market BUY publishes FILLED", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      USDC: { available: 100000, locked: 0 },
      BTC: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      USDC: { available: 0, locked: 0 },
      BTC: { available: 1, locked: 0 },
    });

    // Maker provides exactly 0.5 BTC.
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          price: "60000",
          quantity: "0.5",
          side: "sell",
          orderType: "limit",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    publishMessageMock.mockClear();

    // Taker buys exactly available liquidity.
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "BTC_USDC",
          quantity: "0.5",
          side: "buy",
          orderType: "market",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const buyer = (engine as any).balances.get("1");

    /*
    0.5 × 60000 = 30000
  */

    expect(buyer.USDC.available).toBeCloseTo(70000);

    expect(buyer.USDC.locked).toBeCloseTo(0);

    expect(buyer.BTC.available).toBeCloseTo(0.5);

    expect(publishMessageMock).toHaveBeenCalledWith(
      "user_trades@1",
      expect.objectContaining({
        data: expect.objectContaining({
          e: "order_update",
          filled: 0.5,
          status: "FILLED",
        }),
      }),
    );
  });
});
