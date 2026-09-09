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
app.use(cors());
app.use(express.json());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/order", authenticate, orderRouter);
app.use("/api/v1/depth", depthRouter);
app.use("/api/v1/trades", tradesRouter);
app.use("/api/v1/klines", klineRouter);
app.use("/api/v1/tickers", tickersRouter);
app.use("/api/v1/balance", authenticate, balanceRouter);
app.use("/api/v1/dev", authenticate, devRouter);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
