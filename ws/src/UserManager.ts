import { WebSocket } from "ws";
import { User } from "./User";
import { SubscriptionManager } from "./SubscriptionManager";

export class UserManager {
  private static instance: UserManager;

  private users = new Map<string, User>();

  private constructor() {}

  public static getInstance() {
    if (!this.instance) {
      this.instance = new UserManager();
    }

    return this.instance;
  }

  public addUser(ws: WebSocket, authenticatedUserId?: string) {
    const connectionId = this.getRandomId();

    const user = new User(connectionId, ws, authenticatedUserId);

    this.users.set(connectionId, user);

    console.log("🟢 WS connection created:", connectionId);

    ws.on("close", async () => {
      console.log("🔴 WS connection closed:", connectionId);

      try {
        // First clean Redis subscriptions
        await SubscriptionManager.getInstance().userLeft(connectionId);
      } catch (error) {
        console.error("❌ Failed cleaning WS subscriptions:", error);
      }

      // Then remove the User object
      this.users.delete(connectionId);
    });

    return user;
  }

  public getUser(connectionId: string) {
    return this.users.get(connectionId);
  }

  private getRandomId() {
    return crypto.randomUUID();
  }
}
