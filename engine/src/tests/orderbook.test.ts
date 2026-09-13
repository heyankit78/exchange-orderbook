import { describe, expect, it } from "vitest";
import { Orderbook } from "../trade/Orderbook";

describe("Simple orders", () => {
  it("Empty orderbook should not be filled", () => {
    const orderbook = new Orderbook("BTC", "USDC", [], [], 0);

    const order = {
      price: 60000,
      quantity: 1,
      orderId: "1",
      filled: 0,
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(0);
    expect(executedQuantity).toBe(0);

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.asks.length).toBe(0);
  });

  it("Can partially fill an incoming sell order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 60000,
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
      price: 60000,
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

    expect(orderbook.bids.length).toBe(0);

    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].quantity).toBe(2);
    expect(orderbook.asks[0].filled).toBe(1);

    expect(orderbook.asks[0].quantity - orderbook.asks[0].filled).toBe(1);
  });

  it("Can partially fill an incoming buy order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 59900,
          quantity: 1,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [
        {
          price: 60100,
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
      price: 60100,
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
    expect(fills[0].price).toBe("60100");
    expect(fills[0].makerOrderId).toBe("2");
    expect(fills[0].makerUserId).toBe("2");

    expect(orderbook.asks.length).toBe(0);

    expect(orderbook.bids.length).toBe(2);
  });
});

describe("Maker remaining quantity", () => {
  it("Does not overfill an already partially filled maker order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 60000,
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
      price: 60000,
      quantity: 4,
      orderId: "taker-1",
      filled: 0,
      side: "buy" as const,
      userId: "2",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(3);

    expect(fills.length).toBe(1);
    expect(fills[0].quantity).toBe(3);

    expect(fills[0].makerOrderId).toBe("maker-1");
    expect(fills[0].makerUserId).toBe("1");

    expect(fills[0].makerFilledQuantity).toBe(5);
    expect(fills[0].makerOrderQuantity).toBe(5);

    expect(orderbook.asks.length).toBe(0);

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].quantity).toBe(4);
    expect(orderbook.bids[0].filled).toBe(3);

    expect(orderbook.bids[0].quantity - orderbook.bids[0].filled).toBe(1);
  });
});

describe("Price priority", () => {
  it("Matches the lowest ask first for an incoming buy order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 60100,
          quantity: 2,
          orderId: "ask-60100",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 59900,
          quantity: 2,
          orderId: "ask-59900",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 60100,
      quantity: 2,
      orderId: "buy-1",
      filled: 0,
      side: "buy" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(2);
    expect(fills.length).toBe(1);

    expect(fills[0].price).toBe("59900");
    expect(fills[0].makerOrderId).toBe("ask-59900");

    expect(orderbook.asks.length).toBe(1);

    expect(orderbook.asks[0].orderId).toBe("ask-60100");
  });

  it("Matches the highest bid first for an incoming sell order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 59900,
          quantity: 2,
          orderId: "bid-59900",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
        {
          price: 60100,
          quantity: 2,
          orderId: "bid-60100",
          filled: 0,
          side: "buy" as const,
          userId: "2",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 59900,
      quantity: 2,
      orderId: "sell-1",
      filled: 0,
      side: "sell" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(2);
    expect(fills.length).toBe(1);

    expect(fills[0].price).toBe("60100");
    expect(fills[0].makerOrderId).toBe("bid-60100");

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].orderId).toBe("bid-59900");
  });
});

describe("Time priority", () => {
  it("Matches the older order first when prices are equal", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 60000,
          quantity: 2,
          orderId: "first",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 60000,
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
      price: 60000,
      quantity: 3,
      orderId: "buyer",
      filled: 0,
      side: "buy" as const,
      userId: "3",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(3);
    expect(fills.length).toBe(2);

    expect(fills[0].makerOrderId).toBe("first");
    expect(fills[0].quantity).toBe(2);

    expect(fills[1].makerOrderId).toBe("second");
    expect(fills[1].quantity).toBe(1);

    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].orderId).toBe("second");
    expect(orderbook.asks[0].filled).toBe(1);

    expect(orderbook.asks[0].quantity - orderbook.asks[0].filled).toBe(4);
  });
});

describe("Self trade prevention", () => {
  it("User cannot trade against their own resting order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 60000,
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
      price: 60000,
      quantity: 2,
      orderId: "2",
      filled: 0,
      side: "sell" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(fills.length).toBe(0);
    expect(executedQuantity).toBe(0);

    expect(orderbook.bids.length).toBe(1);
    expect(orderbook.bids[0].orderId).toBe("1");

    expect(orderbook.asks.length).toBe(1);
    expect(orderbook.asks[0].orderId).toBe("2");
  });

  it("Skips own order but can match another user's order", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 59900,
          quantity: 2,
          orderId: "own-order",
          filled: 0,
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 60000,
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
      price: 60000,
      quantity: 4,
      orderId: "incoming-buy",
      filled: 0,
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    expect(executedQuantity).toBe(3);

    expect(fills.length).toBe(1);

    expect(fills[0].makerOrderId).toBe("other-order");
    expect(fills[0].makerUserId).toBe("2");
    expect(fills[0].quantity).toBe(3);

    expect(
      orderbook.asks.some(
        (restingOrder) => restingOrder.orderId === "own-order",
      ),
    ).toBe(true);

    expect(
      orderbook.bids.some(
        (restingOrder) =>
          restingOrder.orderId === "incoming-buy" &&
          restingOrder.quantity - restingOrder.filled === 1,
      ),
    ).toBe(true);
  });
});

/* =========================================
   MARKET ORDERS
========================================= */

