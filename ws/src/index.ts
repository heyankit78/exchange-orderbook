import { WebSocketServer } from "ws";
import { UserManager } from "./UserManager";
import { SubscriptionManager } from "./SubscriptionManager";

const PORT = Number(process.env.PORT) || 3001;

const wss = new WebSocketServer({
  port: PORT,
});

wss.on("connection", (ws) => {
  UserManager.getInstance().addUser(ws);
});
