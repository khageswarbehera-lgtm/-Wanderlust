const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }

  res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
};

module.exports = requireAuth;
