import { Router } from "express";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { RedisManager } from "../RedisManager";
import { ON_RAMP } from "@repo/shared";

export const authRouter = Router();

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// This is a demonstration exchange, so every new account receives a
// non-withdrawable portfolio that can be used to try every configured market.
const REGISTRATION_DEMO_BALANCES = [
  { asset: "USDC", amount: "10000000" },
  { asset: "BTC", amount: "1" },
  { asset: "ETH", amount: "10" },
  { asset: "SOL", amount: "100" },
] as const;

function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function createAccessToken(user: { id: string | number; email: string }) {
  return jwt.sign(
    {
      userId: String(user.id),
      email: user.email,
      type: "access",
    },
    JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

function createRefreshToken(user: { id: string | number; email: string }) {
  return jwt.sign(
    {
      userId: String(user.id),
      email: user.email,
      type: "refresh",
    },
    REFRESH_TOKEN_SECRET,
    {
      expiresIn: "30d",
    },
  );
}

/* =========================
   REGISTER
========================= */

authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 8 characters and contain uppercase, lowercase, number and special character",
    });
  }

  try {
    // Hash password using bcrypt
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pgClient.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email`,
      [email, passwordHash],
    );

    const user = result.rows[0];
    const userId = String(user.id);

    // Tell the engine to create the user's initial demo portfolio.
    for (const { asset, amount } of REGISTRATION_DEMO_BALANCES) {
      await RedisManager.getInstance().sendAndAwait({
        type: ON_RAMP,
        data: {
          userId,
          asset,
          amount,
          txnId: crypto.randomUUID(),
        },
      });
    }

    console.log(`User registered: ${email} (id: ${userId})`);

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    return res.json({
      accessToken,
      refreshToken,

      user: {
        id: String(user.id),
        email: user.email,
      },
    });
  } catch (e: any) {
    if (e.code === "23505") {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    console.error("Register error:", e);

    return res.status(500).json({
      message: "Server error",
    });
  }
});

/* =========================
   REFRESH TOKEN
========================= */

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      message: "Refresh token required",
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as {
      userId: string;
      email: string;
      type: string;
    };

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    const newAccessToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        type: "access",
      },
      JWT_SECRET,
      {
        expiresIn: "15m",
      },
    );

    return res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
});

/* =========================
   LOGIN
========================= */

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  try {
    // Get user by email first
    const result = await pgClient.query(
      `SELECT id, email, password_hash
       FROM users
       WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = result.rows[0];

    // Compare plain password with bcrypt hash
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    console.log(`User logged in: ${email} (id: ${user.id})`);

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    return res.json({
      accessToken,
      refreshToken,

      user: {
        id: String(user.id),
        email: user.email,
      },
    });
  } catch (e) {
    console.error("Login error:", e);

    return res.status(500).json({
      message: "Server error",
    });
  }
});
