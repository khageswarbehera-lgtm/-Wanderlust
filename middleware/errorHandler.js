module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  let message = status < 500 && err.message
    ? err.message
    : "Something went wrong!";

  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors)
      .map((error) => error.message)
      .join(", ");
  }

  if (err.name === "CastError") {
    status = 400;
    message = "Invalid listing ID";
  }

  console.error("Request failed", { status });

  res.locals.currentUser = res.locals.currentUser ?? req.user ?? null;
  res.status(status).render("error", { status, message });

};
