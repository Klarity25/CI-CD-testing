// middleware.js
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
const { redisClient } = require("../config/redis");

const authenticate = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    logger.warn("No token provided");
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    const deviceId = req.header("Device-Id") || "unknown";
    const session = await redisClient.get(
      `session:${decoded.userId}:${deviceId}`
    );

    if (!session) {
      logger.warn(
        `No session found for user ${decoded.userId}, device ${deviceId}`
      );
      return res.status(401).json({ message: "Session expired" });
    }

    // Validate stored session token
    try {
      const storedDecoded = jwt.verify(session, process.env.JWT_SECRET);
      if (
        storedDecoded.userId === decoded.userId &&
        storedDecoded.exp > Math.floor(Date.now() / 1000)
      ) {
        logger.debug(
          `Session validated for user ${decoded.userId}, device ${deviceId}`,
          {
            providedToken: token,
            storedSession: session,
            userIdMatch: storedDecoded.userId === decoded.userId,
            isStoredTokenValid:
              storedDecoded.exp > Math.floor(Date.now() / 1000),
          }
        );
        next();
      } else {
        logger.warn(
          `Session mismatch for user ${decoded.userId}, device ${deviceId}`,
          {
            userIdMatch: storedDecoded.userId === decoded.userId,
            isStoredTokenValid:
              storedDecoded.exp > Math.floor(Date.now() / 1000),
            providedToken: token,
            storedSession: session,
          }
        );
        return res.status(401).json({ message: "Session expired" });
      }
    } catch (error) {
      logger.warn(
        `Invalid stored session token for user ${decoded.userId}, device ${deviceId}`,
        {
          error: error.message,
          providedToken: token,
          storedSession: session,
        }
      );
      return res.status(401).json({ message: "Session expired" });
    }
  } catch (error) {
    logger.error("Invalid token:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authenticate;
