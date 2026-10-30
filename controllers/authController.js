const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Joi = require("joi");
const User = require("../models/user");
const { isMailConfigured, sendCodeEmail } = require("../services/email");

const renderSignup = (res, values = {}, error = "") =>
  res.status(error ? 400 : 200).render("auth/signup", { values, error });

const renderLogin = (res, values = {}, error = "", message = "") =>
  res.status(error ? 400 : 200).render("auth/login", { values, error, message });

const normalizeEmail = (email) => typeof email === "string" ? email.trim().toLowerCase() : "";
const isValidEmail = (email) => !Joi.string().email({ tlds: { allow: false } }).validate(email).error;
const createCode = () => crypto.randomInt(100000, 1000000).toString();
const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");
const matchesCodeHash = (storedHash, code) => {
  const expectedHash = Buffer.from(storedHash || "", "hex");
  const providedHash = Buffer.from(hashCode(code), "hex");
  return expectedHash.length === providedHash.length &&
    crypto.timingSafeEqual(expectedHash, providedHash);
};
const codeExpiresAt = () => new Date(Date.now() + 10 * 60 * 1000);

class EmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed.");
    this.name = "EmailDeliveryError";
  }
}

const logEmailDeliveryFailure = (purpose) =>
  console.error(`Email delivery failed for ${purpose}.`);

const renderVerification = (res, email, error = "", message = "") =>
  res.status(error ? 400 : 200).render("auth/verify-email", { email, error, message });

const renderForgotPassword = (res, values = {}, error = "") =>
  res.status(error ? 400 : 200).render("auth/forgot-password", { values, error });

const renderResetPassword = (res, values = {}, error = "", message = "") =>
  res.status(error ? 400 : 200).render("auth/reset-password", { values, error, message });

const startVerificationSession = (req, user, res, next, message) => {
  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.pendingVerificationUserId = user._id.toString();
    return renderVerification(res, user.email, "", message);
  });
};

const sendVerificationCode = async (user) => {
  const code = createCode();
  const codeHash = hashCode(code);
  const update = await User.updateOne(
    { _id: user._id, emailVerified: { $ne: true } },
    {
      $set: {
        emailVerificationCodeHash: codeHash,
        emailVerificationExpires: codeExpiresAt(),
        emailVerificationAttempts: 0
      }
    }
  );
  if (!update.matchedCount) throw new Error("Email verification is no longer available.");

  try {
    await sendCodeEmail(user.email, code, "verification");
  } catch (error) {
    await User.updateOne(
      { _id: user._id, emailVerificationCodeHash: codeHash },
      {
        $unset: {
          emailVerificationCodeHash: 1,
          emailVerificationExpires: 1
        },
        $set: { emailVerificationAttempts: 0 }
      }
    );
    throw new EmailDeliveryError();
  }
};

const sendPasswordResetCode = async (user) => {
  const code = createCode();
  const codeHash = hashCode(code);
  const update = await User.updateOne(
    { _id: user._id, emailVerified: true },
    {
      $set: {
        passwordResetCodeHash: codeHash,
        passwordResetExpires: codeExpiresAt(),
        passwordResetAttempts: 0
      }
    }
  );
  if (!update.matchedCount) throw new Error("Password recovery is no longer available.");

  try {
    await sendCodeEmail(user.email, code, "password-reset");
  } catch (error) {
    await User.updateOne(
      { _id: user._id, passwordResetCodeHash: codeHash },
      {
        $unset: {
          passwordResetCodeHash: 1,
          passwordResetExpires: 1
        },
        $set: { passwordResetAttempts: 0 }
      }
    );
    throw new EmailDeliveryError();
  }
};

module.exports.signupForm = (req, res) => {
  renderSignup(res);
};

