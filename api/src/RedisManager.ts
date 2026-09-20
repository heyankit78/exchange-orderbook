import { RedisClientType, createClient } from "redis";

export class RedisManager {
  private client: RedisClientType;
  private publisher: RedisClientType;

  private static instance: RedisManager;

  private constructor() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error("REDIS_URL is missing");
    }

    this.client = createClient({
      url: redisUrl,
    });

    this.publisher = createClient({
      url: redisUrl,
    });

    this.client.on("error", (err) => {
      console.error("Redis subscriber error:", err);
    });

    this.publisher.on("error", (err) => {
      console.error("Redis publisher error:", err);
    });

    this.client.connect();
    this.publisher.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }

    return this.instance;
  }

  public async sendAndAwait(message: unknown) {
    return new Promise(async (resolve, reject) => {
      const id = this.getRandomClientId();

      const timeout = setTimeout(async () => {
        try {
          await this.client.unsubscribe(id);
        } finally {
          reject(new Error("Matching engine request timed out"));
        }
      }, 10_000);

      try {
        await this.client.subscribe(id, async (response) => {
          clearTimeout(timeout);
          await this.client.unsubscribe(id);
          resolve(JSON.parse(response));
        });

        await this.publisher.xAdd("messages", "*", {
          message: JSON.stringify({
            clientId: id,
            message,
          }),
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  public getRandomClientId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
