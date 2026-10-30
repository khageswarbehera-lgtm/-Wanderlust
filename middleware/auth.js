const User = require("../models/user");

const requireAuth = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  }

  const user = await User.findById(req.session.userId).select("authVersion");
  if (user && (req.session.authVersion ?? 0) === user.authVersion) {
    return next();
  }

  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid", { path: "/" });
    res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
  });
};

module.exports = requireAuth;
