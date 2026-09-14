import { RedisClientType, createClient } from "redis";
import { UserManager } from "./UserManager";

export class SubscriptionManager {
  private static instance: SubscriptionManager;

  // connectionId -> channels wanted by that websocket
  private subscriptions = new Map<string, Set<string>>();

  // channel -> websocket connectionIds
  private reverseSubscriptions = new Map<string, Set<string>>();

  // Redis channels this WS service has already subscribed to
  private redisSubscribedChannels = new Set<string>();

  private redisClient: RedisClientType;
  private redisReady: Promise<void>;

  private constructor() {
    const REDIS_URL = process.env.REDIS_URL;

    if (!REDIS_URL) {
      throw new Error("REDIS_URL is missing");
    }

    this.redisClient = createClient({
      url: REDIS_URL,
    });

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

  // =====================================================
  // SUBSCRIBE
  // =====================================================

  public async subscribe(connectionId: string, subscription: string) {
    await this.redisReady;

    let userSubscriptions = this.subscriptions.get(connectionId);

    if (!userSubscriptions) {
      userSubscriptions = new Set<string>();

      this.subscriptions.set(connectionId, userSubscriptions);
    }

    // This websocket already wants this channel
    if (userSubscriptions.has(subscription)) {
      return;
    }

    // -------------------------------------------------
    // Subscribe Redis only ONCE for lifetime of service
    // -------------------------------------------------

    if (!this.redisSubscribedChannels.has(subscription)) {
      // Mark first BEFORE await.
      // This prevents another subscribe call from also
      // trying to subscribe the same Redis channel.
      this.redisSubscribedChannels.add(subscription);

      try {
        console.log("📡 Redis subscribing:", subscription);

        await this.redisClient.subscribe(
          subscription,
          this.redisCallbackHandler,
        );

        console.log("✅ Redis subscribed:", subscription);
      } catch (error) {
        // Allow retry later if Redis subscribe failed
        this.redisSubscribedChannels.delete(subscription);

        throw error;
      }
    }

    // -------------------------------------------------
    // Add local websocket ownership
    // -------------------------------------------------

    userSubscriptions.add(subscription);

    let channelConnections = this.reverseSubscriptions.get(subscription);

    if (!channelConnections) {
      channelConnections = new Set<string>();

      this.reverseSubscriptions.set(subscription, channelConnections);
    }

    channelConnections.add(connectionId);

    console.log("✅ WS client subscribed:", {
      connectionId,
      subscription,
      listeners: channelConnections.size,
    });
  }

  // =====================================================
  // UNSUBSCRIBE
  // =====================================================

  public async unsubscribe(connectionId: string, subscription: string) {
    const userSubscriptions = this.subscriptions.get(connectionId);

    if (!userSubscriptions?.has(subscription)) {
      return;
    }

    // Remove channel from this websocket
    userSubscriptions.delete(subscription);

    if (userSubscriptions.size === 0) {
      this.subscriptions.delete(connectionId);
    }

    // Remove websocket from channel listeners
    const channelConnections = this.reverseSubscriptions.get(subscription);

    if (channelConnections) {
      channelConnections.delete(connectionId);

      if (channelConnections.size === 0) {
        // Important:
        //
        // Remove local listeners,
        // but DON'T Redis UNSUBSCRIBE.
        //
        // Redis subscription stays alive.
        this.reverseSubscriptions.delete(subscription);
      }
    }

    console.log("🔴 WS client unsubscribed:", {
      connectionId,
      subscription,
    });
  }

  // =====================================================
  // SOCKET CLOSED
  // =====================================================

  public async userLeft(connectionId: string) {
    console.log("👋 WS connection left:", connectionId);

    const activeSubscriptions = [
      ...(this.subscriptions.get(connectionId) ?? []),
    ];

    for (const subscription of activeSubscriptions) {
      await this.unsubscribe(connectionId, subscription);
    }

    this.subscriptions.delete(connectionId);
  }

  // =====================================================
  // REDIS MESSAGE
  // =====================================================

  private redisCallbackHandler = (message: string, channel: string) => {
    try {
      const parsedMessage = JSON.parse(message);

      console.log("🔥 REDIS PUBSUB RECEIVED:", channel);

      const connections = this.reverseSubscriptions.get(channel);

      // Redis may still be subscribed even though
      // currently no browser needs the channel.
      if (!connections?.size) {
        return;
      }

      connections.forEach((connectionId) => {
        const user = UserManager.getInstance().getUser(connectionId);

        user?.emit(parsedMessage);
      });
    } catch (error) {
      console.error("❌ Failed processing Redis PubSub:", error);
    }
  };

  public getSubscriptions(connectionId: string) {
    return [...(this.subscriptions.get(connectionId) ?? [])];
  }
}
