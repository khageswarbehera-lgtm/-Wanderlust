const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "..", "public", "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      return callback(null, true);
    }

    callback(new Error("Only image files are allowed."));
  }
}).single("image");

module.exports = (req, res, next) => {
  if (!req.is("multipart/form-data")) {
    return next();
  }

  uploadImage(req, res, (error) => {
    if (error) {
      error.status = 400;
      return next(error);
    }

    if (req.file) {
      req.body.image = `/uploads/${req.file.filename}`;
    }

    next();
  });
};