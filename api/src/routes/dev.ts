import { Router } from "express";
import crypto from "crypto";
import { RedisManager } from "../RedisManager";
import { ON_RAMP } from "@repo/shared";
import { authenticate, AuthRequest } from "../middleware/auth";

export const devRouter = Router();

const ALLOWED_ASSETS = ["USDC", "BTC", "ETH", "SOL"] as const;

devRouter.post("/on-ramp", authenticate, async (req: AuthRequest, res) => {
  // -----------------------------------
  // NEVER ALLOW THIS IN PRODUCTION
  // -----------------------------------

  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({
      message: "Dev on-ramp is disabled in production",
    });
  }

  if (!req.user) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const { asset, amount } = req.body;

  if (!ALLOWED_ASSETS.includes(asset)) {
    return res.status(400).json({
      message: "Invalid asset",
    });
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({
      message: "Invalid amount",
    });
  }

  try {
    await RedisManager.getInstance().sendAndAwait({
      type: ON_RAMP,

      data: {
        userId: req.user.userId,

        asset,

        amount: numericAmount.toString(),

        txnId: crypto.randomUUID(),
      },
    });

    return res.json({
      success: true,
      asset,
      amount: numericAmount,
    });
  } catch (error) {
    console.error("Dev on-ramp failed:", error);

    return res.status(500).json({
      message: "Failed to fund account",
    });
  }
});
