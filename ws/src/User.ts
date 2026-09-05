import { WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { SubscriptionManager } from "./SubscriptionManager";
import {
  AUTH,
  IncomingWsMessage,
  OutgoingMessage,
  SUBSCRIBE,
  UNSUBSCRIBE,
} from "@repo/shared";

const JWT_SECRET = "my-super-secret-key";

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

  public subscribe(subscription: string) {
    this.subscriptions.push(subscription);
  }

  public unsubscribe(subscription: string) {
    this.subscriptions = this.subscriptions.filter((s) => s !== subscription);
  }

  emit(message: OutgoingMessage) {
    this.ws.send(JSON.stringify(message));
  }

  private addListeners() {
    this.ws.on("message", (message: string) => {
      const parsedMessage: IncomingWsMessage = JSON.parse(message);

      // 1. AUTHENTICATE THIS WEBSOCKET CONNECTION
      if (parsedMessage.method === "AUTH") {
        try {
          const payload = jwt.verify(parsedMessage.token, JWT_SECRET) as {
            userId: string;
          };

          this.authenticatedUserId = String(payload.userId);

          console.log(
            "WebSocket authenticated user:",
            this.authenticatedUserId,
          );
        } catch (error) {
          console.log("Invalid WebSocket token");
        }

        return;
      }

      // 2. SUBSCRIBE
      if (parsedMessage.method === SUBSCRIBE) {
        parsedMessage.params.forEach((subscription: string) => {
          if (subscription.startsWith("user_trades@")) {
            const requestedUserId = subscription.split("@")[1];

            if (
              !this.authenticatedUserId ||
              requestedUserId !== this.authenticatedUserId
            ) {
              console.log("Unauthorized private subscription:", subscription);

              return;
            }
          }

          SubscriptionManager.getInstance().subscribe(
            this.connectionId,
            subscription,
          );
        });
      }

      // 3. UNSUBSCRIBE
      if (parsedMessage.method === UNSUBSCRIBE) {
        parsedMessage.params.forEach((subscription: string) =>
          SubscriptionManager.getInstance().unsubscribe(
            this.connectionId,
            subscription,
          ),
        );
      }
    });
  }
}
