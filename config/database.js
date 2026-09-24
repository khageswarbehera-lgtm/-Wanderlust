const mongoose = require("mongoose");
const { dbUrl } = require("./env");

const connectDatabase = async () => {
  await mongoose.connect(dbUrl);
  console.log("Database connected");
};

module.exports = connectDatabase;