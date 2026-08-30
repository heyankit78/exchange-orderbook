import fs from "fs";
import { Client } from "pg";
import { RedisManager } from "../RedisManager";
import { ORDER_UPDATE, TRADE_ADDED } from "@repo/shared";
import {
  CANCEL_ORDER,
  CREATE_ORDER,
  GET_BALANCE,
  GET_DEPTH,
  GET_OPEN_ORDERS,
  MessageFromApi,
  ON_RAMP,
} from "@repo/shared";
import { Fill, Order } from "@repo/shared";
import { Orderbook } from "./Orderbook";

export const BASE_CURRENCY = "INR";

interface UserBalance {
  [key: string]: {
    available: number;
    locked: number;
  };
}

const DEFAULT_BALANCE: UserBalance = {
  INR: { available: 10000000, locked: 0 },
  USDC: { available: 10000, locked: 0 },
  TATA: { available: 100, locked: 0 },
  BTC: { available: 1, locked: 0 },
  ETH: { available: 10, locked: 0 },
};

export class Engine {
  private pgClient: Client;
  private orderbooks: Orderbook[] = [];
  private balances: Map<string, UserBalance> = new Map();

  constructor() {
    // Connect to PostgreSQL and load balances
    this.pgClient = new Client({
      user: "your_user",
      host: "localhost",
      database: "my_database",
      password: "your_password",
      port: 5432,
    });

    // Load orderbook snapshot if available
    let snapshot = null;
    try {
      if (process.env.WITH_SNAPSHOT) {
        // snapshot = fs.readFileSync("./snapshot.json");
      }
    } catch (e) {
      console.log("No snapshot found");
    }

    if (snapshot) {
      const parsed = JSON.parse(snapshot.toString());
      this.orderbooks = parsed.orderbooks.map(
        (o: any) =>
          new Orderbook(
            o.baseAsset,
            o.quoteAsset,
            o.bids,
            o.asks,
            o.currentPrice,
          ),
      );
    } else {
      this.orderbooks = [
        new Orderbook("TATA", "INR", [], [], 0),
        new Orderbook("BTC", "INR", [], [], 0),
        new Orderbook("ETH", "INR", [], [], 0),
        new Orderbook("BTC", "USDC", [], [], 0),
        new Orderbook("ETH", "USDC", [], [], 0),
      ];
    }

    setInterval(() => this.saveSnapshot(), 3000);
  }

  // ─── PostgreSQL ────────────────────────────────────────────────

  async init() {
    await this.pgClient.connect();

    console.log("Engine connected to PostgreSQL");

    await this.loadBalancesFromDb();

    await this.loadOpenOrdersFromDb();
    console.log("Engine READY");
  }
  async loadBalancesFromDb() {
    try {
      const result = await this.pgClient.query(
        "SELECT user_id, asset, available, locked FROM balances",
      );
      const map = new Map<string, UserBalance>();
      for (const row of result.rows) {
        const uid = String(row.user_id);
        if (!map.has(uid)) map.set(uid, {});
        map.get(uid)![row.asset] = {
          available: Number(row.available),
          locked: Number(row.locked),
        };
      }
      this.balances = map;
      console.log(`Loaded balances for ${map.size} users from PostgreSQL`);
    } catch (e) {
      console.error("Failed to load balances from DB:", e);
    }
  }

  async persistBalance(userId: string, asset: string) {
    const bal = this.balances.get(userId)?.[asset];
    if (!bal) return;
    try {
      await this.pgClient.query(
        `INSERT INTO balances (user_id, asset, available, locked, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id, asset)
                 DO UPDATE SET available = EXCLUDED.available, locked = EXCLUDED.locked, updated_at = NOW()`,
        [Number(userId), asset, bal.available, bal.locked],
      );
    } catch (e) {
      console.error(`Failed to persist ${userId}/${asset}:`, e);
    }
  }

  async persistAllBalances(userId: string) {
    const bal = this.balances.get(userId);
    if (!bal) return;
    await Promise.all(
      Object.keys(bal).map((asset) => this.persistBalance(userId, asset)),
    );
  }

