const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const validationError = new Error(
      error.details.map((detail) => detail.message).join(" ")
    );
    validationError.status = 400;
    return next(validationError);
  }

  req.body = value;
  next();
};

module.exports = validate;