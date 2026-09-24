const express = require("express");
const session = require("express-session");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");

const listingRoutes = require("./routes/listingRoutes");
const authRoutes = require("./routes/authRoutes");
const errorHandler = require("./middleware/errorHandler");
const { isProduction, sessionSecret } = require("./config/env");
const validateListingRequest = require("./middleware/validateListingRequest");
const validateReviewRequest = require("./middleware/validateReviewRequest");
const uploadImage = require("./middleware/uploadImage");

const app = express();


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

// Support PUT and DELETE
app.use(
  methodOverride("_method")
);

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

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

app.use(
  "/listings",
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
