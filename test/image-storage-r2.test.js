const test = require("node:test");
const assert = require("node:assert/strict");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const r2Environment = {
  NODE_ENV: "test",
  IMAGE_STORAGE: "r2",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_BUCKET: "wanderlust-images",
  R2_PUBLIC_URL: "https://images.example.test/listings/",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key"
};
const previousEnvironment = Object.fromEntries(
  Object.keys(r2Environment).map((key) => [key, process.env[key]])
);

Object.assign(process.env, r2Environment);

const commands = [];
const clientConfigurations = [];
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = async function (command) {
  commands.push(command);
  const endpoint = await this.config.endpoint();
  clientConfigurations.push({
    endpoint: `${endpoint.protocol}//${endpoint.hostname}`,
    region: await this.config.region()
  });
  return {};
};

const imageStorage = require("../services/imageStorage");
const { imageStorageEndpoint, imageStorageRegion } = require("../config/env");

test.after(() => {
  S3Client.prototype.send = originalSend;
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("R2 image storage uploads bytes, returns a public URL, and deletes owned objects", async () => {
  assert.equal(imageStorageEndpoint, "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
  assert.equal(imageStorageRegion, "auto");

  const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const publicUrl = await imageStorage.store({
    buffer: imageBytes,
    imageMimeType: "image/png"
  });
  assert.match(publicUrl, /^https:\/\/images\.example\.test\/listings\/[a-f\d-]+\.png$/i);

  const uploadCommand = commands.at(-1);
  assert.ok(uploadCommand instanceof PutObjectCommand);
  assert.equal(uploadCommand.input.Bucket, "wanderlust-images");
  assert.match(uploadCommand.input.Key, /^[a-f\d-]+\.png$/i);
  assert.equal(uploadCommand.input.Body, imageBytes);
  assert.equal(uploadCommand.input.ContentType, "image/png");
  assert.deepEqual(clientConfigurations.at(-1), {
    endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    region: "auto"
  });

  await imageStorage.remove(publicUrl);
  const deleteCommand = commands.at(-1);
  assert.ok(deleteCommand instanceof DeleteObjectCommand);
  assert.equal(deleteCommand.input.Bucket, "wanderlust-images");
  assert.equal(deleteCommand.input.Key, uploadCommand.input.Key);

  const commandCount = commands.length;
  await imageStorage.remove("https://unrelated.example.test/listings/image.png");
  assert.equal(commands.length, commandCount);
});

test("listing image replacement and deletion use the R2 storage adapter", async (t) => {
  const Listing = require("../models/listing");
  const listingController = require("../controllers/listingController");
  const originalMethods = {
    findOne: Listing.findOne,
    findOneAndUpdate: Listing.findOneAndUpdate,
    findOneAndDelete: Listing.findOneAndDelete
  };
  const listingId = "0123456789abcdef01234567";
  const oldKey = "123e4567-e89b-42d3-a456-426614174000.png";
  const existingListing = {
    _id: listingId,
    owner: "owner-id",
    title: "Old title",
    description: "A listing",
    price: 100,
    image: `https://images.example.test/listings/${oldKey}`,
    location: "Town",
    country: "Country"
  };
  let savedListing;
  Listing.findOne = async () => existingListing;
  Listing.findOneAndUpdate = async (filter, data) => {
    savedListing = { ...existingListing, ...data };
    return savedListing;
  };
  Listing.findOneAndDelete = async () => savedListing;

  t.after(() => {
    Object.assign(Listing, originalMethods);
  });

  commands.length = 0;
  clientConfigurations.length = 0;
  const redirects = [];
  const response = { redirect: (url) => redirects.push(url) };
  await listingController.update({
    params: { id: listingId },
    session: { userId: "owner-id" },
    body: {
      title: "Updated title",
      description: "A listing",
      price: "100",
      location: "Town",
      country: "Country"
    },
    file: {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      imageMimeType: "image/png"
    }
  }, response);

  assert.equal(redirects[0], `/listings/${listingId}`);
  assert.match(savedListing.image, /^https:\/\/images\.example\.test\/listings\/[a-f\d-]+\.png$/i);
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, oldKey);

  await listingController.destroy({
    params: { id: listingId },
    session: { userId: "owner-id" }
  }, response);

  assert.equal(redirects[1], "/listings");
  assert.ok(commands[2] instanceof DeleteObjectCommand);
  assert.equal(commands[2].input.Key, savedListing.image.split("/").at(-1));
});
