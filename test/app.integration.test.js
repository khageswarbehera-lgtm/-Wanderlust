const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");

const assertStatus = (response, expected) =>
  assert.equal(response.status, expected, `Unexpected HTTP status for ${response.url}`);

class TestClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookie = "";
  }

  async request(route, { method = "GET", body, headers = {}, redirect = "manual" } = {}) {
    const response = await fetch(`${this.baseUrl}${route}`, {
      method,
      body,
      redirect,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers
      }
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return response;
  }

  postForm(route, fields) {
    return this.request(route, {
      method: "POST",
      body: new URLSearchParams(fields)
    });
  }
}

const createListingForm = ({
  title = "Test cabin",
  description = "Quiet place",
  price = "125",
  location = "Test town",
  country = "Testland",
  image
} = {}) => {
  const form = new FormData();
  form.set("title", title);
  form.set("description", description);
  form.set("price", price);
  form.set("location", location);
  form.set("country", country);
  if (image) form.set("image", image);
  return form;
};

const validPng = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00
]);

test("HTTP integration: authentication, listing CRUD, reviews, authorization, validation, and uploads", async (t) => {
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    MONGODB_URI: process.env.MONGODB_URI,
    IMAGE_STORAGE: process.env.IMAGE_STORAGE,
    IMAGE_UPLOAD_DIRECTORY: process.env.IMAGE_UPLOAD_DIRECTORY,
    SESSION_SECRET: process.env.SESSION_SECRET
  };
  const dbName = `wanderlust_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const mongoServer = await MongoMemoryServer.create({ instance: { dbName } });
  const testMongoUri = mongoServer.getUri(dbName);
  const parsedTestUri = new URL(testMongoUri);

  assert.notEqual(testMongoUri, originalEnvironment.MONGODB_URI);
  assert.equal(parsedTestUri.pathname.slice(1), dbName);
  assert.match(dbName, /^wanderlust_test_[a-f\d]{32}$/);
  assert.ok(["127.0.0.1", "localhost"].includes(parsedTestUri.hostname));

  const uploadDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "wanderlust-test-uploads-"));
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = testMongoUri;
  process.env.IMAGE_STORAGE = "local";
  process.env.IMAGE_UPLOAD_DIRECTORY = uploadDirectory;
  process.env.SESSION_SECRET = `test-session-${crypto.randomUUID()}`;

  let server;
  let mongoose;
  const originalConsoleError = console.error;
  const emailServicePath = require.resolve("../services/email");
  t.after(async () => {
    console.error = originalConsoleError;
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
    if (mongoose?.connection.readyState) await mongoose.disconnect();
    await mongoServer.stop();
    await fs.rm(uploadDirectory, { recursive: true, force: true });
    delete require.cache[emailServicePath];
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  console.error = (message, details, ...rest) => {
    if (message === "Request failed" && details?.status < 500) return;
    originalConsoleError(message, details, ...rest);
  };

  const sentCodes = [];
  require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
      isMailConfigured: true,
      async sendCodeEmail(email, code, purpose) {
        sentCodes.push({ email, code, purpose });
      }
    }
  };

  mongoose = require("mongoose");
  const app = require("../app");
  const { MongoStore } = require("connect-mongo");
  const { initializeAuthRateLimits } = require("../middleware/authRateLimit");
  await mongoose.connect(testMongoUri, { serverSelectionTimeoutMS: 5000 });
  assert.equal(mongoose.connection.name, dbName);
  await initializeAuthRateLimits();
  app.configureSessionStore(MongoStore.create({
    client: mongoose.connection.getClient(),
    dbName,
    collectionName: "sessions",
    ttl: 7 * 24 * 60 * 60
  }));
  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve) => server.once("listening", resolve));

  let owner = new TestClient(`http://127.0.0.1:${server.address().port}`);
  const reviewer = new TestClient(owner.baseUrl);
  const outsider = new TestClient(owner.baseUrl);

  const blockedSignup = await new TestClient(owner.baseUrl).request("/signup", {
    method: "POST",
    body: new URLSearchParams({
      username: "blocked-user",
      email: "blocked@example.test",
      password: "test-password-123"
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://attacker.example"
    }
  });
  assertStatus(blockedSignup, 403);
  assert.equal(await require("../models/user").countDocuments(), 0);

  const signupAndVerify = async (client, username, email) => {
    const signup = await client.postForm("/signup", {
      username,
      email,
      password: "test-password-123"
    });
    assertStatus(signup, 200);
    assert.match(signup.headers.get("set-cookie"), /SameSite=Lax/i);
    assert.match(await signup.text(), /Verify your email/);
    const code = sentCodes.at(-1);
    assert.equal(code.email, email);
    assert.equal(code.purpose, "verification");

    const verify = await client.postForm("/verify-email", { code: code.code });
    assertStatus(verify, 302);
    assert.equal(verify.headers.get("location"), "/listings");
  };

  await signupAndVerify(owner, "listing-owner", "owner@example.test");
  assert.ok(await mongoose.connection.collection("sessions").countDocuments() > 0);
  await signupAndVerify(reviewer, "listing-reviewer", "reviewer@example.test");
  await signupAndVerify(outsider, "listing-outsider", "outsider@example.test");

  const User = require("../models/user");
  const Listing = require("../models/listing");
  const Review = require("../models/review");
  assert.equal(await User.countDocuments(), 3);

  const unauthenticated = new TestClient(owner.baseUrl);
  const invalidLogin = await unauthenticated.postForm("/login", {
    email: "owner@example.test",
    password: "incorrect-password"
  });
  assertStatus(invalidLogin, 400);
  assert.match(await invalidLogin.text(), /Invalid credentials/);

  const loginClient = new TestClient(owner.baseUrl);
  const login = await loginClient.postForm("/login", {
    email: "OWNER@example.test",
    password: "test-password-123",
    returnTo: "//attacker.example"
  });
  assertStatus(login, 302);
  assert.equal(login.headers.get("location"), "/listings");
  assert.ok(loginClient.cookie);

  const unknownAccountRecovery = await unauthenticated.postForm("/forgot-password", {
    email: "missing@example.test"
  });
  assertStatus(unknownAccountRecovery, 200);
  assert.match(await unknownAccountRecovery.text(), /If an account exists/);

  const recoveryRequest = await owner.postForm("/forgot-password", {
    email: "owner@example.test"
  });
  assertStatus(recoveryRequest, 200);
  assert.match(await recoveryRequest.text(), /If an account exists/);
  const resetCode = sentCodes.at(-1);
  assert.equal(resetCode.purpose, "password-reset");
  let ownerUser = await User.findOne({ email: "owner@example.test" });
  assert.notEqual(ownerUser.passwordResetCodeHash, resetCode.code);
  assert.ok(ownerUser.passwordResetExpires > new Date());

  const badRecoveryCode = await owner.postForm("/reset-password", {
    email: "owner@example.test",
    code: "000000",
    password: "replacement-password-123"
  });
  assertStatus(badRecoveryCode, 400);
  ownerUser = await User.findById(ownerUser._id);
  assert.equal(ownerUser.passwordResetAttempts, 1);

  const resetPassword = await owner.postForm("/reset-password", {
    email: "owner@example.test",
    code: resetCode.code,
    password: "replacement-password-123"
  });
  assertStatus(resetPassword, 200);
  assert.match(await resetPassword.text(), /Password updated/);
  ownerUser = await User.findById(ownerUser._id);
  assert.equal(ownerUser.passwordResetCodeHash, undefined);
  assert.equal(ownerUser.passwordResetExpires, undefined);
  assert.equal(ownerUser.authVersion, 1);

  const replayResetCode = await owner.postForm("/reset-password", {
    email: "owner@example.test",
    code: resetCode.code,
    password: "replayed-password-123"
  });
  assertStatus(replayResetCode, 400);
  assert.equal(await bcrypt.compare("replayed-password-123", ownerUser.password), false);

  const expiredRecoveryRequest = await reviewer.postForm("/forgot-password", {
    email: "reviewer@example.test"
  });
  assertStatus(expiredRecoveryRequest, 200);
  const expiredResetCode = sentCodes.at(-1);
  const reviewerUser = await User.findOne({ email: "reviewer@example.test" });
  reviewerUser.passwordResetExpires = new Date(Date.now() - 1);
  await reviewerUser.save();
  const expiredReset = await reviewer.postForm("/reset-password", {
    email: "reviewer@example.test",
    code: expiredResetCode.code,
    password: "expired-reset-password"
  });
  assertStatus(expiredReset, 400);

  const passwordLoginClient = new TestClient(owner.baseUrl);
  const newPasswordLogin = await passwordLoginClient.postForm("/login", {
    email: "owner@example.test",
    password: "replacement-password-123"
  });
  assertStatus(newPasswordLogin, 302);
  assert.equal(newPasswordLogin.headers.get("location"), "/listings");

  for (const staleClient of [owner, loginClient]) {
    const staleSessionRequest = await staleClient.request("/listings/new");
    assertStatus(staleSessionRequest, 302);
    assert.match(staleSessionRequest.headers.get("location"), /^\/login\?/);
  }
  owner = passwordLoginClient;

  const pendingClient = new TestClient(owner.baseUrl);
  const pendingSignup = await pendingClient.postForm("/signup", {
    username: "pending-verification",
    email: "pending@example.test",
    password: "pending-test-password"
  });
  assertStatus(pendingSignup, 200);
  const pendingCode = sentCodes.at(-1).code;
  const pendingUser = await User.findOne({ email: "pending@example.test" });
  pendingUser.emailVerificationExpires = new Date(Date.now() - 1);
  await pendingUser.save();
  const expiredVerification = await pendingClient.postForm("/verify-email", { code: pendingCode });
  assertStatus(expiredVerification, 400);
  assert.equal((await User.findById(pendingUser._id)).emailVerified, false);
  const restartedSignup = await pendingClient.postForm("/signup", {
    username: "pending-verification",
    email: "pending@example.test",
    password: "replacement-pending-password"
  });
  assertStatus(restartedSignup, 200);
  assert.match(await restartedSignup.text(), /A new verification code was sent/);
  const restartedCode = sentCodes.at(-1).code;
  assert.notEqual(restartedCode, pendingCode);
  const updatedPendingUser = await User.findById(pendingUser._id);
  assert.ok(await bcrypt.compare("replacement-pending-password", updatedPendingUser.password));

  const oldPendingCode = await pendingClient.postForm("/verify-email", { code: pendingCode });
  assertStatus(oldPendingCode, 400);
  const completedRestart = await pendingClient.postForm("/verify-email", { code: restartedCode });
  assertStatus(completedRestart, 302);
  assert.equal((await User.findById(pendingUser._id)).emailVerified, true);

  const anonymousCreate = await unauthenticated.request("/listings", {
    method: "POST",
    body: createListingForm({ image: new Blob([validPng], { type: "image/png" }) })
  });
  assertStatus(anonymousCreate, 302);
  assert.match(anonymousCreate.headers.get("location"), /^\/login\?/);
  assert.deepEqual(await fs.readdir(uploadDirectory), []);

  const createListing = await owner.request("/listings", {
    method: "POST",
    body: createListingForm({
      image: new Blob([validPng], { type: "image/png" })
    })
  });
  assertStatus(createListing, 302);
  const listingUrl = createListing.headers.get("location");
  assert.match(listingUrl, /^\/listings\/[a-f\d]{24}$/i);
  const listingId = listingUrl.split("/").at(-1);
  let listing = await Listing.findById(listingId);
  assert.ok(listing);
  assert.equal(listing.owner.toString(), (await User.findOne({ username: "listing-owner" }))._id.toString());
  assert.match(listing.image, /^\/uploads\/[a-f\d-]+\.png$/i);
  assert.deepEqual(await fs.readdir(uploadDirectory), [listing.image.slice("/uploads/".length)]);

  const listingIndex = await owner.request("/listings");
  assertStatus(listingIndex, 200);
  assert.match(await listingIndex.text(), /Test cabin/);
  const listingShow = await owner.request(listingUrl);
  assertStatus(listingShow, 200);
  assert.match(await listingShow.text(), /Quiet place/);

  const ownerEditPage = await owner.request(`${listingUrl}/edit`);
  assertStatus(ownerEditPage, 200);
  const outsiderEditPage = await outsider.request(`${listingUrl}/edit`);
  assertStatus(outsiderEditPage, 403);

  const outsiderUpdate = await outsider.request(`${listingUrl}?_method=PUT`, {
    method: "POST",
    body: createListingForm({ title: "Unauthorized update" })
  });
  assertStatus(outsiderUpdate, 403);
  assert.equal((await Listing.findById(listingId)).title, "Test cabin");

  const invalidListing = await owner.request("/listings", {
    method: "POST",
    body: createListingForm({
      title: "",
      price: "-1",
      image: new Blob([validPng], { type: "image/png" })
    })
  });
  assertStatus(invalidListing, 400);
  assert.match(await invalidListing.text(), /Title is required/);
  assert.equal(await Listing.countDocuments(), 1);
  assert.deepEqual(await fs.readdir(uploadDirectory), [listing.image.slice("/uploads/".length)]);

  const forgedImage = await owner.request("/listings", {
    method: "POST",
    body: createListingForm({
      image: new Blob(["not a PNG"], { type: "image/png" })
    })
  });
  assertStatus(forgedImage, 400);
  assert.match(await forgedImage.text(), /not a supported image/);
  assert.equal(await Listing.countDocuments(), 1);

  const unsupportedImage = await owner.request("/listings", {
    method: "POST",
    body: createListingForm({
      image: new Blob(["svg"], { type: "image/svg+xml" })
    })
  });
  assertStatus(unsupportedImage, 400);
  assert.match(await unsupportedImage.text(), /Unsupported image format/);

  const oversizedImage = await owner.request("/listings", {
    method: "POST",
    body: createListingForm({
      image: new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: "image/png" })
    })
  });
  assertStatus(oversizedImage, 400);
  assert.match(await oversizedImage.text(), /5 MB or smaller/);

  const anonymousReview = await unauthenticated.postForm(`${listingUrl}/reviews`, {
    "review[rating]": "5",
    "review[comment]": "Anonymous review"
  });
  assertStatus(anonymousReview, 302);
  assert.match(anonymousReview.headers.get("location"), /^\/login\?/);

  const invalidReview = await reviewer.postForm(`${listingUrl}/reviews`, {
    "review[rating]": "8",
    "review[comment]": ""
  });
  assertStatus(invalidReview, 400);
  assert.equal(await Review.countDocuments(), 0);

  const createReview = await reviewer.postForm(`${listingUrl}/reviews`, {
    "review[rating]": "5",
    "review[comment]": "Lovely, quiet stay"
  });
  assertStatus(createReview, 302);
  assert.equal(createReview.headers.get("location"), listingUrl);
  const review = await Review.findOne({ comment: "Lovely, quiet stay" });
  assert.ok(review);
  assert.equal(review.owner.toString(), (await User.findOne({ username: "listing-reviewer" }))._id.toString());
  listing = await Listing.findById(listingId);
  assert.ok(listing.reviews.some((id) => id.equals(review._id)));

  const reviewId = review._id.toString();
  const outsiderReviewUpdate = await outsider.request(`${listingUrl}/reviews/${reviewId}?_method=PUT`, {
    method: "POST",
    body: new URLSearchParams({
      "review[rating]": "1",
      "review[comment]": "Unauthorized"
    })
  });
  assertStatus(outsiderReviewUpdate, 403);
  assert.equal((await Review.findById(reviewId)).rating, 5);

  const validReviewUpdate = await reviewer.request(`${listingUrl}/reviews/${reviewId}?_method=PUT`, {
    method: "POST",
    body: new URLSearchParams({
      "review[rating]": "4",
      "review[comment]": "Updated review"
    })
  });
  assertStatus(validReviewUpdate, 302);
  assert.equal((await Review.findById(reviewId)).comment, "Updated review");

  const invalidReviewUpdate = await reviewer.request(`${listingUrl}/reviews/${reviewId}?_method=PUT`, {
    method: "POST",
    body: new URLSearchParams({
      "review[rating]": "0",
      "review[comment]": ""
    })
  });
  assertStatus(invalidReviewUpdate, 400);
  assert.equal((await Review.findById(reviewId)).rating, 4);

  const outsiderReviewDelete = await outsider.request(`${listingUrl}/reviews/${reviewId}?_method=DELETE`, {
    method: "POST"
  });
  assertStatus(outsiderReviewDelete, 403);
  assert.ok(await Review.findById(reviewId));

  const validReviewDelete = await reviewer.request(`${listingUrl}/reviews/${reviewId}?_method=DELETE`, {
    method: "POST"
  });
  assertStatus(validReviewDelete, 302);
  assert.equal(await Review.findById(reviewId), null);
  assert.equal((await Listing.findById(listingId)).reviews.length, 0);

  const cascadeReview = await reviewer.postForm(`${listingUrl}/reviews`, {
    "review[rating]": "3",
    "review[comment]": "Removed with listing"
  });
  assertStatus(cascadeReview, 302);
  assert.equal(await Review.countDocuments(), 1);

  const updateListing = await owner.request(`${listingUrl}?_method=PUT`, {
    method: "POST",
    body: createListingForm({ title: "Updated cabin", image: undefined })
  });
  assertStatus(updateListing, 302);
  listing = await Listing.findById(listingId);
  assert.equal(listing.title, "Updated cabin");
  assert.deepEqual(await fs.readdir(uploadDirectory), [listing.image.slice("/uploads/".length)]);

  const oldImage = listing.image;
  const replacementImage = Buffer.from(validPng);
  replacementImage[11] = 0x01;
  const replacedListing = await owner.request(`${listingUrl}?_method=PUT`, {
    method: "POST",
    body: createListingForm({
      title: "Updated cabin",
      image: new Blob([replacementImage], { type: "image/png" })
    })
  });
  assertStatus(replacedListing, 302);
  listing = await Listing.findById(listingId);
  assert.notEqual(listing.image, oldImage);
  assert.deepEqual(await fs.readdir(uploadDirectory), [listing.image.slice("/uploads/".length)]);

  const invalidUpdate = await owner.request(`${listingUrl}?_method=PUT`, {
    method: "POST",
    body: createListingForm({ price: "-2" })
  });
  assertStatus(invalidUpdate, 400);
  assert.equal((await Listing.findById(listingId)).price, 125);

  const invalidId = await owner.request("/listings/not-an-object-id");
  assertStatus(invalidId, 400);

  const outsiderDelete = await outsider.request(`${listingUrl}?_method=DELETE`, {
    method: "POST"
  });
  assertStatus(outsiderDelete, 403);
  assert.ok(await Listing.findById(listingId));

  const deleteListing = await owner.request(`${listingUrl}?_method=DELETE`, {
    method: "POST"
  });
  assertStatus(deleteListing, 302);
  assert.equal(await Listing.findById(listingId), null);
  assert.equal(await Review.countDocuments(), 0);
  assert.deepEqual(await fs.readdir(uploadDirectory), []);

  const logout = await owner.postForm("/logout", {});
  assertStatus(logout, 302);
  assert.equal(logout.headers.get("location"), "/listings");
  const afterLogout = await owner.request("/listings/new");
  assertStatus(afterLogout, 302);
  assert.match(afterLogout.headers.get("location"), /^\/login\?/);

  for (let attempt = 0; attempt < 7; attempt++) {
    const failedLogin = await unauthenticated.postForm("/login", {
      email: `missing-${attempt}@example.test`,
      password: "not-a-valid-password"
    });
    assertStatus(failedLogin, 400);
  }
  const limitedLoginClient = new TestClient(owner.baseUrl);
  const limitedLogin = await limitedLoginClient.postForm("/login", {
    email: "missing-final@example.test",
    password: "not-a-valid-password"
  });
  assertStatus(limitedLogin, 429);
  assert.ok(Number(limitedLogin.headers.get("retry-after")) > 0);
  assert.match(await limitedLogin.text(), /Too many attempts/);
  const rateLimitRecords = await mongoose.connection.collection("auth_rate_limits")
    .find({}).toArray();
  assert.ok(rateLimitRecords.length > 0);
  assert.ok(rateLimitRecords.every((record) => /^[a-f\d]{64}$/i.test(record._id)));
});
