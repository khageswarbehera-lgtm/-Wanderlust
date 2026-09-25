require("dotenv").config();

const defaultLocalDbUrl = "mongodb://127.0.0.1:27017/wanderlust";
const dbUrl = process.env.MONGODB_URI || defaultLocalDbUrl;

if (!process.env.MONGODB_URI) {
  console.warn(
    `MONGODB_URI not found. Falling back to local MongoDB: ${defaultLocalDbUrl}`
  );
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || "0.0.0.0",
  dbUrl,
  sessionSecret: process.env.SESSION_SECRET || "development-session-secret",
  isProduction: process.env.NODE_ENV === "production"
};