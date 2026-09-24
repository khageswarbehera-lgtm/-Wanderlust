const validate = require("./validate");
const { reviewSchema } = require("../schema");

module.exports = (req, res, next) => {
  if (
    ["POST", "PUT"].includes(req.method) &&
    /^\/[a-f\d]{24}\/reviews(?:\/[a-f\d]{24})?\/?$/i.test(req.path)
  ) {
    return validate(reviewSchema)(req, res, next);
  }

  next();
};