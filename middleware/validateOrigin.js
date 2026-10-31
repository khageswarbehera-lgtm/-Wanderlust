const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const parseOrigin = (value) => {
  if (typeof value !== "string" || value !== value.trim()) return null;

  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
};

const firstForwardedValue = (value) => value?.split(",")[0]?.trim();

const getRequestOrigin = (req) => {
  const trustsProxy = Boolean(req.app.get("trust proxy"));
  const protocol = trustsProxy
    ? firstForwardedValue(req.get("x-forwarded-proto")) || req.protocol
    : req.protocol;
  const host = trustsProxy
    ? firstForwardedValue(req.get("x-forwarded-host")) || req.get("host")
    : req.get("host");

  return parseOrigin(`${protocol}://${host}`);
};

const createOriginValidation = ({ isProduction, appOrigin }) =>
  (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const suppliedOrigin = req.get("origin");
    if (!suppliedOrigin) return next();

    const origin = parseOrigin(suppliedOrigin);
    const requestOrigin = getRequestOrigin(req);
    const validOrigin = isProduction
      ? origin === appOrigin && requestOrigin === appOrigin
      : origin !== null && origin === requestOrigin;

    if (validOrigin) return next();

    const error = new Error("Cross-origin request rejected.");
    error.status = 403;
    next(error);
  };

module.exports = { createOriginValidation, parseOrigin };
