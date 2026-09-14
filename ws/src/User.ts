import { WebSocket } from "ws";
import jwt from "jsonwebtoken";

import { SubscriptionManager } from "./SubscriptionManager";

import {
  AUTH,
  IncomingWsMessage,
  SUBSCRIBE,
  UNSUBSCRIBE,
  WsMessage,
} from "@repo/shared";

const JWT_SECRET = "my-super-secret-key";

function isIncomingWsMessage(message: unknown): message is IncomingWsMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const parsed = message as Record<string, unknown>;

  // AUTH
  if (parsed.method === AUTH) {
    return typeof parsed.token === "string";
  }

  // SUBSCRIBE / UNSUBSCRIBE
  if (parsed.method === SUBSCRIBE || parsed.method === UNSUBSCRIBE) {
    return (
      Array.isArray(parsed.params) &&
      parsed.params.every((item) => typeof item === "string")
    );
  }

  return false;
}

export class User {
  private connectionId: string;
  private ws: WebSocket;
  private authenticatedUserId?: string;

  private subscriptions: string[] = [];

  constructor(
    connectionId: string,
    ws: WebSocket,
    authenticatedUserId?: string,
  ) {
    this.connectionId = connectionId;
    this.ws = ws;
    this.authenticatedUserId = authenticatedUserId;

    this.addListeners();
  }

  emit(message: WsMessage) {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  private addListeners() {
    this.ws.on("message", async (message) => {
      let parsedMessage: unknown;

      // 1. PARSE JSON SAFELY
      try {
        parsedMessage = JSON.parse(message.toString());
      } catch {
        console.log("Invalid WebSocket JSON");

        return;
      }

      // 2. VALIDATE MESSAGE SHAPE
      if (!isIncomingWsMessage(parsedMessage)) {
        console.log("Invalid WebSocket message:", parsedMessage);

        return;
      }

      // From here:
      // parsedMessage is IncomingWsMessage

      // =====================================
      // AUTH
      // =====================================

      if (parsedMessage.method === AUTH) {
        try {
          const payload = jwt.verify(parsedMessage.token, JWT_SECRET) as {
            userId: string;
          };

          this.authenticatedUserId = String(payload.userId);

          console.log(
            "WebSocket authenticated user:",
            this.authenticatedUserId,
          );
        } catch {
          console.log("Invalid WebSocket token");
        }

        return;
      }

      // =====================================
      // SUBSCRIBE
      // =====================================
      if (parsedMessage.method === SUBSCRIBE) {
        console.log("🟡 WS SERVER SUBSCRIBE:", {
          subscriptions: parsedMessage.params,
        });
        for (const subscription of parsedMessage.params) {
          if (subscription.startsWith("user_trades@")) {
            const requestedUserId = subscription.split("@")[1];

            if (
              !this.authenticatedUserId ||
              requestedUserId !== this.authenticatedUserId
            ) {
              console.log("Unauthorized private subscription:", subscription);

              continue;
            }
          }

          try {
            await SubscriptionManager.getInstance().subscribe(
              this.connectionId,
              subscription,
            );
          } catch (error) {
            console.error("❌ Subscription failed:", subscription, error);
          }
        }

        return;
      }
      // =====================================
      // UNSUBSCRIBE
      // =====================================

      if (parsedMessage.method === UNSUBSCRIBE) {
        for (const subscription of parsedMessage.params) {
          try {
            await SubscriptionManager.getInstance().unsubscribe(
              this.connectionId,
              subscription,
            );
          } catch (error) {
            console.error("❌ Unsubscribe failed:", subscription, error);
          }
        }
      }
    });
  }
}
