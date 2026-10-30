const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const {
  imageStorageType,
  imageUploadDirectory,
  s3Bucket,
  s3PublicUrl,
  s3Region,
  s3Endpoint,
  s3AccessKeyId,
  s3SecretAccessKey
} = require("../config/env");

const extensionByMimeType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp"
};
const localFilenamePattern = /^(?:[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}|\d+-\d+)\.(?:jpg|jpeg|png|gif|webp)$/i;
const generatedFilenamePattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(?:jpg|png|gif|webp)$/i;

const s3Client = imageStorageType === "s3"
  ? new S3Client({
    region: s3Region,
    endpoint: s3Endpoint || undefined,
    forcePathStyle: Boolean(s3Endpoint),
    ...(s3AccessKeyId
      ? { credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey } }
      : {})
  })
  : null;

const getOwnedS3Key = (imageUrl) => {
  try {
    const base = new URL(`${s3PublicUrl}/`);
    const image = new URL(imageUrl);
    if (image.origin !== base.origin || !image.pathname.startsWith(base.pathname)) return null;
    const key = image.pathname.slice(base.pathname.length);
    return generatedFilenamePattern.test(key) ? key : null;
  } catch {
    return null;
  }
};

const store = async (file) => {
  const extension = extensionByMimeType[file.imageMimeType];
  if (!extension || !Buffer.isBuffer(file.buffer)) {
    throw new Error("Cannot store an unvalidated image upload.");
  }

  const key = `${crypto.randomUUID()}.${extension}`;
  if (imageStorageType === "s3") {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.imageMimeType,
      CacheControl: "public, max-age=31536000, immutable"
    }));
    return `${s3PublicUrl}/${key}`;
  }

  await fs.mkdir(imageUploadDirectory, { recursive: true });
  await fs.writeFile(path.join(imageUploadDirectory, key), file.buffer, { flag: "wx" });
  return `/uploads/${key}`;
};

const remove = async (imageUrl) => {
  if (imageStorageType === "s3") {
    const key = getOwnedS3Key(imageUrl);
    if (!key) return;
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
    return;
  }

  if (typeof imageUrl !== "string" || !imageUrl.startsWith("/uploads/")) return;
  const filename = imageUrl.slice("/uploads/".length);
  if (path.basename(filename) !== filename || !localFilenamePattern.test(filename)) return;
  try {
    await fs.unlink(path.join(imageUploadDirectory, filename));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

module.exports = {
  imageUploadDirectory,
  isLocal: imageStorageType === "local",
  store,
  remove
};
