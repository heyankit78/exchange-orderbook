import { RedisClientType, createClient } from "redis";
import { UserManager } from "./UserManager";

export class SubscriptionManager {
  private static instance: SubscriptionManager;
  private subscriptions: Map<string, string[]> = new Map();
  private reverseSubscriptions: Map<string, string[]> = new Map();
  private redisClient: RedisClientType;

  private constructor() {
    this.redisClient = createClient();
    this.redisClient.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new SubscriptionManager();
    }
    return this.instance;
  }
  public subscribe(connectionId: string, subscription: string) {
    if (this.subscriptions.get(connectionId)?.includes(subscription)) {
      return;
    }

    // subscriptions map
    // connection1 -> ["depth@btc", "trade@btc"]
    // connection2 -> ["depth@btc"]
    this.subscriptions.set(
      connectionId,
      (this.subscriptions.get(connectionId) || []).concat(subscription),
    );

    // reverseSubscriptions map
    // "depth@btc" -> ["connection1", "connection2"]
    this.reverseSubscriptions.set(
      subscription,
      (this.reverseSubscriptions.get(subscription) || []).concat(connectionId),
    );

    // If this is the FIRST local connection interested in depth@btc,
    // subscribe this WS server to Redis channel depth@btc.
    if (this.reverseSubscriptions.get(subscription)?.length === 1) {
      this.redisClient.subscribe(subscription, this.redisCallbackHandler);
    }
  }

  private redisCallbackHandler = (message: string, channel: string) => {
    const parsedMessage = JSON.parse(message);
    this.reverseSubscriptions
      .get(channel)
      ?.forEach((s) =>
        UserManager.getInstance().getUser(s)?.emit(parsedMessage),
      );
  };

  public unsubscribe(connectionId: string, subscription: string) {
    const subscriptions = this.subscriptions.get(connectionId);
    if (subscriptions) {
      this.subscriptions.set(
        connectionId,
        subscriptions.filter((s) => s !== subscription),
      );
    }
    const reverseSubscriptions = this.reverseSubscriptions.get(subscription);
    if (reverseSubscriptions) {
      this.reverseSubscriptions.set(
        subscription,
        reverseSubscriptions.filter((s) => s !== connectionId),
      );
      if (this.reverseSubscriptions.get(subscription)?.length === 0) {
        this.reverseSubscriptions.delete(subscription);
        this.redisClient.unsubscribe(subscription);
      }
    }
  }

  public userLeft(connectionId: string) {
    console.log("user connection left " + connectionId);
    this.subscriptions
      .get(connectionId)
      ?.forEach((s) => this.unsubscribe(connectionId, s));
  }

  getSubscriptions(connectionId: string) {
    return this.subscriptions.get(connectionId) || [];
  }
}
