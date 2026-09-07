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
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    const publishSpy = vi.spyOn(engine, "publishWsTrades");

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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

  it("Locks INR when buy order is placed", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.INR.available).toBe(8000);
    expect(userBalance.INR.locked).toBe(2000);
  });

  it("Locks TATA when sell order is placed", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
          price: "1000",
          quantity: "3",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("2");

    expect(userBalance.TATA.available).toBe(7);
    expect(userBalance.TATA.locked).toBe(3);
  });

  it("Updates buyer and seller balances after a complete trade", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Buyer places order first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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

    expect(buyerBalance.INR.available).toBe(8000);
    expect(buyerBalance.INR.locked).toBe(0);
    expect(buyerBalance.TATA.available).toBe(2);

    expect(sellerBalance.TATA.available).toBe(8);
    expect(sellerBalance.TATA.locked).toBe(0);
    expect(sellerBalance.INR.available).toBe(2000);
  });

  it("Refunds buyer when trade executes below buy limit price", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Seller becomes maker at 900
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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

    expect(buyerBalance.INR.available).toBe(8200);
    expect(buyerBalance.INR.locked).toBe(0);
    expect(buyerBalance.TATA.available).toBe(2);

    expect(sellerBalance.INR.available).toBe(1800);
    expect(sellerBalance.TATA.available).toBe(8);
    expect(sellerBalance.TATA.locked).toBe(0);
  });

  it("Sends trade and order updates to DB worker after a trade", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
        market: "TATA_INR",
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
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Seller rests first → seller becomes maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
        market: "TATA_INR",
        price: "1000",
        quantity: "1",
        quoteQuantity: "1000",

        buyerUserId: "1",
        sellerUserId: "2",

        isBuyerMaker: false,
      },
    });
  });

  it("Keeps remaining INR locked after a partial buy fill", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Buyer places BUY 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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

    expect(buyerBalance.INR.available).toBe(5000);
    expect(buyerBalance.INR.locked).toBe(3000);
    expect(buyerBalance.TATA.available).toBe(2);

    expect(sellerBalance.TATA.available).toBe(8);
    expect(sellerBalance.TATA.locked).toBe(0);
    expect(sellerBalance.INR.available).toBe(2000);
  });

  it("Keeps remaining TATA locked after a partial sell fill", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Seller places SELL 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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

    expect(sellerBalance.TATA.available).toBe(5);
    expect(sellerBalance.TATA.locked).toBe(3);
    expect(sellerBalance.INR.available).toBe(2000);

    expect(buyerBalance.INR.available).toBe(8000);
    expect(buyerBalance.INR.locked).toBe(0);
    expect(buyerBalance.TATA.available).toBe(2);
  });

  it("Refunds locked INR when buy order is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
          price: "1000",
          quantity: "5",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterOrderBalance = (engine as any).balances.get("1");

    expect(afterOrderBalance.INR.available).toBe(5000);
    expect(afterOrderBalance.INR.locked).toBe(5000);

    // Need the generated orderId
    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    const orderId = orderbook.bids[0].orderId;

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId,
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterCancelBalance = (engine as any).balances.get("1");

    expect(afterCancelBalance.INR.available).toBe(10000);
    expect(afterCancelBalance.INR.locked).toBe(0);

    expect(orderbook.bids.length).toBe(0);
  });

  it("Refunds only remaining locked INR after partially filled buy is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Buyer places BUY 5 @1000
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
          price: "1000",
          quantity: "2",
          side: "sell",
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    const remainingBuyOrder = orderbook.bids.find(
      (order: any) => order.userId === "1",
    );

    expect(remainingBuyOrder.filled).toBe(2);

    const beforeCancel = (engine as any).balances.get("1");

    expect(beforeCancel.INR.available).toBe(5000);
    expect(beforeCancel.INR.locked).toBe(3000);
    expect(beforeCancel.TATA.available).toBe(2);

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId: remainingBuyOrder.orderId,
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const afterCancel = (engine as any).balances.get("1");

    expect(afterCancel.INR.available).toBe(8000);
    expect(afterCancel.INR.locked).toBe(0);
    expect(afterCancel.TATA.available).toBe(2);

    expect(orderbook.bids.length).toBe(0);
  });

  it("Refunds only remaining locked TATA after partially filled sell is cancelled", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // Seller places SELL 5
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    const remainingSellOrder = orderbook.asks.find(
      (order: any) => order.userId === "2",
    );

    expect(remainingSellOrder.filled).toBe(2);

    const beforeCancel = (engine as any).balances.get("2");

    expect(beforeCancel.TATA.available).toBe(5);
    expect(beforeCancel.TATA.locked).toBe(3);
    expect(beforeCancel.INR.available).toBe(2000);

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId: remainingSellOrder.orderId,
          userId: "2",
        },
      },
      clientId: "client-2",
    });

    const afterCancel = (engine as any).balances.get("2");

    expect(afterCancel.TATA.available).toBe(8);
    expect(afterCancel.TATA.locked).toBe(0);
    expect(afterCancel.INR.available).toBe(2000);

    expect(orderbook.asks.length).toBe(0);
  });

  it("Prevents self trade at Engine level", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // User 1 places SELL first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.bids.length).toBe(1);
  });

  it("Rejects sell order when user has insufficient TATA balance", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 1,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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

    expect(userBalance.TATA.available).toBe(1);
    expect(userBalance.TATA.locked).toBe(0);
  });

  it("Matches multiple maker orders in correct price order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("3", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Seller A
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("3", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Seller A arrives first
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // BUY rests
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.asks.length).toBe(1);

    expect(orderbook.bids[0].price).toBe(1000);
    expect(orderbook.asks[0].price).toBe(1001);
  });

  it("Executes at maker price when incoming buy crosses a better ask", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Seller is maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Buyer is maker
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 2 },
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 0, locked: 2 },
    });

    (engine as any).balances.set("3", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 0, locked: 4 },
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    // User 1 creates BUY
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
          price: "1000",
          quantity: "2",
          side: "buy",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    const orderId = orderbook.bids[0].orderId;

    // User 2 tries to cancel User 1's order
    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
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

    expect(user1Balance.INR.available).toBe(8000);
    expect(user1Balance.INR.locked).toBe(2000);
  });

  it("Does not cancel a non-existent order", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    await engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId: "does-not-exist",
          userId: "1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.INR.available).toBe(10000);
    expect(userBalance.INR.locked).toBe(0);

    const orderbook = (engine as any).orderbooks.find(
      (orderbook: any) => orderbook.ticker() === "TATA_INR",
    );

    expect(orderbook.bids.length).toBe(0);
    expect(orderbook.asks.length).toBe(0);
  });

  it("Returns user balance", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 10000,
        locked: 2000,
      },
      TATA: {
        available: 5,
        locked: 1,
      },
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
        INR: {
          available: 10000,
          locked: 2000,
        },
        TATA: {
          available: 5,
          locked: 1,
        },
      },
    });
  });

  it("Returns only the user's open orders", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // User 1 BUY
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
          market: "TATA_INR",
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
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // BUY rests
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
          market: "TATA_INR",
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
          amount: "5000",
          txnId: "txn-test-1",
        },
      },
      clientId: "client-99",
    });

    const userBalance = (engine as any).balances.get("99");

    expect(userBalance.INR.available).toBe(5000);
    expect(userBalance.INR.locked).toBe(0);

    expect(userBalance.USDC.available).toBe(10000);
    expect(userBalance.TATA.available).toBe(100);
    expect(userBalance.BTC.available).toBe(1);
    expect(userBalance.ETH.available).toBe(10);
  });

  it("Adds INR to an existing user on ramp", async () => {
    const engine = createTestEngine();

    (engine as any).balances.set("1", {
      INR: {
        available: 1000,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 2,
      },
      BTC: {
        available: 1,
        locked: 0,
      },
    });

    await engine.process({
      message: {
        type: ON_RAMP,
        data: {
          userId: "1",
          amount: "500",
          txnId: "txn-1",
        },
      },
      clientId: "client-1",
    });

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.INR.available).toBe(1500);
    expect(userBalance.INR.locked).toBe(0);

    expect(userBalance.TATA.available).toBe(10);
    expect(userBalance.TATA.locked).toBe(2);

    expect(userBalance.BTC.available).toBe(1);
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
      INR: {
        available: 10000,
        locked: 0,
      },
      TATA: {
        available: 0,
        locked: 0,
      },
    });

    // Seller
    (engine as any).balances.set("2", {
      INR: {
        available: 0,
        locked: 0,
      },
      TATA: {
        available: 10,
        locked: 0,
      },
    });

    // ----------------------------------
    // 1. Seller places order first
    //    Seller = MAKER
    // ----------------------------------
    await engine.process({
      message: {
        type: CREATE_ORDER,
        data: {
          market: "TATA_INR",
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
          market: "TATA_INR",
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
});
