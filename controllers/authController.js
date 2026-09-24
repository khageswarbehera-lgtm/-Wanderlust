const bcrypt = require("bcryptjs");
const User = require("../models/user");

const renderSignup = (res, values = {}, error = "") =>
  res.status(error ? 400 : 200).render("auth/signup", { values, error });

const renderLogin = (res, values = {}, error = "") =>
  res.status(error ? 400 : 200).render("auth/login", { values, error });

module.exports.signupForm = (req, res) => {
  renderSignup(res);
};

module.exports.signup = async (req, res) => {
  const { username, email, password } = req.body;
  const values = { username, email };

  if (!username || !email || !password) {
    return renderSignup(res, values, "All fields are required.");
  }

  if (password.length < 8) {
    return renderSignup(res, values, "Password must be at least 8 characters.");
  }

  const existingUser = await User.findOne({
    $or: [{ username }, { email: email.toLowerCase() }]
  });

  if (existingUser) {
    const field = existingUser.username === username ? "username" : "email";
    return renderSignup(res, values, `That ${field} is already in use.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    email,
    password: passwordHash
  });

  req.session.userId = user._id.toString();
  req.session.username = user.username;
  res.redirect("/listings");
};

module.exports.loginForm = (req, res) => {
  renderLogin(res, { returnTo: req.query.returnTo || "" });
};

module.exports.login = async (req, res, next) => {
  const { email, password, returnTo } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });

  if (!user || !(await bcrypt.compare(password || "", user.password))) {
    return renderLogin(res, { email, returnTo }, "Invalid email or password.");
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/listings";
    res.redirect(safeReturnTo);
  });
};

module.exports.logout = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.redirect("/listings");
  });
};
