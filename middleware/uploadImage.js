const multer = require("multer");

const maxFileSize = 5 * 1024 * 1024;
const supportedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

const hasSignature = (buffer, mimeType) => {
  if (!Buffer.isBuffer(buffer)) return false;
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/gif":
      return buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6));
    case "image/webp":
      return buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP";
    default:
      return false;
  }
};

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1,
    fields: 10,
    parts: 11
  },
  fileFilter: (req, file, callback) => {
    if (!supportedMimeTypes.has(file.mimetype)) {
      const error = new Error("Unsupported image format. Use JPEG, PNG, GIF, or WebP.");
      error.code = "UNSUPPORTED_IMAGE_TYPE";
      return callback(error);
    }

    callback(null, true);
  }
}).single("image");

const getUploadErrorMessage = (error) => {
  if (error.code === "LIMIT_FILE_SIZE") return "Image must be 5 MB or smaller.";
  if (error.code === "LIMIT_UNEXPECTED_FILE") return "Upload one image using the image field.";
  if (error.code === "UNSUPPORTED_IMAGE_TYPE") return error.message;
  return "Could not process image upload.";
};

module.exports = (req, res, next) => {
  const isListingImageRequest =
    (req.method === "POST" && req.path === "/") ||
    (req.method === "PUT" && /^\/[a-f\d]{24}\/?$/i.test(req.path));

  if (!isListingImageRequest || !req.is("multipart/form-data")) {
    return next();
  }

  uploadImage(req, res, (error) => {
    if (error) {
      req.uploadError = getUploadErrorMessage(error);
      return next();
    }

    if (req.file && !hasSignature(req.file.buffer, req.file.mimetype)) {
      req.uploadError = "The uploaded file is not a supported image.";
      req.file = undefined;
      return next();
    }

    if (req.file) req.file.imageMimeType = req.file.mimetype;
    next();
  });
};
