import { describe, expect, it } from "vitest";
import { Orderbook } from "../trade/Orderbook";

describe("Simple orders", () => {
  it("Empty orderbook should not be filled", () => {
    const orderbook = new Orderbook("TATA", "INR", [], [], 0);

    const order = {
      price: 1000,
      quantity: 1,
      orderId: "1",
      filled: 0,
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(0);
    expect(executedQuantity).toBe(0);

    // Since it did not match anything,
    // the BUY order should stay in the orderbook.
    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.asks.length).toBe(0);
  });

  it("Can partially fill an incoming sell order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [
        {
          price: 1000,
          quantity: 1,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 1000,
      quantity: 2,
      orderId: "2",
      filled: 0,
      side: "sell" as const,
      userId: "2",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(1);
    expect(executedQuantity).toBe(1);

    expect(fills[0].quantity).toBe(1);
    expect(fills[0].makerOrderId).toBe("1");
    expect(fills[0].makerUserId).toBe("1");

    // Maker BUY was completely filled, so it should be removed.
    expect(orderbook.bids.length).toBe(0);

    // Incoming SELL wanted 2, only 1 executed,
    // so remaining 1 should rest in asks.
    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].quantity).toBe(2);
    expect(orderbook.asks[0].filled).toBe(1);

    expect(orderbook.asks[0].quantity - orderbook.asks[0].filled).toBe(1);
  });

  it("Can partially fill an incoming buy order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [
        {
          price: 999,
          quantity: 1,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [
        {
          price: 1001,
          quantity: 1,
          orderId: "2",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 1001,
      quantity: 2,
      orderId: "3",
      filled: 0,
      side: "buy" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(1);
    expect(executedQuantity).toBe(1);

    expect(fills[0].quantity).toBe(1);
    expect(fills[0].price).toBe("1001");
    expect(fills[0].makerOrderId).toBe("2");
    expect(fills[0].makerUserId).toBe("2");

    // Existing ASK was completely consumed.
    expect(orderbook.asks.length).toBe(0);

    // Existing BUY @999 + remaining incoming BUY @1001
    expect(orderbook.bids.length).toBe(2);
  });
});

describe("Maker remaining quantity", () => {
  it("Does not overfill an already partially filled maker order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [],
      [
        {
          price: 30,
          quantity: 5,
          filled: 2,
          orderId: "maker-1",
          side: "sell" as const,
          userId: "1",
        },
      ],
      0,
    );

    const order = {
      price: 30,
      quantity: 4,
      orderId: "taker-1",
      filled: 0,
      side: "buy" as const,
      userId: "2",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    // Maker had:
    // quantity = 5
    // filled = 2
    // remaining = 3
    //
    // So incoming BUY 4 can only execute 3.
    expect(executedQuantity).toBe(3);

    expect(fills.length).toBe(1);
    expect(fills[0].quantity).toBe(3);

    expect(fills[0].makerOrderId).toBe("maker-1");
    expect(fills[0].makerUserId).toBe("1");

    // Maker is now completely filled.
    expect(fills[0].makerFilledQuantity).toBe(5);
    expect(fills[0].makerOrderQuantity).toBe(5);

    // Fully filled maker removed.
    expect(orderbook.asks.length).toBe(0);

    // Incoming BUY had quantity 4 and only 3 executed.
    // Remaining BUY 1 should rest in bids.
    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].quantity).toBe(4);
    expect(orderbook.bids[0].filled).toBe(3);

    expect(orderbook.bids[0].quantity - orderbook.bids[0].filled).toBe(1);
  });
});

