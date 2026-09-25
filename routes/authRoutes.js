const express = require("express");
const asyncWrap = require("../middleware/asyncWrap");
const authController = require("../controllers/authController");

const router = express.Router();

router.get("/signup", authController.signupForm);
router.post("/signup", asyncWrap(authController.signup));
router.get("/login", authController.loginForm);
router.post("/login", asyncWrap(authController.login));
router.post("/logout", authController.logout);

router.get("/health",(req,res)=>{
  res.status(200).json({
    status:"success",
    message:"Server is up and running"
  })
})

module.exports = router;
