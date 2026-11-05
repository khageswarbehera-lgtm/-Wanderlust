require("dotenv").config();
const path = require("path");

const defaultLocalDbUrl = "mongodb://127.0.0.1:27017/wanderlust";
const isProduction = process.env.NODE_ENV === "production";
const dbUrl = process.env.MONGODB_URI || defaultLocalDbUrl;
const mailPort = process.env.SMTP_PORT === undefined ? 587 : Number(process.env.SMTP_PORT);
const imageStorageType = process.env.IMAGE_STORAGE || (isProduction ? "s3" : "local");
const imageUploadDirectory = path.resolve(
  process.env.IMAGE_UPLOAD_DIRECTORY || path.join(__dirname, "..", "public", "uploads")
);
const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2Bucket = process.env.R2_BUCKET;
const r2PublicUrl = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const s3Bucket = process.env.S3_BUCKET;
const s3PublicUrl = process.env.S3_PUBLIC_URL?.replace(/\/+$/, "");
const s3Region = process.env.S3_REGION || "us-east-1";
const s3Endpoint = process.env.S3_ENDPOINT;
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const imageStorageBucket = imageStorageType === "r2" ? r2Bucket : s3Bucket;
const imageStoragePublicUrl = imageStorageType === "r2" ? r2PublicUrl : s3PublicUrl;
const imageStorageRegion = imageStorageType === "r2" ? "auto" : s3Region;
const imageStorageEndpoint = imageStorageType === "r2"
  ? (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : undefined)
  : s3Endpoint;
const imageStorageAccessKeyId = imageStorageType === "r2" ? r2AccessKeyId : s3AccessKeyId;
const imageStorageSecretAccessKey = imageStorageType === "r2"
  ? r2SecretAccessKey
  : s3SecretAccessKey;
const smtpSecureValue = process.env.SMTP_SECURE;
const sessionSecret = process.env.SESSION_SECRET || "development-session-secret";
const port = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
const configuredAppOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;

if (!Number.isInteger(mailPort) || mailPort < 1 || mailPort > 65535) {
  throw new Error("SMTP_PORT must be a valid TCP port.");
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

let appOrigin;
try {
  const parsedAppOrigin = new URL(configuredAppOrigin);
  if (
    !["http:", "https:"].includes(parsedAppOrigin.protocol) ||
    parsedAppOrigin.username ||
    parsedAppOrigin.password ||
    parsedAppOrigin.pathname !== "/" ||
    parsedAppOrigin.search ||
    parsedAppOrigin.hash
  ) {
    throw new Error();
  }
  appOrigin = parsedAppOrigin.origin;
} catch {
  throw new Error("APP_ORIGIN must be an HTTP(S) origin without a path, credentials, query, or fragment.");
}

if (isProduction) {
  if (!process.env.APP_ORIGIN) {
    throw new Error("APP_ORIGIN is required in production.");
  }
  if (new URL(appOrigin).protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production.");
  }
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required in production.");
  }
  if (
    Buffer.byteLength(sessionSecret, "utf8") < 32 ||
    new Set(Buffer.from(sessionSecret, "utf8")).size < 16
  ) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes of varied secret data in production.");
  }

  let productionDatabaseUrl;
  try {
    productionDatabaseUrl = new URL(dbUrl);
  } catch {
    throw new Error("MONGODB_URI must be a valid MongoDB connection URL.");
  }

  if (
    !["mongodb:", "mongodb+srv:"].includes(productionDatabaseUrl.protocol) ||
    !productionDatabaseUrl.hostname ||
    !productionDatabaseUrl.pathname.slice(1) ||
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(productionDatabaseUrl.hostname)
  ) {
    throw new Error("MONGODB_URI must target a remote MongoDB database in production.");
  }
}

if (smtpSecureValue !== undefined && !["true", "false"].includes(smtpSecureValue.toLowerCase())) {
  throw new Error("SMTP_SECURE must be either true or false.");
}

const smtpSettingsProvided = [
  process.env.SMTP_HOST,
  process.env.SMTP_PORT,
  process.env.SMTP_SECURE,
  process.env.SMTP_USER,
  process.env.SMTP_PASS,
  process.env.MAIL_FROM
].some(Boolean);

if (
  smtpSettingsProvided &&
  (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS ||
    !(process.env.MAIL_FROM || process.env.SMTP_USER))
) {
  throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured together.");
}

if (!["local", "s3", "r2"].includes(imageStorageType)) {
  throw new Error("IMAGE_STORAGE must be 'local', 's3', or 'r2'.");
}

if (imageStorageType === "s3" || imageStorageType === "r2") {
  if (!imageStorageBucket || !imageStoragePublicUrl) {
    throw new Error(
      imageStorageType === "r2"
        ? "R2_BUCKET and R2_PUBLIC_URL are required when IMAGE_STORAGE=r2."
        : "S3_BUCKET and S3_PUBLIC_URL are required when IMAGE_STORAGE=s3."
    );
  }
  let publicUrl;
  try {
    publicUrl = new URL(imageStoragePublicUrl);
  } catch {
    throw new Error(
      `${imageStorageType === "r2" ? "R2_PUBLIC_URL" : "S3_PUBLIC_URL"} must be a valid HTTP(S) URL.`
    );
  }
  if (
    !["http:", "https:"].includes(publicUrl.protocol) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash
  ) {
    throw new Error(
      `${imageStorageType === "r2" ? "R2_PUBLIC_URL" : "S3_PUBLIC_URL"} must be a valid HTTP(S) base URL without credentials or query values.`
    );
  }
  if (isProduction && publicUrl.protocol !== "https:") {
    throw new Error(
      `${imageStorageType === "r2" ? "R2_PUBLIC_URL" : "S3_PUBLIC_URL"} must use HTTPS in production.`
    );
  }
}

if (imageStorageType === "r2" && (!r2AccountId || !/^[a-f\d]{32}$/i.test(r2AccountId))) {
  throw new Error("R2_ACCOUNT_ID must be a 32-character Cloudflare account ID.");
}

if (imageStorageType === "r2" && (!r2AccessKeyId || !r2SecretAccessKey)) {
  throw new Error("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required when IMAGE_STORAGE=r2.");
}

if (imageStorageType === "s3" && Boolean(s3AccessKeyId) !== Boolean(s3SecretAccessKey)) {
  throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither.");
}

if (!process.env.MONGODB_URI && !isProduction) {
  console.warn("MONGODB_URI not found. Using local MongoDB for development.");
}

module.exports = {
  dbUrl,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: mailPort,
  smtpSecure: smtpSecureValue === undefined ? mailPort === 465 : smtpSecureValue.toLowerCase() === "true",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER,
  imageStorageType,
  imageUploadDirectory,
  imageStorageBucket,
  imageStoragePublicUrl,
  imageStorageRegion,
  imageStorageEndpoint,
  imageStorageAccessKeyId,
  imageStorageSecretAccessKey,
  s3Bucket,
  s3PublicUrl,
  s3Region,
  s3Endpoint,
  s3AccessKeyId,
  s3SecretAccessKey,
  appOrigin,
  sessionSecret,
  isProduction
};