describe("Price priority", () => {
  it("Matches the lowest ask first for an incoming buy order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [],
      [
        {
          price: 30,
          quantity: 2,
          orderId: "ask-30",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 28,
          quantity: 2,
          orderId: "ask-28",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 30,
      quantity: 2,
      orderId: "buy-1",
      filled: 0,
      side: "buy" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(2);
    expect(fills.length).toBe(1);

    // BUY @30 can match both 28 and 30,
    // but best price for buyer is 28.
    expect(fills[0].price).toBe("28");
    expect(fills[0].makerOrderId).toBe("ask-28");

    // ASK @28 completely filled and removed.
    expect(orderbook.asks.length).toBe(1);

    // ASK @30 should still remain.
    expect(orderbook.asks[0].orderId).toBe("ask-30");
  });

  it("Matches the highest bid first for an incoming sell order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [
        {
          price: 28,
          quantity: 2,
          orderId: "bid-28",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
        {
          price: 30,
          quantity: 2,
          orderId: "bid-30",
          filled: 0,
          side: "buy" as const,
          userId: "2",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 28,
      quantity: 2,
      orderId: "sell-1",
      filled: 0,
      side: "sell" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(2);
    expect(fills.length).toBe(1);

    // SELL @28 can match bids 28 and 30.
    // Seller should get the better price: 30.
    expect(fills[0].price).toBe("30");
    expect(fills[0].makerOrderId).toBe("bid-30");

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].orderId).toBe("bid-28");
  });
});

describe("Time priority", () => {
  it("Matches the older order first when prices are equal", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [],
      [
        {
          price: 30,
          quantity: 2,
          orderId: "first",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 30,
          quantity: 5,
          orderId: "second",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 30,
      quantity: 3,
      orderId: "buyer",
      filled: 0,
      side: "buy" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(3);
    expect(fills.length).toBe(2);

    // First order at price 30 arrived first,
    // so it should execute first.
    expect(fills[0].makerOrderId).toBe("first");
    expect(fills[0].quantity).toBe(2);

    // Remaining 1 comes from second maker.
    expect(fills[1].makerOrderId).toBe("second");
    expect(fills[1].quantity).toBe(1);

    // First maker completely removed.
    // Second maker remains with 4.
    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].orderId).toBe("second");
    expect(orderbook.asks[0].filled).toBe(1);

    expect(orderbook.asks[0].quantity - orderbook.asks[0].filled).toBe(4);
  });
});

describe("Self trade prevention", () => {
  it("User cannot trade against their own resting order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [
        {
          price: 999,
          quantity: 1,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 999,
      quantity: 2,
      orderId: "2",
      filled: 0,
      side: "sell" as const,

      // Same user as resting BUY.
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(0);
    expect(executedQuantity).toBe(0);

    // Original BUY should remain.
    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].orderId).toBe("1");

    // Incoming SELL also remains because it didn't execute.
    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].orderId).toBe("2");
  });

  it("Skips own order but can match another user's order", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [],
      [
        {
          price: 29,
          quantity: 2,
          orderId: "own-order",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 30,
          quantity: 3,
          orderId: "other-order",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 30,
      quantity: 4,
      orderId: "incoming-buy",
      filled: 0,
      side: "buy" as const,

      // Same user as SELL @29.
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    // Own SELL @29 should be skipped.
    // Other user's SELL @30 has quantity 3.
    expect(executedQuantity).toBe(3);

    expect(fills.length).toBe(1);

    expect(fills[0].makerOrderId).toBe("other-order");
    expect(fills[0].makerUserId).toBe("2");
    expect(fills[0].quantity).toBe(3);

    // Own SELL remains untouched.
    expect(
      orderbook.asks.some(
        (restingOrder) => restingOrder.orderId === "own-order",
      ),
    ).toBe(true);

    // Incoming BUY still has remaining quantity 1.
    expect(
      orderbook.bids.some(
        (restingOrder) =>
          restingOrder.orderId === "incoming-buy" &&
          restingOrder.quantity - restingOrder.filled === 1,
      ),
    ).toBe(true);
  });
});

describe("Precision errors are taken care of", () => {
  it.todo("Bid doesnt persist even with decimals", () => {
    const orderbook = new Orderbook(
      "TATA",
      "INR",
      [
        {
          price: 999,
          quantity: 0.551123,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [
        {
          price: 1001,
          quantity: 0.551,
          orderId: "2",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 999,
      quantity: 0.551123,
      orderId: "3",
      filled: 0,
      side: "sell" as const,
      userId: "3",
    };

    const { fills } = orderbook.addOrder(order);

    expect(fills.length).toBe(1);
    expect(orderbook.bids.length).toBe(0);
    expect(orderbook.asks.length).toBe(1);
  });
});
