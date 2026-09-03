import { randomUUID } from "crypto";
import { BASE_CURRENCY } from "./Engine";

export interface Order {
  price: number;
  quantity: number;
  orderId: string;
  filled: number;
  side: "buy" | "sell";
  userId: string;
}

export interface Fill {
  price: string;
  quantity: number;
  tradeId: string;
  makerUserId: string;
  makerOrderId: string;

  makerFilledQuantity: number;
  makerOrderQuantity: number;
}

export class Orderbook {
  bids: Order[];
  asks: Order[];
  baseAsset: string;
  quoteAsset: string;
  currentPrice: number;

  // constructor(baseAsset: string, bids: Order[], asks: Order[], lastTradeId: number, currentPrice: number) {
  //     this.bids = bids;
  //     this.asks = asks;
  //     this.baseAsset = baseAsset;
  //     this.lastTradeId = lastTradeId || 0;
  //     this.currentPrice = currentPrice ||0;
  // }

  constructor(
    baseAsset: string,
    quoteAsset: string,
    bids: Order[],
    asks: Order[],
    currentPrice: number,
  ) {
    this.bids = bids;
    this.asks = asks;
    this.baseAsset = baseAsset;
    this.quoteAsset = quoteAsset;
    this.currentPrice = currentPrice || 0;
  }

  ticker() {
    return `${this.baseAsset}_${this.quoteAsset}`;
  }

  getSnapshot() {
    return {
      baseAsset: this.baseAsset,
      quoteAsset: this.quoteAsset,
      bids: this.bids,
      asks: this.asks,
      currentPrice: this.currentPrice,
    };
  }

  //TODO: Add self trade prevention
  addOrder(
    order: Order,
    commandId?: string,
  ): {
    executedQuantity: number;
    fills: Fill[];
  } {
    if (order.side === "buy") {
      const { executedQuantity, fills } = this.matchBid(order, commandId);
      order.filled = executedQuantity;
      if (executedQuantity === order.quantity) {
        return {
          executedQuantity,
          fills,
        };
      }
      this.bids.push(order);
      return {
        executedQuantity,
        fills,
      };
    } else {
      const { executedQuantity, fills } = this.matchAsk(order, commandId);
      order.filled = executedQuantity;
      if (executedQuantity === order.quantity) {
        return {
          executedQuantity,
          fills,
        };
      }
      this.asks.push(order);
      return {
        executedQuantity,
        fills,
      };
    }
  }

  matchBid(
    order: Order,
    commandId?: string,
  ): { fills: Fill[]; executedQuantity: number } {
    const fills: Fill[] = [];
    let executedQuantity = 0;

    this.asks.sort((a, b) => a.price - b.price);
    for (let i = 0; i < this.asks.length; i++) {
      if (this.asks[i].userId === order.userId) {
        continue;
      }
      if (
        this.asks[i].price <= order.price &&
        executedQuantity < order.quantity
      ) {
        const makerRemainingQuantity =
          this.asks[i].quantity - this.asks[i].filled;

        const filledQuantity = Math.min(
          order.quantity - executedQuantity,
          makerRemainingQuantity,
        );
        executedQuantity += filledQuantity;
        this.asks[i].filled += filledQuantity;

        const fillIndex = fills.length;
        fills.push({
          price: this.asks[i].price.toString(),
          quantity: filledQuantity,
          tradeId: commandId ? `trade-${commandId}-${fillIndex}` : randomUUID(),
          makerUserId: this.asks[i].userId,
          makerOrderId: this.asks[i].orderId,

          makerFilledQuantity: this.asks[i].filled,
          makerOrderQuantity: this.asks[i].quantity,
        });
      }
    }
    for (let i = 0; i < this.asks.length; i++) {
      if (this.asks[i].filled === this.asks[i].quantity) {
        this.asks.splice(i, 1);
        i--;
      }
    }
    return {
      fills,
      executedQuantity,
    };
  }

  matchAsk(
    order: Order,
    commandId?: string,
  ): { fills: Fill[]; executedQuantity: number } {
    const fills: Fill[] = [];
    let executedQuantity = 0;

    this.bids.sort((a, b) => b.price - a.price);
    for (let i = 0; i < this.bids.length; i++) {
      if (this.bids[i].userId === order.userId) {
        continue;
      }
      if (
        this.bids[i].price >= order.price &&
        executedQuantity < order.quantity
      ) {
        const makerRemainingQuantity =
          this.bids[i].quantity - this.bids[i].filled;

        const filledQuantity = Math.min(
          order.quantity - executedQuantity,
          makerRemainingQuantity,
        );
        executedQuantity += filledQuantity;
        this.bids[i].filled += filledQuantity;

        const fillIndex = fills.length;
        fills.push({
          price: this.bids[i].price.toString(),
          quantity: filledQuantity,
          tradeId: commandId ? `trade-${commandId}-${fillIndex}` : randomUUID(),
          makerUserId: this.bids[i].userId,
          makerOrderId: this.bids[i].orderId,

          makerFilledQuantity: this.bids[i].filled,
          makerOrderQuantity: this.bids[i].quantity,
        });
      }
    }
    for (let i = 0; i < this.bids.length; i++) {
      if (this.bids[i].filled === this.bids[i].quantity) {
        this.bids.splice(i, 1);
        i--;
      }
    }
    return {
      fills,
      executedQuantity,
    };
  }

  //TODO: Can you make this faster? Can you compute this during order matches?
  getDepth() {
    const bids: [string, string][] = [];
    const asks: [string, string][] = [];

    const bidsObj: { [key: string]: number } = {};
    const asksObj: { [key: string]: number } = {};

    for (let i = 0; i < this.bids.length; i++) {
      const order = this.bids[i];
      console.log("BID IN ENGINE:", {
        orderId: order.orderId,
        price: order.price,
        quantity: order.quantity,
        filled: order.filled,
        remaining: order.quantity - order.filled,
        userId: order.userId,
      });
      if (!bidsObj[order.price]) {
        bidsObj[order.price] = 0;
      }
      bidsObj[order.price] += order.quantity - order.filled;
    }

    for (let i = 0; i < this.asks.length; i++) {
      const order = this.asks[i];
      if (!asksObj[order.price]) {
        asksObj[order.price] = 0;
      }
      asksObj[order.price] += order.quantity - order.filled;
    }

    for (const price in bidsObj) {
      bids.push([price, bidsObj[price].toString()]);
    }

    for (const price in asksObj) {
      asks.push([price, asksObj[price].toString()]);
    }

    return {
      bids,
      asks,
    };
  }

  getOpenOrders(userId: string): Order[] {
    const asks = this.asks.filter((x) => x.userId === userId);
    const bids = this.bids.filter((x) => x.userId === userId);
    return [...asks, ...bids];
  }

  cancelBid(order: Order) {
    const index = this.bids.findIndex((x) => x.orderId === order.orderId);
    if (index !== -1) {
      const price = this.bids[index].price;
      this.bids.splice(index, 1);
      return price;
    }
  }

  cancelAsk(order: Order) {
    const index = this.asks.findIndex((x) => x.orderId === order.orderId);
    if (index !== -1) {
      const price = this.asks[index].price;
      this.asks.splice(index, 1);
      return price;
    }
  }
  // return executedQuantity,fi
}
