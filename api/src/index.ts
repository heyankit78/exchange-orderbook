import "dotenv/config";
import express from "express";
import cors from "cors";
import { orderRouter } from "./routes/order";
import { depthRouter } from "./routes/depth";
import { tradesRouter } from "./routes/trades";
import { klineRouter } from "./routes/kline";
import { tickersRouter } from "./routes/ticker";
import { authRouter } from "./routes/auth";
import { authenticate } from "./middleware/auth";
import { balanceRouter } from "./routes/balance";
import { devRouter } from "./routes/dev";

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!FRONTEND_URL) {
  throw new Error("FRONTEND_URL is missing");
}

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "api",
    timestamp: new Date().toISOString(),
  });
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/order", authenticate, orderRouter);
app.use("/api/v1/depth", depthRouter);
app.use("/api/v1/trades", tradesRouter);
app.use("/api/v1/klines", klineRouter);
app.use("/api/v1/tickers", tickersRouter);
app.use("/api/v1/balance", authenticate, balanceRouter);
app.use("/api/v1/dev", authenticate, devRouter);

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server is running on port ${PORT}`);
});
