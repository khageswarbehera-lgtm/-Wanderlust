const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    rating: {
      type: Number,
      required: [true, "Rating is required."],
      min: [1, "Rating must be between 1 and 5."],
      max: [5, "Rating must be between 1 and 5."],
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number."
      }
    },
    comment: {
      type: String,
      required: [true, "Review comment is required."],
      trim: true,
      maxlength: [1000, "Review comment cannot exceed 1000 characters."]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);
