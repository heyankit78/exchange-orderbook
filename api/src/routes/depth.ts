import { Router } from "express";
import { RedisManager } from "../RedisManager";
import { GET_DEPTH, MessageToApi } from "@repo/shared";

export const depthRouter = Router();

depthRouter.get("/", async (req, res) => {
  const { symbol } = req.query;
  const response = (await RedisManager.getInstance().sendAndAwait({
    type: GET_DEPTH,
    data: {
      market: symbol as string,
    },
  })) as MessageToApi;

  res.json(response.payload);
});
