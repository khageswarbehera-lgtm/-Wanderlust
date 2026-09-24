const Listing = require("../models/listing");
const Review = require("../models/review");

const forbiddenError = () => {
  const error = new Error("You are not authorized to change this review");
  error.status = 403;
  return error;
};

const getListingReviewOrThrow = async (listingId, reviewId, userId) => {
  const listing = await Listing.findById(listingId);

  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

  const review = await Review.findOne({
    _id: reviewId,
    owner: userId
  });

  const belongsToListing = listing.reviews.some((id) => id.equals(reviewId));
  if (!belongsToListing || !review) {
    throw forbiddenError();
  }

  return { listing, review };
};

module.exports.create = async (req, res) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

  const review = new Review({
    ...req.body.review,
    owner: req.session.userId
  });
  await review.save();

  listing.reviews.push(review._id);
  await listing.save();

  res.redirect(`/listings/${listing._id}`);
};

module.exports.update = async (req, res) => {
  const { listing } = await getListingReviewOrThrow(
    req.params.id,
    req.params.reviewId,
    req.session.userId
  );

  const review = await Review.findOneAndUpdate(
    { _id: req.params.reviewId, owner: req.session.userId },
    req.body.review,
    { new: true, runValidators: true }
  );

  if (!review) {
    const error = new Error("Review not found");
    error.status = 404;
    throw error;
  }

  res.redirect(`/listings/${listing._id}`);
};

module.exports.destroy = async (req, res) => {
  const { listing } = await getListingReviewOrThrow(
    req.params.id,
    req.params.reviewId,
    req.session.userId
  );

  await Review.findOneAndDelete({
    _id: req.params.reviewId,
    owner: req.session.userId
  });
  await Listing.findByIdAndUpdate(listing._id, {
    $pull: { reviews: req.params.reviewId }
  });

  res.redirect(`/listings/${listing._id}`);
};
