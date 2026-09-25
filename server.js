const app = require("./app");
const connectDatabase = require("./config/database");
const { port, host } = require("./config/env");

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(port, host, () => {
      console.log(`Server running at http://${host}:${port}`);
    });
  } catch (error) {
    console.error("Database connection error:", error);
    process.exitCode = 1;
  }
};

startServer();