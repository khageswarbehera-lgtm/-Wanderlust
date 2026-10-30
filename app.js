const express = require("express");
const session = require("express-session");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");

const listingRoutes = require("./routes/listingRoutes");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthrote");

const errorHandler = require("./middleware/errorHandler");
const { isProduction, sessionSecret } = require("./config/env");
const imageStorage = require("./services/imageStorage");
const requireAuth = require("./middleware/auth");
const validateListingRequest = require("./middleware/validateListingRequest");
const validateReviewRequest = require("./middleware/validateReviewRequest");
const uploadImage = require("./middleware/uploadImage");

const app = express();

app.set("trust proxy", isProduction ? 1 : false);

// ================= EJS-MATE =================

app.engine("ejs", ejsMate);

app.set("view engine", "ejs");

app.set(
  "views",
  path.join(__dirname, "views")
);


// ================= MIDDLEWARE =================

// Read form data
app.use(
  express.urlencoded({
    extended: true
  })
);

// Serve public folder
app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

if (imageStorage.isLocal) {
  app.use("/uploads", express.static(imageStorage.imageUploadDirectory));
}

// Support PUT and DELETE
app.use(
  methodOverride("_method")
);

let sessionStore;
let sessionMiddleware;

app.configureSessionStore = (store) => {
  if (sessionMiddleware) {
    throw new Error("The session store cannot be changed after requests begin.");
  }
  if (!store || typeof store.get !== "function" || typeof store.set !== "function") {
    throw new TypeError("A valid Express session store is required.");
  }
  sessionStore = store;
};

app.use((req, res, next) => {
  if (!sessionMiddleware) {
    if (isProduction && !sessionStore) {
      return next(new Error("Persistent session storage is not configured."));
    }

    sessionMiddleware = session({
      ...(sessionStore ? { store: sessionStore } : {}),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: isProduction,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    });
  }

  sessionMiddleware(req, res, next);
});

app.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }

  const origin = req.get("origin");
  if (!origin) return next();

  try {
    const requestOrigin = new URL(`${req.protocol}://${req.get("host")}`).origin;
    if (new URL(origin).origin === requestOrigin) {
      return next();
    }
  } catch {
    // Reject malformed origins below.
  }

  const error = new Error("Cross-origin request rejected.");
  error.status = 403;
  next(error);
});

app.use((req, res, next) => {
  res.locals.currentUser = req.session.userId
    ? { id: req.session.userId, username: req.session.username }
    : null;
  next();
});

// ================= HOME =================

app.get("/", (req, res) => {
  res.redirect("/listings");
});


// ================= ROUTES =================

app.use(authRoutes);
app.use(healthRoutes);

app.use(
  "/listings",
  (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return requireAuth(req, res, next);
    }

    next();
  },
  uploadImage,
  validateListingRequest,
  validateReviewRequest,
  listingRoutes
);


// ================= NOT FOUND & ERRORS =================

app.use((req, res, next) => {

  const error = new Error("Page not found");
  error.status = 404;
  next(error);

});

app.use(errorHandler);


module.exports = app;
