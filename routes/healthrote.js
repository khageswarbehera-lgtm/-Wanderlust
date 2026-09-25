const express = require("express");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is up and running"
  });
});

module.exports = router;
