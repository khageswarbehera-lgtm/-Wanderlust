module.exports = (err, req, res, next) => {

  let { status = 500, message = "Something went wrong!" } = err;

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

  console.error(err);

  res.status(status).render("error", { status, message });

};
