const express = require("express");
const router = express.Router({ mergeParams: true });

const reviewController = require("../controllers/reviewController");
const asyncWrap = require("../middleware/asyncWrap");
const requireAuth = require("../middleware/auth");

router.use(requireAuth);

router.post("/", asyncWrap(reviewController.create));
router.put("/:reviewId", asyncWrap(reviewController.update));
router.delete("/:reviewId", asyncWrap(reviewController.destroy));

module.exports = router;
