import { RedisClientType, createClient } from "redis";
import { WsMessage, MessageToApi, DbMessage } from "@repo/shared";

export class RedisManager {
  private client: RedisClientType;
  private static instance: RedisManager;

  constructor() {
    const REDIS_URL = process.env.REDIS_URL;

    if (!REDIS_URL) {
      throw new Error("REDIS_URL is missing");
    }

    this.client = createClient({
      url: REDIS_URL,
    });
    this.client.connect();
  }

  public static getInstance() {
    if (!this.instance) {
      this.instance = new RedisManager();
    }
    return this.instance;
  }

  public async pushMessage(message: DbMessage) {
    // await this.client.lPush("db_processor", JSON.stringify(message));

    const streamId = await this.client.xAdd("db_stream", "*", {
      message: JSON.stringify(message),
    });

    console.log("DB EVENT ADDED:", {
      streamId,
      type: message.type,
    });
    return streamId;
  }

  public publishMessage(channel: string, message: WsMessage) {
    this.client.publish(channel, JSON.stringify(message));
  }

  public sendToApi(clientId: string, message: MessageToApi) {
    this.client.publish(clientId, JSON.stringify(message));
  }
}