module.exports.signup = async (req, res, next) => {
  const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  const values = { username, email };

  if (!username || !email || typeof password !== "string" || !password) {
    return renderSignup(res, values, "All fields are required.");
  }

  if (!isValidEmail(email)) {
    return renderSignup(res, values, "Enter a valid email address.");
  }

  if (password.length < 8) {
    return renderSignup(res, values, "Password must be at least 8 characters.");
  }

  if (!isMailConfigured) {
    return renderSignup(res, values, "Email verification is temporarily unavailable. Please try again later.");
  }

  const existingEmailUser = await User.findOne({ email });

  if (existingEmailUser) {
    if (existingEmailUser.emailVerified) {
      return renderSignup(res, values, "That email is already in use.");
    }

    const now = new Date();
    const hasActiveCode = existingEmailUser.emailVerificationCodeHash &&
      existingEmailUser.emailVerificationExpires > now &&
      existingEmailUser.emailVerificationAttempts < 5;

    if (hasActiveCode) {
      if (!await bcrypt.compare(password, existingEmailUser.password)) {
        return renderSignup(res, values, "That email is already in use.");
      }

      try {
        await sendVerificationCode(existingEmailUser);
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        logEmailDeliveryFailure("verification", error);
        return renderSignup(res, values, "Could not send a verification code. Please try again.");
      }
      return startVerificationSession(
        req, existingEmailUser, res, next, "A new verification code was sent to your email."
      );
    }

    const usernameOwner = await User.findOne({
      username,
      _id: { $ne: existingEmailUser._id }
    });
    if (usernameOwner) {
      return renderSignup(res, values, "That username is already in use.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let restartedUser;
    try {
      restartedUser = await User.findOneAndUpdate(
        {
          _id: existingEmailUser._id,
          emailVerified: { $ne: true },
          $or: [
            { emailVerificationCodeHash: { $exists: false } },
            { emailVerificationExpires: { $exists: false } },
            { emailVerificationExpires: { $lte: now } },
            { emailVerificationAttempts: { $gte: 5 } }
          ]
        },
        {
          $set: {
            username,
            password: passwordHash,
            emailVerificationAttempts: 0
          },
          $unset: {
            emailVerificationCodeHash: 1,
            emailVerificationExpires: 1,
            passwordResetCodeHash: 1,
            passwordResetExpires: 1
          }
        },
        { returnDocument: "after", runValidators: true }
      );
    } catch (error) {
      if (error.code === 11000) {
        return renderSignup(res, values, "That username is already in use.");
      }
      throw error;
    }

    if (!restartedUser) {
      return renderSignup(res, values, "A verification request is already in progress. Please try again.");
    }

    try {
      await sendVerificationCode(restartedUser);
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      logEmailDeliveryFailure("verification", error);
      return renderSignup(res, values, "Could not send a verification code. Please try again.");
    }
    return startVerificationSession(
      req, restartedUser, res, next, "A new verification code was sent to your email."
    );
  }

  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    return renderSignup(res, values, "That username is already in use.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  try {
    user = await User.create({
      username,
      email,
      password: passwordHash,
      emailVerified: false
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return renderSignup(res, values, field === "username"
        ? "That username is already in use."
        : "That email is already in use.");
    }
    throw error;
  }

  try {
    await sendVerificationCode(user);
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    logEmailDeliveryFailure("verification", error);
    return renderSignup(res, values, "Could not send a verification code. Please try again.");
  }

  return startVerificationSession(req, user, res, next, "A verification code was sent to your email.");
};

module.exports.loginForm = (req, res) => {
  const message = req.query.reset === "1" ? "Your password has been updated." : "";
  renderLogin(res, { returnTo: req.query.returnTo || "" }, "", message);
};

module.exports.login = async (req, res, next) => {
  const { email, password, returnTo } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const user = typeof password === "string" && isValidEmail(normalizedEmail)
    ? await User.findOne({ email: normalizedEmail })
    : null;

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return renderLogin(res, { email, returnTo }, "Invalid credentials.");
  }

  if (!user.emailVerified) {
    return startVerificationSession(
      req, user, res, next, "Verify your email before logging in."
    );
  }

  req.session.regenerate((error) => {
    if (error) return next(error);

    req.session.userId = user._id.toString();
    req.session.username = user.username;
    req.session.authVersion = user.authVersion || 0;
    const safeReturnTo = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/listings";
    res.redirect(safeReturnTo);
  });
};

module.exports.verifyEmailForm = async (req, res) => {
  if (!req.session.pendingVerificationUserId) return res.redirect("/signup");
  const user = await User.findById(req.session.pendingVerificationUserId);
  if (!user) return res.redirect("/signup");
  return renderVerification(res, user.email);
};

module.exports.verifyEmail = async (req, res, next) => {
  const user = req.session.pendingVerificationUserId
    ? await User.findById(req.session.pendingVerificationUserId)
    : null;
  const code = typeof req.body.code === "string" ? req.body.code.trim() : "";

  if (!user || user.emailVerified || !/^\d{6}$/.test(code) ||
      !user.emailVerificationCodeHash || !user.emailVerificationExpires ||
      user.emailVerificationExpires <= new Date() || user.emailVerificationAttempts >= 5) {
    return renderVerification(res, user?.email || "", "Invalid credentials or expired verification code.");
  }

  const now = new Date();
  const codeHash = hashCode(code);
  if (!matchesCodeHash(user.emailVerificationCodeHash, code)) {
    await User.updateOne(
      {
        _id: user._id,
        emailVerificationCodeHash: user.emailVerificationCodeHash,
        emailVerificationExpires: { $gt: now },
        emailVerificationAttempts: { $lt: 5 }
      },
      { $inc: { emailVerificationAttempts: 1 } }
    );
    return renderVerification(res, user.email, "Invalid credentials or expired verification code.");
  }

  const verifiedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerified: { $ne: true },
      emailVerificationCodeHash: codeHash,
      emailVerificationExpires: { $gt: now },
      emailVerificationAttempts: { $lt: 5 }
    },
    {
      $set: { emailVerified: true, emailVerificationAttempts: 0 },
      $unset: { emailVerificationCodeHash: 1, emailVerificationExpires: 1 }
    },
    { returnDocument: "after" }
  );
  if (!verifiedUser) {
    return renderVerification(res, user.email, "Invalid credentials or expired verification code.");
  }

  req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.userId = verifiedUser._id.toString();
    req.session.username = verifiedUser.username;
    req.session.authVersion = verifiedUser.authVersion || 0;
    res.redirect("/listings");
  });
};

