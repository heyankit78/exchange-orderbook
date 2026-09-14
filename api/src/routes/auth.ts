import { Router } from "express";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import crypto from "crypto";
import { RedisManager } from "../RedisManager";
import { ON_RAMP } from "@repo/shared";

export const authRouter = Router();

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL,
});
pgClient.connect();

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const JWT_SECRET = process.env.JWT_SECRET;

const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

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
authRouter.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  try {
    const hash = hashPassword(password);
    const result = await pgClient.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, hash],
    );
    const user = result.rows[0];
    const userId = String(user.id);

    // Tell engine to give this user initial balance
    RedisManager.getInstance().sendAndAwait({
      type: ON_RAMP,
      data: {
        userId,
        asset: "USDC",
        amount: "10000000",
        txnId: crypto.randomUUID(),
      },
    });

    console.log(`User registered: ${email} (id: ${userId})`);
    // const token = jwt.sign(
    //   {
    //     userId,
    //     email: user.email,
    //   },
    //   JWT_SECRET,
    //   {
    //     expiresIn: "1h",
    //   },
    // );

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
      return res.status(409).json({ message: "Email already registered" });
    }
    console.error("Register error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});
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
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const hash = hashPassword(password);
    const result = await pgClient.query(
      "SELECT id, email FROM users WHERE email = $1 AND password_hash = $2",
      [email, hash],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];
    console.log(`User logged in: ${email} (id: ${user.id})`);

    // const token = jwt.sign(
    //   {
    //     userId: String(user.id),
    //     email: user.email,
    //   },
    //   JWT_SECRET,
    //   {
    //     expiresIn: "1h",
    //   },
    // );
    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);
    console.log(`User logged in: ${email} (id: ${user.id})`);
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
    return res.status(500).json({ message: "Server error" });
  }
});
