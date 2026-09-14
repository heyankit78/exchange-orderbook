import { IncomingWsMessage, WsMessage } from "@repo/shared";
import { Ticker } from "./types";

export const BASE_URL = "ws://localhost:3001";

export class SignalingManager {
  private ws: WebSocket;
  private static instance: SignalingManager;

  private bufferedMessages: any[] = [];
  private callbacks: any = {};

  private id = 1;
  private initialized = false;

  private authToken?: string;

  // channel -> number of frontend consumers
  private subscriptions = new Map<string, number>();

  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private constructor() {
    this.ws = new WebSocket(BASE_URL);
    this.init();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new SignalingManager();
    }

    return this.instance;
  }

  // =====================================================
  // AUTH
  // =====================================================

  authenticate(token: string) {
    this.authToken = token;

    if (!this.initialized) {
      return;
    }

    this.sendRaw({
      method: "AUTH",
      token,
    });
  }
  public clearAuthentication() {
    this.authToken = undefined;
  }
  // =====================================================
  // SOCKET INITIALIZATION
  // =====================================================

  private init() {
    this.ws.onopen = () => {
      console.log("✅ WebSocket connected");

      this.initialized = true;

      // Reset exponential backoff
      this.reconnectAttempts = 0;

      // Re-authenticate
      this.restoreAuthentication();

      // Re-subscribe to channels still needed
      this.restoreSubscriptions();

      // Send normal buffered messages
      this.flushBufferedMessages();
    };

    this.ws.onmessage = (event) => {
      const message: WsMessage = JSON.parse(event.data);

      if (!message?.data?.e) {
        return;
      }

      const type = message.data.e;

      console.log("🔥 WS RAW EVENT:", type, message.data);

      if (!this.callbacks[type]) {
        return;
      }

      this.callbacks[type].forEach(({ callback }: any) => {
        // -----------------------------
        // TICKER
        // -----------------------------

        if (type === "ticker") {
          const newTicker: Partial<Ticker> = {
            lastPrice: message.data.c,
            high: message.data.h,
            low: message.data.l,
            volume: message.data.v,
            quoteVolume: message.data.V,
            symbol: message.data.s,
          };

          callback(newTicker);
        }

        // -----------------------------
        // DEPTH
        // -----------------------------

        if (type === "depth") {
          callback({
            bids: message.data.b,
            asks: message.data.a,
          });
        }

        // -----------------------------
        // PUBLIC TRADE
        // -----------------------------

        if (type === "trade") {
          callback({
            price: message.data.p,
            quantity: message.data.q,
            tradeId: message.data.t,
            isBuyerMaker: message.data.m,
            market: message.data.s,
            timestamp: Date.now(),
          });
        }

        // -----------------------------
        // PRIVATE USER TRADE
        // -----------------------------

        if (type === "my_trade") {
          callback({
            tradeId: String(message.data.t),
            market: message.data.s,
            price: String(message.data.p),
            quantity: String(message.data.q),

            quoteQuantity: (
              Number(message.data.p) * Number(message.data.q)
            ).toString(),

            side: message.data.side,

            createdAt: new Date(message.data.timestamp).toISOString(),
          });
        }

        // -----------------------------
        // ORDER UPDATE
        // -----------------------------

        if (type === "order_update") {
          console.log("🔥 SIGNALING ORDER UPDATE:", message.data);

          callback({
            orderId: message.data.orderId,
            filled: message.data.filled,
            status: message.data.status,
          });
        }
      });
    };

    // =====================================================
    // ERROR
    // =====================================================

    this.ws.onerror = () => {
      console.log("❌ WebSocket error");

      this.ws.close();
    };

    // =====================================================
    // CLOSE
    // =====================================================

    this.ws.onclose = () => {
      console.log("❌ WebSocket disconnected");

      this.initialized = false;

      this.scheduleReconnect();
    };
  }

  // =====================================================
  // PUBLIC SEND MESSAGE
  // =====================================================

  sendMessage(message: Record<string, unknown>) {
    if (message.method === "SUBSCRIBE") {
      const subscriptionsToSend: string[] = [];

      //@ts-ignore
      message.params?.forEach((subscription: string) => {
        const currentCount = this.subscriptions.get(subscription) ?? 0;

        console.log("🟢 SUB COUNT BEFORE:", subscription, currentCount);

        this.subscriptions.set(subscription, currentCount + 1);

        console.log("🟢 SUB COUNT AFTER:", subscription, currentCount + 1);

        // Only tell server when 0 -> 1
        if (currentCount === 0) {
          subscriptionsToSend.push(subscription);
        }
      });

      // All requested channels were already active
      if (subscriptionsToSend.length === 0) {
        return;
      }

      // If disconnected:
      // don't buffer SUBSCRIBE.
      // The Map remembers the desired state.
      if (!this.initialized) {
        return;
      }

      console.log("📤 SENDING SUBSCRIBE TO SERVER:", subscriptionsToSend);

      this.sendRaw({
        method: "SUBSCRIBE",
        params: subscriptionsToSend,
      });

      return;
    }

    // =====================================================
    // UNSUBSCRIBE
    // =====================================================

    if (message.method === "UNSUBSCRIBE") {
      const subscriptionsToRemove: string[] = [];

      //@ts-ignore
      message.params?.forEach((subscription: string) => {
        const currentCount = this.subscriptions.get(subscription) ?? 0;

        console.log("🔴 UNSUB COUNT BEFORE:", subscription, currentCount);

        // Nobody owns this subscription
        if (currentCount === 0) {
          return;
        }

        if (currentCount === 1) {
          this.subscriptions.delete(subscription);

          console.log("🔴 UNSUB COUNT AFTER:", subscription, 0);

          subscriptionsToRemove.push(subscription);

          return;
        }

        this.subscriptions.set(subscription, currentCount - 1);

        console.log("🔴 UNSUB COUNT AFTER:", subscription, currentCount - 1);
      });

      if (subscriptionsToRemove.length === 0) {
        return;
      }

      if (!this.initialized) {
        return;
      }

      this.sendRaw({
        method: "UNSUBSCRIBE",
        params: subscriptionsToRemove,
      });

      return;
    }

    // =====================================================
    // AUTH
    // =====================================================

    if (message.method === "AUTH") {
      //@ts-ignore
      this.authToken = message.token;

      if (!this.initialized) {
        return;
      }

      this.sendRaw(message);

      return;
    }

    // =====================================================
    // NORMAL MESSAGE
    // =====================================================

    const messageToSend = {
      ...message,
      id: this.id++,
    };

    if (!this.initialized) {
      this.bufferedMessages.push(messageToSend);

      return;
    }

    this.ws.send(JSON.stringify(messageToSend));
  }

  // =====================================================
  // LOW LEVEL SEND
  // =====================================================

  private sendRaw(message: any) {
    if (!this.initialized) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        ...message,
        id: this.id++,
      }),
    );
  }

  // =====================================================
  // RE-AUTH AFTER RECONNECT
  // =====================================================

  private restoreAuthentication() {
    if (!this.authToken) {
      return;
    }

    this.sendRaw({
      method: "AUTH",
      token: this.authToken,
    });
  }

  // =====================================================
  // RE-SUBSCRIBE AFTER RECONNECT
  // =====================================================

  private restoreSubscriptions() {
    if (this.subscriptions.size === 0) {
      return;
    }

    const activeSubscriptions = Array.from(this.subscriptions.keys());

    this.sendRaw({
      method: "SUBSCRIBE",
      params: activeSubscriptions,
    });
  }

  // =====================================================
  // BUFFER
  // =====================================================

  private flushBufferedMessages() {
    if (!this.initialized) {
      return;
    }

    this.bufferedMessages.forEach((message) => {
      this.ws.send(JSON.stringify(message));
    });

    this.bufferedMessages = [];
  }

  // =====================================================
  // RECONNECT
  // =====================================================

  private scheduleReconnect() {
    // Prevent multiple timers
    if (this.reconnectTimer) {
      return;
    }

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);

    this.reconnectAttempts++;

    console.log(`🔄 Reconnecting in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;

      console.log("🔄 Attempting WebSocket reconnect...");

      this.ws = new WebSocket(BASE_URL);

      this.init();
    }, delay);
  }

  // =====================================================
  // CALLBACK REGISTER
  // =====================================================

  async registerCallback(type: string, callback: any, id: string) {
    this.callbacks[type] = this.callbacks[type] || [];

    const existing = this.callbacks[type].find((item: any) => item.id === id);

    if (existing) {
      existing.callback = callback;
      return;
    }

    this.callbacks[type].push({
      callback,
      id,
    });
  }

  // =====================================================
  // CALLBACK REMOVE
  // =====================================================

  async deRegisterCallback(type: string, id: string) {
    if (!this.callbacks[type]) {
      return;
    }

    const index = this.callbacks[type].findIndex((item: any) => item.id === id);

    if (index !== -1) {
      this.callbacks[type].splice(index, 1);
    }
  }
}
