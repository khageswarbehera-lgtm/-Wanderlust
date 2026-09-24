require("dotenv").config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbUrl: process.env.MONGODB_URI || "mongodb://localhost:27017/wanderlust",
  sessionSecret: process.env.SESSION_SECRET || "development-session-secret",
  isProduction: process.env.NODE_ENV === "production"
};