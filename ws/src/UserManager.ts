import { WebSocket } from "ws";
import { User } from "./User";
import { SubscriptionManager } from "./SubscriptionManager";

export class UserManager {
  private static instance: UserManager;
  private users: Map<string, User> = new Map();

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

    this.registerOnClose(ws, connectionId);

    return user;
  }

  private registerOnClose(ws: WebSocket, connectionId: string) {
    ws.on("close", () => {
      this.users.delete(connectionId);

      SubscriptionManager.getInstance().userLeft(connectionId);
    });
  }

  public getUser(connectionId: string) {
    return this.users.get(connectionId);
  }

  private getRandomId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }
}
