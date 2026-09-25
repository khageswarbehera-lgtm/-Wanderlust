const mongoose = require("mongoose");
const { dbUrl } = require("./env");

const connectDatabase = async () => {
  mongoose.set("strictQuery", true);

  await mongoose.connect(dbUrl, {
    serverSelectionTimeoutMS: 5000,
    autoIndex: true
  });

  console.log("Database connected");
};

module.exports = connectDatabase;