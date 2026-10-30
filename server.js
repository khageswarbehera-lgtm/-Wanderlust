const app = require("./app");
const connectDatabase = require("./config/database");
const mongoose = require("mongoose");
const { MongoStore } = require("connect-mongo");
const { initializeAuthRateLimits } = require("./middleware/authRateLimit");

const port = process.env.PORT || 3000;
const host = "0.0.0.0";

let server;
let shutdownStarted = false;

const shutdown = async (signal) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}; shutting down.`);

  const forceCloseTimer = setTimeout(() => {
    server?.closeAllConnections();
  }, 10000);
  forceCloseTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await mongoose.disconnect();
    console.log("Shutdown complete.");
  } catch {
    console.error("Graceful shutdown failed.");
    process.exitCode = 1;
  } finally {
    clearTimeout(forceCloseTimer);
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

const startServer = async () => {
  try {
    await connectDatabase();
    await initializeAuthRateLimits();
    const sessionStore = MongoStore.create({
      client: mongoose.connection.getClient(),
      dbName: mongoose.connection.name,
      collectionName: "sessions",
      ttl: 7 * 24 * 60 * 60
    });
    app.configureSessionStore(sessionStore);
    await new Promise((resolve, reject) => {
      sessionStore.get("__startup_readiness_check__", (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      server = app.listen(port, host, resolve);
      server.once("error", reject);
    });
    console.log(`Server listening on ${host}:${port}.`);
  } catch (error) {
    console.error("Application startup failed.");
    await mongoose.disconnect().catch(() => {
      console.error("Database cleanup after startup failure failed.");
    });
    process.exitCode = 1;
  }
};

startServer();