  // ─── Snapshot ──────────────────────────────────────────────────

  saveSnapshot() {
    // Balances are in PostgreSQL now — only save orderbooks
    fs.writeFileSync(
      "./snapshot.json",
      JSON.stringify({
        orderbooks: this.orderbooks.map((o) => o.getSnapshot()),
      }),
    );
  }

  // ─── Message processor ─────────────────────────────────────────

  async process({
    message,
    clientId,
  }: {
    message: MessageFromApi;
    clientId: string;
  }) {
    switch (message.type) {
      case CREATE_ORDER:
        try {
          const { executedQuantity, fills, orderId } = this.createOrder(
            message.data.market,
            message.data.price,
            message.data.quantity,
            message.data.side,
            message.data.userId,
          );
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_PLACED",
            payload: { orderId, executedQuantity, fills },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unable to place order";
          console.error("CREATE ORDER FAILED:", msg);

          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId: "",
              executedQuantity: 0,
              remainingQty: 0,
              error: msg,
            },
          });
        }
        break;

      case CANCEL_ORDER:
        try {
          const { orderId, market: cancelMarket, userId } = message.data;
          const [baseAsset, quoteAsset] = cancelMarket.split("_");
          const cancelOrderbook = this.orderbooks.find(
            (o) => o.ticker() === cancelMarket,
          );
          if (!cancelOrderbook) throw new Error("No orderbook found");

          const order =
            cancelOrderbook.asks.find((o) => o.orderId === orderId) ||
            cancelOrderbook.bids.find((o) => o.orderId === orderId);
          if (!order) throw new Error("No order found");
          if (order.userId !== userId) {
            throw new Error("You cannot cancel another user's order");
          }

          const bal = this.balances.get(order.userId)!;

          if (order.side === "buy") {
            const price = cancelOrderbook.cancelBid(order);
            const leftAmount = (order.quantity - order.filled) * order.price;
            bal[quoteAsset].available += leftAmount;
            bal[quoteAsset].locked -= leftAmount;
            this.persistBalance(order.userId, quoteAsset).catch(console.error);
            if (price) this.sendUpdatedDepthAt(price.toString(), cancelMarket);
          } else {
            const price = cancelOrderbook.cancelAsk(order);
            const leftQty = order.quantity - order.filled;
            bal[baseAsset].available += leftQty;
            bal[baseAsset].locked -= leftQty;
            this.persistBalance(order.userId, baseAsset).catch(console.error);
            if (price) this.sendUpdatedDepthAt(price.toString(), cancelMarket);
          }

          RedisManager.getInstance().pushMessage({
            type: ORDER_UPDATE,
            data: {
              orderId,
              executedQuantity: order.filled,
              cancelled: true,
            },
          });
          RedisManager.getInstance().sendToApi(clientId, {
            type: "ORDER_CANCELLED",
            payload: {
              orderId,
              executedQuantity: order.filled,
              remainingQty: order.quantity - order.filled,
            },
          });
        } catch (e) {
          console.error("Error cancelling order:", e);
        }
        break;

      case GET_OPEN_ORDERS:
        try {
          const ob = this.orderbooks.find(
            (o) => o.ticker() === message.data.market,
          );
          if (!ob) throw new Error("No orderbook found");
          RedisManager.getInstance().sendToApi(clientId, {
            type: "OPEN_ORDERS",
            payload: ob.getOpenOrders(message.data.userId),
          });
        } catch (e) {
          console.error(e);
        }
        break;

      case ON_RAMP:
        // Use void to fire-and-forget but still log errors
        await this.onRamp(message.data.userId, Number(message.data.amount));
        break;

      case GET_DEPTH:
        try {
          const ob = this.orderbooks.find(
            (o) => o.ticker() === message.data.market,
          );
          if (!ob) throw new Error("No orderbook found");
          RedisManager.getInstance().sendToApi(clientId, {
            type: "DEPTH",
            payload: ob.getDepth(),
          });
        } catch (e) {
          RedisManager.getInstance().sendToApi(clientId, {
            type: "DEPTH",
            payload: { bids: [], asks: [] },
          });
        }
        break;

      case GET_BALANCE: {
        const balance = this.balances.get(message.data.userId);
        console.log("GET_BALANCE for", message.data.userId, "→", balance);
        RedisManager.getInstance().sendToApi(clientId, {
          type: "BALANCE",
          payload: balance || {},
        });
        break;
      }
    }
  }
  async loadOpenOrdersFromDb() {
    const result = await this.pgClient.query(`
    SELECT
      order_id,
      user_id,
      market,
      side,
      price,
      quantity,
      filled
    FROM orders
    WHERE order_status IN ('OPEN', 'PARTIALLY_FILLED')
  `);

    for (const row of result.rows) {
      const orderbook = this.orderbooks.find((o) => o.ticker() === row.market);

      if (!orderbook) {
        console.log("No orderbook for market:", row.market);
        continue;
      }

      const order: Order = {
        orderId: row.order_id,
        userId: String(row.user_id),
        price: Number(row.price),
        quantity: Number(row.quantity),
        filled: Number(row.filled),
        side: row.side,
      };

      if (order.side === "buy") {
        orderbook.bids.push(order);
      } else {
        orderbook.asks.push(order);
      }
    }

    console.log(
      `Loaded ${result.rows.length} open/partial orders from PostgreSQL`,
    );
  }

  // ─── Order logic ───────────────────────────────────────────────

  createOrder(
    market: string,
    price: string,
    quantity: string,
    side: "buy" | "sell",
    takerUserId: string,
  ) {
    const orderbook = this.orderbooks.find((o) => o.ticker() === market);
    const baseAsset = market.split("_")[0];
    const quoteAsset = market.split("_")[1];
    if (!orderbook) throw new Error("No orderbook found");

    this.checkAndLockFunds(
      baseAsset,
      quoteAsset,
      side,
      takerUserId,
      price,
      quantity,
    );

    const order: Order = {
      price: Number(price),
      quantity: Number(quantity),
      orderId:
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15),
      filled: 0,
      side,
      userId: takerUserId,
    };

    const { fills, executedQuantity } = orderbook.addOrder(order);

    this.updateBalance(
      takerUserId,
      baseAsset,
      quoteAsset,
      side,
      fills,
      Number(price),
    );

    this.createDbTrades(side, fills, market, takerUserId);
    this.updateDbOrders(order, executedQuantity, fills, market);
    this.publisWsDepthUpdates(fills, price, side, market);
    this.publishUserOrderUpdates(fills);
    this.publishWsTrades(side, fills, market);
    this.publishUserTradeUpdates(side, fills, market, takerUserId);
    return { executedQuantity, fills, orderId: order.orderId };
  }
  publishUserOrderUpdates(fills: Fill[]) {
    fills.forEach((fill) => {
      const status =
        fill.makerFilledQuantity >= fill.makerOrderQuantity
          ? "FILLED"
          : "PARTIALLY_FILLED";

      RedisManager.getInstance().publishMessage(
        `user_trades@${fill.makerUserId}`,
        {
          stream: `user_trades@${fill.makerUserId}`,
          data: {
            e: "order_update",
            orderId: fill.makerOrderId,
            filled: fill.makerFilledQuantity,
            status,
          },
        },
      );
    });
  }
  publishUserTradeUpdates(
    side: "buy" | "sell",
    fills: Fill[],
    market: string,
    takerUserId: string,
  ) {
    fills.forEach((fill) => {
      const buyerUserId = side === "buy" ? takerUserId : fill.makerUserId;

      const sellerUserId = side === "sell" ? takerUserId : fill.makerUserId;

      const commonData = {
        e: "my_trade",
        t: fill.tradeId,
        p: fill.price,
        q: fill.quantity.toString(),
        s: market,
        timestamp: Date.now(),
      } as const;

      console.log("BUYER CHANNEL:", `user_trades@${buyerUserId}`);
      console.log("SELLER CHANNEL:", `user_trades@${sellerUserId}`);

      console.log("🔥 PRIVATE TRADE USERS", {
        incomingUser: takerUserId,
        otherUser: fill.makerUserId,
        buyerUserId,
        sellerUserId,
      });

      console.log("🔥 PUBLISH BUYER:", `user_trades@${buyerUserId}`);

      console.log("🔥 PUBLISH SELLER:", `user_trades@${sellerUserId}`);
      // Buyer-specific event
      RedisManager.getInstance().publishMessage(`user_trades@${buyerUserId}`, {
        stream: `user_trades@${buyerUserId}`,
        data: {
          ...commonData,
          side: "buy",
        },
      });

      // Seller-specific event
      RedisManager.getInstance().publishMessage(`user_trades@${sellerUserId}`, {
        stream: `user_trades@${sellerUserId}`,
        data: {
          ...commonData,
          side: "sell",
        },
      });
    });
  }
  checkAndLockFunds(
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    userId: string,
    price: string,
    quantity: string,
  ) {
    const bal = this.balances.get(userId);
    if (side === "buy") {
      const need = Number(quantity) * Number(price);
      if ((bal?.[quoteAsset]?.available ?? 0) < need)
        throw new Error("Insufficient funds");
      bal![quoteAsset].available -= need;
      bal![quoteAsset].locked += need;
      this.persistBalance(userId, quoteAsset).catch(console.error);
    } else {
      const need = Number(quantity);
      if ((bal?.[baseAsset]?.available ?? 0) < need)
        throw new Error("Insufficient funds");
      bal![baseAsset].available -= need;
      bal![baseAsset].locked += need;
      // BUG FIX: was persisting quoteAsset here — should be baseAsset
      this.persistBalance(userId, baseAsset).catch(console.error);
    }
  }

  updateBalance(
    takerUserId: string,
    baseAsset: string,
    quoteAsset: string,
    side: "buy" | "sell",
    fills: Fill[],
    orderPrice: number,
  ) {
    const affectedUsers = new Set<string>([takerUserId]);

    if (side === "buy") {
      fills.forEach((fill) => {
        const makerBalance = this.balances.get(fill.makerUserId)!;

        const takerBalance = this.balances.get(takerUserId)!;
        const executionPrice = Number(fill.price);

        const actualValue = fill.quantity * executionPrice;

        const reservedValue = fill.quantity * orderPrice;

        const refund = reservedValue - actualValue;

        // Seller receives actual trade value
        makerBalance[quoteAsset].available += actualValue;

        // Buyer's reserved money for this filled quantity is released
        takerBalance[quoteAsset].locked -= reservedValue;

        // Price improvement comes back
        takerBalance[quoteAsset].available += refund;

        // Seller gives asset
        makerBalance[baseAsset].locked -= fill.quantity;

        // Buyer receives asset
        takerBalance[baseAsset].available += fill.quantity;

        affectedUsers.add(fill.makerUserId);
      });
    } else {
      fills.forEach((fill) => {
        const makerBalance = this.balances.get(fill.makerUserId)!;

        const takerBalance = this.balances.get(takerUserId)!;

        const tradeValue = fill.quantity * Number(fill.price);

        makerBalance[quoteAsset].locked -= tradeValue;
        takerBalance[quoteAsset].available += tradeValue;
        makerBalance[baseAsset].available += fill.quantity;
        takerBalance[baseAsset].locked -= fill.quantity;
        affectedUsers.add(fill.makerUserId);
      });
    }

    affectedUsers.forEach((uid) =>
      this.persistAllBalances(uid).catch(console.error),
    );
  }

  async onRamp(userId: string, amount: number) {
    const existing = this.balances.get(userId);
    if (!existing) {
      // Brand new user — set default balance
      const newBal: UserBalance = {
        INR: { available: amount, locked: 0 },
        USDC: { available: DEFAULT_BALANCE.USDC.available, locked: 0 },
        TATA: { available: DEFAULT_BALANCE.TATA.available, locked: 0 },
        BTC: { available: DEFAULT_BALANCE.BTC.available, locked: 0 },
        ETH: { available: DEFAULT_BALANCE.ETH.available, locked: 0 },
      };
      this.balances.set(userId, newBal);
    } else {
      // Existing user — just top up INR
      if (!existing.INR) existing.INR = { available: 0, locked: 0 };
      existing.INR.available += amount;
    }
    // Persist to PostgreSQL — await so we're sure it saves
    await this.persistAllBalances(userId);
    console.log(`onRamp done for user ${userId} — persisted to DB`);
  }

  // ─── WS + DB publishing ────────────────────────────────────────

  addOrderbook(orderbook: Orderbook) {
    this.orderbooks.push(orderbook);
  }

  updateDbOrders(
    order: Order,
    executedQuantity: number,
    fills: Fill[],
    market: string,
  ) {
    RedisManager.getInstance().pushMessage({
      type: ORDER_UPDATE,
      data: {
        orderId: order.orderId,
        userId: order.userId,
        executedQuantity,
        market,
        price: order.price.toString(),
        quantity: order.quantity.toString(),
        side: order.side,
      },
    });
    fills.forEach((fill) => {
      RedisManager.getInstance().pushMessage({
        type: ORDER_UPDATE,
        data: { orderId: fill.makerOrderId, executedQuantity: fill.quantity },
      });
    });
  }

  createDbTrades(
    side: "buy" | "sell",
    fills: Fill[],
    market: string,
    takerUserId: string,
  ) {
    fills.forEach((fill) => {
      const buyerUserId = side === "buy" ? takerUserId : fill.makerUserId;

      const sellerUserId = side === "sell" ? takerUserId : fill.makerUserId;
      RedisManager.getInstance().pushMessage({
        type: TRADE_ADDED,
        data: {
          market,
          id: fill.tradeId.toString(),
          isBuyerMaker: side === "sell",
          price: fill.price,
          quantity: fill.quantity.toString(),
          quoteQuantity: (fill.quantity * Number(fill.price)).toString(),
          timestamp: Date.now(),
          buyerUserId,
          sellerUserId,
        },
      });
    });
  }

  publishWsTrades(side: "buy" | "sell", fills: Fill[], market: string) {
    fills.forEach((fill) => {
      RedisManager.getInstance().publishMessage(`trade@${market}`, {
        stream: `trade@${market}`,
        data: {
          e: "trade",
          t: fill.tradeId,
          m: side === "sell",
          p: fill.price,
          q: fill.quantity.toString(),
          s: market,
        },
      });
    });
  }

  sendUpdatedDepthAt(price: string, market: string) {
    const ob = this.orderbooks.find((o) => o.ticker() === market);
    if (!ob) return;
    const depth = ob.getDepth();
    const updatedBids = depth.bids.filter((x) => x[0] === price);
    const updatedAsks = depth.asks.filter((x) => x[0] === price);
    RedisManager.getInstance().publishMessage(`depth@${market}`, {
      stream: `depth@${market}`,
      data: {
        a: updatedAsks.length ? updatedAsks : [[price, "0"]],
        b: updatedBids.length ? updatedBids : [[price, "0"]],
        e: "depth",
      },
    });
  }

  publisWsDepthUpdates(
    fills: Fill[],
    price: string,
    side: "buy" | "sell",
    market: string,
  ) {
    const ob = this.orderbooks.find((o) => o.ticker() === market);
    if (!ob) return;
    const depth = ob.getDepth();
    const affectedPrices = new Set<string>([
      price,
      ...fills.map((f) => f.price),
    ]);
    const bidUpdates: [string, string][] = [];
    const askUpdates: [string, string][] = [];
    affectedPrices.forEach((p) => {
      bidUpdates.push(depth.bids.find(([bp]) => bp === p) ?? [p, "0"]);
      askUpdates.push(depth.asks.find(([ap]) => ap === p) ?? [p, "0"]);
    });
    RedisManager.getInstance().publishMessage(`depth@${market}`, {
      stream: `depth@${market}`,
      data: { b: bidUpdates, a: askUpdates, e: "depth" },
    });
  }
}
