import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { GET_BALANCE } from "../types/index";
import { AuthRequest } from "../middleware/auth";

export const balanceRouter = Router();

balanceRouter.get("/", async (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    console.log("GET_BALANCE IMPORT =", GET_BALANCE);

      console.log("1. BALANCE API HIT:", userId);
    const response = await RedisManager.getInstance().sendAndAwait({
        type: GET_BALANCE,
        data: {
            userId
        }
    });
        console.log("4. BALANCE RESPONSE RECEIVED:", response);


    return res.json(response.payload);
});