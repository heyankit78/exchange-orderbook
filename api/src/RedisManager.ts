import { RedisClientType, createClient } from "redis";
export class RedisManager {
  private client: RedisClientType;
  private publisher: RedisClientType;
  private static instance: RedisManager;

  private constructor() {
    this.client = createClient();
    this.client.connect();
    this.publisher = createClient();
    this.publisher.connect();
  }
  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }
  public async sendAndAwait(message) {
    return new Promise(async (resolve, reject) => {
      const id = this.getRandomClientId();

      try {
        await this.client.subscribe(id, (message) => {
          this.client.unsubscribe(id);
          resolve(JSON.parse(message));
        });

        const streamId = await this.publisher.xAdd("messages", "*", {
          message: JSON.stringify({
            clientId: id,
            message,
          }),
        });

        console.log("Added to stream:", streamId);
      } catch (err) {
        reject(err);
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
