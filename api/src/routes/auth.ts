import { Router } from "express";
import jwt from "jsonwebtoken";
const JWT_SECRET = "my-super-secret-key";
import { Client } from "pg";
import crypto from "crypto";
import { RedisManager } from "../RedisManager";
import { ON_RAMP } from "../types";

export const authRouter = Router();

const pgClient = new Client({
    user: "your_user",
    host: "localhost",
    database: "my_database",
    password: "your_password",
    port: 5432,
});
pgClient.connect();

function hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
}

authRouter.post("/register", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    try {
        const hash = hashPassword(password);
        const result = await pgClient.query(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            [email, hash]
        );
        const user = result.rows[0];
        const userId = String(user.id);

        // Tell engine to give this user initial balance
        RedisManager.getInstance().sendAndAwait({
            type: ON_RAMP,
            data: {
                userId,
                amount: "10000000",
                txnId: crypto.randomUUID(),
            },
        });

        console.log(`User registered: ${email} (id: ${userId})`);
       const token = jwt.sign(
    {
        userId,
        email: user.email
    },
    JWT_SECRET,
    {
        expiresIn: "1h"
    }
);

return res.json({
    token,
    user: {
        id: userId,
        email: user.email
    }
});
    } catch (e: any) {
        if (e.code === "23505") {
            return res.status(409).json({ message: "Email already registered" });
        }
        console.error("Register error:", e);
        return res.status(500).json({ message: "Server error" });
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
            [email, hash]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        const user = result.rows[0];
        console.log(`User logged in: ${email} (id: ${user.id})`);

const token = jwt.sign(
    {
        userId: String(user.id),
        email: user.email
    },
    JWT_SECRET,
    {
        expiresIn: "1h"
    }
);

console.log(`User logged in: ${email} (id: ${user.id})`);

return res.json({
    token,
    user: {
        id: String(user.id),
        email: user.email
    }
});    } catch (e) {
        console.error("Login error:", e);
        return res.status(500).json({ message: "Server error" });
    }
});