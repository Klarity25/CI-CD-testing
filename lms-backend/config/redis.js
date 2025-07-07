const { createClient } = require("redis");
const logger = require("../utils/logger");
require("dotenv").config();

const redisClient = createClient({
  url: `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
  socket: {
    reconnectStrategy: (retries) => {
      logger.info(`Redis reconnect attempt ${retries}`);
      if (retries > 10) {
        logger.error("Too many Redis reconnect attempts");
        return new Error("Too many reconnect attempts");
      }
      return Math.min(retries * 100, 3000);
    },
    connectTimeout: 10000,
  },
});

redisClient.on("error", (err) => {
  logger.error("Redis Client Error:", err);
});

redisClient.on("connect", () => {
  logger.info("Connected to Redis");
});

redisClient.on("ready", () => {
  logger.info("Redis client ready for use");
});

redisClient.on("end", () => {
  logger.info("Redis client disconnected");
});

redisClient.on("reconnecting", () => {
  logger.info("Redis client reconnecting");
});

const connectRedis = async () => {
  let retries = 0;
  const maxRetries = 5;

  while (retries < maxRetries) {
    try {
      await redisClient.connect();
      logger.info("Redis connection established");
      return;
    } catch (err) {
      retries++;
      logger.error(
        `Failed to connect to Redis (attempt ${retries}/${maxRetries}):`,
        err
      );
      if (retries === maxRetries) {
        throw new Error("Failed to connect to Redis after maximum retries");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    }
  }
};

module.exports = { redisClient, connectRedis };
