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

describe("Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Publishes Trade updates", () => {
    const engine = new Engine();

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

    engine.process({
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

    engine.process({
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

  it("Rejects buy order when user has insufficient balance", () => {
    const engine = new Engine();

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

    engine.process({
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

  it("Locks INR when buy order is placed", () => {
    const engine = new Engine();

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

    engine.process({
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
  it("Locks TATA when sell order is placed", () => {
    const engine = new Engine();

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

    engine.process({
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
  it("Updates buyer and seller balances after a complete trade", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Refunds buyer when trade executes below buy limit price", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Sends trade and order updates to DB worker after a trade", () => {
    const engine = new Engine();

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

    engine.process({
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

    engine.process({
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
  it("Sends correct TRADE_ADDED payload", () => {
    const engine = new Engine();

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

    engine.process({
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

    engine.process({
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
  it("Sets isBuyerMaker false when seller is maker", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Keeps remaining INR locked after a partial buy fill", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Keeps remaining TATA locked after a partial sell fill", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Refunds locked INR when buy order is cancelled", () => {
    const engine = new Engine();

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

    engine.process({
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

    engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId,
          userId: "1", // add
        },
      },
      clientId: "client-1",
    });

    const afterCancelBalance = (engine as any).balances.get("1");

    expect(afterCancelBalance.INR.available).toBe(10000);
    expect(afterCancelBalance.INR.locked).toBe(0);

    expect(orderbook.bids.length).toBe(0);
  });
  it("Refunds only remaining locked INR after partially filled buy is cancelled", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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

    engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId: remainingBuyOrder.orderId,
          userId: "1", // add
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
  it("Refunds only remaining locked TATA after partially filled sell is cancelled", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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

    engine.process({
      message: {
        type: CANCEL_ORDER,
        data: {
          market: "TATA_INR",
          orderId: remainingSellOrder.orderId,
          userId: "2", // add
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
  it("Prevents self trade at Engine level", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
  it("Rejects sell order when user has insufficient TATA balance", () => {
    const engine = new Engine();

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

    engine.process({
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
  it("Matches multiple maker orders in correct price order", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
    engine.process({
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
  it("Matches same-price maker orders in FIFO order", () => {
    const engine = new Engine();

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
    engine.process({
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
    engine.process({
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
    engine.process({
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
  it("Does not create a trade when orders do not cross", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // BUY rests
    engine.process({
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
    engine.process({
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
  it("Executes at maker price when incoming buy crosses a better ask", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Seller is maker
    engine.process({
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
    engine.process({
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
  it("Executes at maker price when incoming sell crosses a better bid", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 0, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // Buyer is maker
    engine.process({
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
    engine.process({
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
  it("Does not overfill a partially filled maker order", () => {
    const engine = new Engine();

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

    engine.process({
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
  it("Consumes multiple makers correctly when one maker is already partially filled", () => {
    const engine = new Engine();

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
    engine.process({
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
  it("Does not allow user to cancel another user's order", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    // User 1 creates BUY
    engine.process({
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
    engine.process({
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
  it("Does not cancel a non-existent order", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 0, locked: 0 },
    });

    engine.process({
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
  it("Returns user balance", () => {
    const engine = new Engine();

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

    engine.process({
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
  it("Returns only the user's open orders", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // User 1 BUY
    engine.process({
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
    engine.process({
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

    engine.process({
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
  it("Returns correct market depth", () => {
    const engine = new Engine();

    (engine as any).balances.set("1", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    (engine as any).balances.set("2", {
      INR: { available: 10000, locked: 0 },
      TATA: { available: 10, locked: 0 },
    });

    // BUY rests
    engine.process({
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
    engine.process({
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

    engine.process({
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
    const engine = new Engine();

    // Avoid real PostgreSQL calls in this unit test
    vi.spyOn(engine, "persistAllBalances").mockResolvedValue();

    engine.process({
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

    // onRamp is async and process() fire-and-forgets it,
    // so wait one tick
    await new Promise((resolve) => setTimeout(resolve, 0));

    const userBalance = (engine as any).balances.get("99");

    expect(userBalance.INR.available).toBe(5000);
    expect(userBalance.INR.locked).toBe(0);

    expect(userBalance.USDC.available).toBe(10000);
    expect(userBalance.TATA.available).toBe(100);
    expect(userBalance.BTC.available).toBe(1);
    expect(userBalance.ETH.available).toBe(10);
  });
  it("Adds INR to an existing user on ramp", async () => {
    const engine = new Engine();

    vi.spyOn(engine, "persistAllBalances").mockResolvedValue();

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

    engine.process({
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

    await new Promise((resolve) => setTimeout(resolve, 0));

    const userBalance = (engine as any).balances.get("1");

    expect(userBalance.INR.available).toBe(1500);
    expect(userBalance.INR.locked).toBe(0);

    expect(userBalance.TATA.available).toBe(10);
    expect(userBalance.TATA.locked).toBe(2);

    expect(userBalance.BTC.available).toBe(1);
  });
  it("Returns empty depth for invalid market", () => {
    const engine = new Engine();

    engine.process({
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
});
