const mongoose = require("mongoose");
const Review = require("./review");


// ================= LISTING SCHEMA =================

const listingSchema = new mongoose.Schema({

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  title: {
    type: String,
    required: true,
    trim: true
  },

  description: {
    type: String,
    required: [true, "Description is required"],
    trim: true
  },

  price: {
    type: Number,
    required: true,
    min: 0
  },

  image: {
    type: String,
    required: [true, "Image URL is required"],
    trim: true,
    validate: {
      validator: (value) => /^(?:https?:\/\/.+|\/uploads\/.+)/i.test(value),
      message: "Image must be a valid URL or uploaded image"
    }
  },

  location: {
    type: String,
    required: true,
    trim: true
  },

  country: {
    type: String,
    required: true,
    trim: true
  },

  reviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review"
    }
  ]

});

listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing?.reviews?.length) {
    await Review.deleteMany({ _id: { $in: listing.reviews } });
  }
});


// ================= MODEL =================

const Listing = mongoose.model("Listing", listingSchema);


// ================= EXPORT =================

module.exports = Listing;