module.exports.resendVerificationCode = async (req, res) => {
  const user = req.session.pendingVerificationUserId
    ? await User.findById(req.session.pendingVerificationUserId)
    : null;
  if (!user || user.emailVerified) return res.redirect("/signup");
  if (!isMailConfigured) {
    return renderVerification(res, user.email, "Email verification is temporarily unavailable. Please try again later.");
  }

  try {
    await sendVerificationCode(user);
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) throw error;
    logEmailDeliveryFailure("verification", error);
    return renderVerification(res, user.email, "Could not send a verification code. Please try again.");
  }
  return renderVerification(res, user.email, "", "A new verification code was sent to your email.");
};

module.exports.forgotPasswordForm = (req, res) => renderForgotPassword(res);

module.exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isValidEmail(email)) {
    return renderForgotPassword(res, { email }, "Enter a valid email address.");
  }
  if (!isMailConfigured) {
    return renderForgotPassword(res, { email }, "Password recovery is temporarily unavailable. Please try again later.");
  }

  const user = await User.findOne({ email, emailVerified: true });
  if (user) {
    try {
      await sendPasswordResetCode(user);
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      logEmailDeliveryFailure("password reset", error);
    }
  }

  return renderResetPassword(
    res,
    { email },
    "",
    "If an account exists for this email, a recovery code has been sent."
  );
};

module.exports.resetPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
  const { password } = req.body;
  const values = { email };

  if (!isValidEmail(email) || !/^\d{6}$/.test(code) || typeof password !== "string" || password.length < 8) {
    return renderResetPassword(res, values, "Invalid credentials or expired recovery code.");
  }

  const user = await User.findOne({ email, emailVerified: true });
  if (!user || !user.passwordResetCodeHash || !user.passwordResetExpires ||
      user.passwordResetExpires <= new Date() || user.passwordResetAttempts >= 5) {
    return renderResetPassword(res, values, "Invalid credentials or expired recovery code.");
  }

  const now = new Date();
  const codeHash = hashCode(code);
  if (!matchesCodeHash(user.passwordResetCodeHash, code)) {
    await User.updateOne(
      {
        _id: user._id,
        passwordResetCodeHash: user.passwordResetCodeHash,
        passwordResetExpires: { $gt: now },
        passwordResetAttempts: { $lt: 5 }
      },
      { $inc: { passwordResetAttempts: 1 } }
    );
    return renderResetPassword(res, values, "Invalid credentials or expired recovery code.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const resetUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerified: true,
      passwordResetCodeHash: codeHash,
      passwordResetExpires: { $gt: new Date() },
      passwordResetAttempts: { $lt: 5 }
    },
    {
      $set: { password: passwordHash, passwordResetAttempts: 0 },
      $inc: { authVersion: 1 },
      $unset: { passwordResetCodeHash: 1, passwordResetExpires: 1 }
    },
    { returnDocument: "after" }
  );
  if (!resetUser) {
    return renderResetPassword(res, values, "Invalid credentials or expired recovery code.");
  }
  return renderLogin(res, {}, "", `Password updated. Your username is ${resetUser.username}.`);
};

module.exports.logout = (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("connect.sid", { path: "/" });
    res.redirect("/listings");
  });
};
