const crypto = require("node:crypto");
const mongoose = require("mongoose");

const collectionName = "auth_rate_limits";
const retentionMs = 24 * 60 * 60 * 1000;

const initializeAuthRateLimits = async () => {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB must be connected before initializing auth rate limits.");

  await database.collection(collectionName).createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: "auth_rate_limits_expiry" }
  );
};

const createAuthRateLimit = (scope, limit, windowMs) => async (req, res, next) => {
  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error("MongoDB is not connected for auth rate limiting.");

    const clientAddress = req.ip || req.socket.remoteAddress || "unknown";
    const id = crypto.createHash("sha256")
      .update(`${scope}\0${clientAddress}`)
      .digest("hex");
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMs);
    const record = await database.collection(collectionName).findOneAndUpdate(
      { _id: id },
      [{
        $set: {
          count: {
            $cond: [
              { $gt: [{ $ifNull: ["$resetAt", new Date(0)] }, now] },
              { $add: [{ $ifNull: ["$count", 0] }, 1] },
              1
            ]
          },
          resetAt: {
            $cond: [
              { $gt: [{ $ifNull: ["$resetAt", new Date(0)] }, now] },
              "$resetAt",
              windowEnd
            ]
          },
          expiresAt: {
            $cond: [
              { $gt: [{ $ifNull: ["$resetAt", new Date(0)] }, now] },
              "$expiresAt",
              new Date(windowEnd.getTime() + retentionMs)
            ]
          }
        }
      }],
      { upsert: true, returnDocument: "after" }
    );
    const bucket = record?.value || record;

    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).render("error", {
        status: 429,
        message: "Too many attempts. Please wait before trying again."
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAuthRateLimit,
  initializeAuthRateLimits
};
