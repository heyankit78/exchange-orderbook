import { DEPTH_UPDATE, TICKER_UPDATE } from "./trade/events";
import { RedisClientType, createClient } from "redis";
import {
  ORDER_UPDATE,
  TRADE_ADDED,
  WsMessage,
  MessageToApi,
  DbMessage,
} from "@repo/shared";

// type DbMessage =
//   | {
//       type: typeof TRADE_ADDED;
//       data: {
//         id: string;
//         isBuyerMaker: boolean;
//         price: string;
//         quantity: string;
//         quoteQuantity: string;
//         timestamp: number;
//         market: string;

//         buyerUserId: string;
//         sellerUserId: string;
//       };
//     }
//   | {
//       type: typeof ORDER_UPDATE;
//       data: {
//         orderId: string;
//         executedQuantity: number;
//         userId?: string;
//         market?: string;
//         price?: string;
//         quantity?: string;
//         side?: "buy" | "sell";
//         cancelled?: boolean;
//       };
//     };

export class RedisManager {
  private client: RedisClientType;
  private static instance: RedisManager;

  constructor() {
    this.client = createClient();
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