describe("Market orders", () => {
  it("Market BUY consumes cheapest asks first", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 60100,
          quantity: 0.3,
          filled: 0,
          orderId: "ask-60100",
          side: "sell" as const,
          userId: "2",
        },
        {
          price: 60000,
          quantity: 0.2,
          filled: 0,
          orderId: "ask-60000",
          side: "sell" as const,
          userId: "3",
        },
      ],
      0,
    );

    const order = {
      price: 0,
      quantity: 0.4,
      filled: 0,
      orderId: "market-buy-1",
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(
      order,
      "cmd-1",
    );

    expect(executedQuantity).toBeCloseTo(0.4);

    expect(fills.length).toBe(2);

    expect(fills[0].price).toBe("60000");
    expect(fills[0].quantity).toBeCloseTo(0.2);

    expect(fills[1].price).toBe("60100");
    expect(fills[1].quantity).toBeCloseTo(0.2);

    expect(orderbook.bids.length).toBe(0);

    expect(orderbook.asks.length).toBe(1);

    expect(orderbook.asks[0].orderId).toBe("ask-60100");
    expect(orderbook.asks[0].filled).toBeCloseTo(0.2);
  });

  it("Market SELL consumes highest bids first", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 59900,
          quantity: 0.5,
          filled: 0,
          orderId: "bid-59900",
          side: "buy" as const,
          userId: "2",
        },
        {
          price: 60000,
          quantity: 0.2,
          filled: 0,
          orderId: "bid-60000",
          side: "buy" as const,
          userId: "3",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 0,
      quantity: 0.4,
      filled: 0,
      orderId: "market-sell-1",
      side: "sell" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(
      order,
      "cmd-2",
    );

    expect(executedQuantity).toBeCloseTo(0.4);

    expect(fills.length).toBe(2);

    expect(fills[0].price).toBe("60000");
    expect(fills[0].quantity).toBeCloseTo(0.2);

    expect(fills[1].price).toBe("59900");
    expect(fills[1].quantity).toBeCloseTo(0.2);

    expect(orderbook.asks.length).toBe(0);

    expect(orderbook.bids.length).toBe(1);

    expect(orderbook.bids[0].orderId).toBe("bid-59900");
    expect(orderbook.bids[0].filled).toBeCloseTo(0.2);
  });

  it("Market BUY does not rest unfilled remainder in orderbook", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 60000,
          quantity: 0.2,
          filled: 0,
          orderId: "ask-1",
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 0,
      quantity: 1,
      filled: 0,
      orderId: "market-buy-1",
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(order);

    expect(executedQuantity).toBeCloseTo(0.2);

    expect(fills.length).toBe(1);

    expect(orderbook.asks.length).toBe(0);

    // IMPORTANT:
    // remaining 0.8 BTC must NOT become a resting BID
    expect(orderbook.bids.length).toBe(0);
  });

  it("Market SELL does not rest unfilled remainder in orderbook", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 60000,
          quantity: 0.2,
          filled: 0,
          orderId: "bid-1",
          side: "buy" as const,
          userId: "2",
        },
      ],
      [],
      0,
    );

    const order = {
      price: 0,
      quantity: 1,
      filled: 0,
      orderId: "market-sell-1",
      side: "sell" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(order);

    expect(executedQuantity).toBeCloseTo(0.2);

    expect(fills.length).toBe(1);

    expect(orderbook.bids.length).toBe(0);

    // IMPORTANT:
    // remaining 0.8 BTC must NOT become a resting ASK
    expect(orderbook.asks.length).toBe(0);
  });

  it("Market order skips own liquidity and matches another user", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [],
      [
        {
          price: 59900,
          quantity: 0.5,
          filled: 0,
          orderId: "own-ask",
          side: "sell" as const,
          userId: "1",
        },
        {
          price: 60000,
          quantity: 0.5,
          filled: 0,
          orderId: "other-ask",
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    const order = {
      price: 0,
      quantity: 0.3,
      filled: 0,
      orderId: "market-buy",
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(order);

    expect(executedQuantity).toBeCloseTo(0.3);

    expect(fills.length).toBe(1);

    expect(fills[0].makerOrderId).toBe("other-ask");
    expect(fills[0].price).toBe("60000");

    const ownOrder = orderbook.asks.find(
      (restingOrder) => restingOrder.orderId === "own-ask",
    );

    expect(ownOrder).toBeDefined();
    expect(ownOrder?.filled).toBe(0);
  });

  it("Market order returns zero fills when opposite book is empty", () => {
    const orderbook = new Orderbook("BTC", "USDC", [], [], 0);

    const order = {
      price: 0,
      quantity: 1,
      filled: 0,
      orderId: "market-buy-empty",
      side: "buy" as const,
      userId: "1",
    };

    const { fills, executedQuantity } = orderbook.addMarketOrder(order);

    expect(fills.length).toBe(0);
    expect(executedQuantity).toBe(0);

    expect(orderbook.bids.length).toBe(0);
    expect(orderbook.asks.length).toBe(0);
  });
});

describe("Precision errors are taken care of", () => {
  it.todo("Bid doesnt persist even with decimals", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 59900,
          quantity: 0.551123,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [
        {
          price: 60100,
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
      price: 59900,
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

  it("getDepth uses canonical price keys so 60000.00 matches 60000", () => {
    const orderbook = new Orderbook(
      "BTC",
      "USDC",
      [
        {
          price: 60000,
          quantity: 1,
          orderId: "1",
          filled: 0,
          side: "buy" as const,
          userId: "1",
        },
      ],
      [
        {
          price: 60000.5,
          quantity: 2,
          orderId: "2",
          filled: 0,
          side: "sell" as const,
          userId: "2",
        },
      ],
      0,
    );

    expect(orderbook.getDepth()).toEqual({
      bids: [["60000", "1"]],
      asks: [["60000.5", "2"]],
    });
  });
});
