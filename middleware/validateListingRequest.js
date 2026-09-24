const validate = require("./validate");
const { listingSchema } = require("../schema");

module.exports = (req, res, next) => {
  if (
    (req.method === "POST" && req.path === "/") ||
    (req.method === "PUT" && /^\/[a-f\d]{24}\/?$/i.test(req.path))
  ) {
    return validate(listingSchema)(req, res, next);
  }

  next();
};