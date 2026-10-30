const express = require("express");
const asyncWrap = require("../middleware/asyncWrap");
const authController = require("../controllers/authController");
const { createAuthRateLimit } = require("../middleware/authRateLimit");

const router = express.Router();

const rateLimits = {
  signup: createAuthRateLimit("signup", 5, 60 * 60 * 1000),
  verifyEmail: createAuthRateLimit("verify-email", 10, 15 * 60 * 1000),
  resendVerification: createAuthRateLimit("resend-verification", 3, 60 * 60 * 1000),
  login: createAuthRateLimit("login", 10, 15 * 60 * 1000),
  forgotPassword: createAuthRateLimit("forgot-password", 5, 60 * 60 * 1000),
  resetPassword: createAuthRateLimit("reset-password", 10, 15 * 60 * 1000),
  logout: createAuthRateLimit("logout", 10, 15 * 60 * 1000)
};

router.get("/signup", authController.signupForm);
router.post("/signup", asyncWrap(rateLimits.signup), asyncWrap(authController.signup));
router.get("/verify-email", asyncWrap(authController.verifyEmailForm));
router.post("/verify-email", asyncWrap(rateLimits.verifyEmail), asyncWrap(authController.verifyEmail));
router.post("/verify-email/resend", asyncWrap(rateLimits.resendVerification), asyncWrap(authController.resendVerificationCode));
router.get("/login", authController.loginForm);
router.post("/login", asyncWrap(rateLimits.login), asyncWrap(authController.login));
router.get("/forgot-password", authController.forgotPasswordForm);
router.post("/forgot-password", asyncWrap(rateLimits.forgotPassword), asyncWrap(authController.forgotPassword));
router.post("/reset-password", asyncWrap(rateLimits.resetPassword), asyncWrap(authController.resetPassword));
router.post("/logout", asyncWrap(rateLimits.logout), authController.logout);

router.get("/health",(req,res)=>{
  res.status(200).json({
    status:"success",
    message:"Server is up and running"
  })
})

module.exports = router;
