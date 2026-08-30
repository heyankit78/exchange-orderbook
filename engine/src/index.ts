import { createClient } from "redis";
import { Engine } from "./trade/Engine";

async function main() {
  const engine = new Engine();

  const redisClient = createClient();
  await redisClient.connect();

  console.log("connected to redis");

  await engine.init();

  // -----------------------------
  // 1. Recover old pending messages
  // -----------------------------
  while (true) {
    const response = await redisClient.xReadGroup(
      "engine-group",
      "engine-1",
      {
        key: "messages",
        id: "0",
      },
      {
        COUNT: 1,
      },
    );

    if (!response) {
      break;
    }

    const stream = response[0];

    if (!stream || stream.messages.length === 0) {
      break;
    }

    const redisMessage = stream.messages[0];

    const streamId = redisMessage.id;
    const rawMessage = redisMessage.message.message;

    console.log("RECOVERING:", streamId);

    try {
      const parsedMessage = JSON.parse(rawMessage);

      await engine.process(parsedMessage);

      await redisClient.xAck("messages", "engine-group", streamId);

      console.log("RECOVERED + ACKED:", streamId);
    } catch (error) {
      console.error("RECOVERY FAILED:", error);
      break;
    }
  }

  console.log("Pending recovery finished");

  // -----------------------------
  // 2. Read NEW messages forever
  // -----------------------------
  while (true) {
    const response = await redisClient.xReadGroup(
      "engine-group",
      "engine-1",
      {
        key: "messages",
        id: ">",
      },
      {
        COUNT: 1,
        BLOCK: 0,
      },
    );

    if (!response) {
      continue;
    }

    const stream = response[0];

    if (!stream || stream.messages.length === 0) {
      continue;
    }

    const redisMessage = stream.messages[0];

    const streamId = redisMessage.id;
    const rawMessage = redisMessage.message.message;

    console.log("NEW MESSAGE:", streamId);

    try {
      const parsedMessage = JSON.parse(rawMessage);

      await engine.process(parsedMessage);

      await redisClient.xAck("messages", "engine-group", streamId);

      console.log("ACKED:", streamId);
    } catch (error) {
      console.error("PROCESSING FAILED:", error);

      // no ACK
      // stays pending
    }
  }
}

main();
