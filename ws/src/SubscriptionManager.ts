import { RedisClientType, createClient } from "redis";
import { UserManager } from "./UserManager";

export class SubscriptionManager {
  private static instance: SubscriptionManager;

  private subscriptions: Map<string, string[]> = new Map();
  private reverseSubscriptions: Map<string, string[]> = new Map();

  private redisClient: RedisClientType;

  // IMPORTANT:
  // everybody waits for the SAME Redis connection
  private redisReady: Promise<void>;

  private constructor() {
    this.redisClient = createClient();

    this.redisClient.on("error", (error) => {
      console.error("❌ WS Redis error:", error);
    });

    this.redisReady = this.redisClient.connect().then(() => {
      console.log("✅ WS Redis subscriber connected");
    });
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new SubscriptionManager();
    }

    return this.instance;
  }

  public async subscribe(connectionId: string, subscription: string) {
    // ----------------------------------------
    // already subscribed by this websocket
    // ----------------------------------------
    if (this.subscriptions.get(connectionId)?.includes(subscription)) {
      return;
    }

    // ----------------------------------------
    // WAIT UNTIL REDIS IS REALLY CONNECTED
    // ----------------------------------------
    await this.redisReady;

    const existingConnections =
      this.reverseSubscriptions.get(subscription) || [];

    const isFirstSubscriber = existingConnections.length === 0;

    // ----------------------------------------
    // IMPORTANT:
    // subscribe Redis FIRST
    // ----------------------------------------
    if (isFirstSubscriber) {
      console.log("📡 Redis subscribing:", subscription);

      await this.redisClient.subscribe(subscription, this.redisCallbackHandler);

      console.log("✅ Redis subscribed:", subscription);
    }

    // ----------------------------------------
    // only update our bookkeeping AFTER success
    // ----------------------------------------
    this.subscriptions.set(connectionId, [
      ...(this.subscriptions.get(connectionId) || []),
      subscription,
    ]);

    this.reverseSubscriptions.set(subscription, [
      ...existingConnections,
      connectionId,
    ]);

    console.log("✅ WS client subscribed:", {
      connectionId,
      subscription,
    });
  }

  private redisCallbackHandler = (message: string, channel: string) => {
    try {
      const parsedMessage = JSON.parse(message);

      console.log("🔥 REDIS PUBSUB RECEIVED:", channel);

      this.reverseSubscriptions.get(channel)?.forEach((connectionId) => {
        UserManager.getInstance().getUser(connectionId)?.emit(parsedMessage);
      });
    } catch (error) {
      console.error("❌ Failed processing Redis PubSub message:", error);
    }
  };

  public async unsubscribe(connectionId: string, subscription: string) {
    await this.redisReady;

    const connectionSubscriptions = this.subscriptions.get(connectionId);

    if (!connectionSubscriptions?.includes(subscription)) {
      return;
    }

    const updatedConnectionSubscriptions = connectionSubscriptions.filter(
      (item) => item !== subscription,
    );

    if (updatedConnectionSubscriptions.length === 0) {
      this.subscriptions.delete(connectionId);
    } else {
      this.subscriptions.set(connectionId, updatedConnectionSubscriptions);
    }

    const connections = this.reverseSubscriptions.get(subscription) || [];

    const remainingConnections = connections.filter(
      (item) => item !== connectionId,
    );

    if (remainingConnections.length === 0) {
      this.reverseSubscriptions.delete(subscription);

      console.log("📡 Redis unsubscribing:", subscription);

      await this.redisClient.unsubscribe(subscription);

      console.log("✅ Redis unsubscribed:", subscription);
    } else {
      this.reverseSubscriptions.set(subscription, remainingConnections);
    }
  }

  public async userLeft(connectionId: string) {
    console.log("user connection left", connectionId);

    const activeSubscriptions = [
      ...(this.subscriptions.get(connectionId) || []),
    ];

    for (const subscription of activeSubscriptions) {
      await this.unsubscribe(connectionId, subscription);
    }

    this.subscriptions.delete(connectionId);
  }

  getSubscriptions(connectionId: string) {
    return this.subscriptions.get(connectionId) || [];
  }
}
