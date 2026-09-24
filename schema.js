const Joi = require("joi");

const listingSchema = Joi.object({
  title: Joi.string().trim().required().messages({ "string.empty": "Title is required.", "any.required": "Title is required." }),
  description: Joi.string().trim().required().messages({ "string.empty": "Description is required.", "any.required": "Description is required." }),
  price: Joi.number().min(0).required().messages({ "number.base": "Price must be a number.", "number.min": "Price cannot be negative.", "any.required": "Price is required." }),
  image: Joi.string().trim().pattern(/^(?:https?:\/\/.+|\/uploads\/.+)/i).optional().messages({ "string.pattern.base": "Image must be an uploaded image." }),
  location: Joi.string().trim().required().messages({ "string.empty": "Location is required.", "any.required": "Location is required." }),
  country: Joi.string().trim().required().messages({ "string.empty": "Country is required.", "any.required": "Country is required." })
});

const reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().integer().min(1).max(5).required().messages({
      "number.base": "Rating must be a number.",
      "number.integer": "Rating must be a whole number.",
      "number.min": "Rating must be between 1 and 5.",
      "number.max": "Rating must be between 1 and 5.",
      "any.required": "Rating is required."
    }),
    comment: Joi.string().trim().min(1).max(1000).required().messages({
      "string.empty": "Review comment is required.",
      "string.max": "Review comment cannot exceed 1000 characters.",
      "any.required": "Review comment is required."
    })
  }).required()
});

module.exports = { listingSchema, reviewSchema };
