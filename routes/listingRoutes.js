const express = require("express");

const router = express.Router();

const listingController = require("../controllers/listingController");
const reviewRoutes = require("./reviewRoutes");
const asyncWrap = require("../middleware/asyncWrap");
const requireAuth = require("../middleware/auth");


// ================= LISTINGS =================

// GET /listings
router.get(
  "/",
  asyncWrap(listingController.index)
);


// GET /listings/new
router.get(
  "/new",
  requireAuth,
  listingController.newForm
);


// POST /listings
router.post(
  "/",
  requireAuth,
  asyncWrap(listingController.create)
);

// POST /listings/:id/reviews
router.use("/:id/reviews", reviewRoutes);


// GET /listings/:id
router.get(
  "/:id",
  asyncWrap(listingController.show)
);


// GET /listings/:id/edit
router.get(
  "/:id/edit",
  requireAuth,
  asyncWrap(listingController.editForm)
);


// PUT /listings/:id
router.put(
  "/:id",
  requireAuth,
  asyncWrap(listingController.update)
);


// DELETE /listings/:id
router.delete(
  "/:id",
  requireAuth,
  asyncWrap(listingController.destroy)
);


module.exports = router;
