const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
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
        ...(["POST", "PUT", "PATCH", "DELETE"].includes(method)
          ? { origin: new URL(this.baseUrl).origin }
          : {}),
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
  const blockedSignupHtml = await blockedSignup.text();
  assert.match(blockedSignupHtml, /Cross-origin request rejected/);
  assert.doesNotMatch(blockedSignupHtml, /currentUser is not defined/);
  assert.equal(await require("../models/user").countDocuments(), 0);

  const originalTrustProxy = app.get("trust proxy");
  app.set("trust proxy", 1);
  let forwardedProxyPost;
  try {
    forwardedProxyPost = await new TestClient(owner.baseUrl).request("/listings", {
      method: "POST",
      body: new URLSearchParams(),
      headers: {
        origin: "https://wonderlust-oijv.onrender.com",
        "x-forwarded-host": "wonderlust-oijv.onrender.com",
        "x-forwarded-proto": "https"
      }
    });
  } finally {
    app.set("trust proxy", originalTrustProxy);
  }
  assertStatus(forwardedProxyPost, 302);
  assert.match(forwardedProxyPost.headers.get("location"), /^\/login\?/);

  const deceptiveOrigin = await new TestClient(owner.baseUrl).request("/signup", {
    method: "POST",
    body: new URLSearchParams({ username: "deceptive", email: "d@example.test", password: "test-password-123" }),
    headers: { origin: "https://wonderlust-oijv.onrender.com.attacker.example" }
  });
  assertStatus(deceptiveOrigin, 403);

  const signupAndSignIn = async (client, username, email) => {
    const sentCodeCount = sentCodes.length;
    const signup = await client.postForm("/signup", {
      username,
      email,
      password: "test-password-123"
    });
    assertStatus(signup, 302);
    assert.equal(signup.headers.get("location"), "/listings");
    assert.match(signup.headers.get("set-cookie"), /SameSite=Lax/i);
    assert.equal(sentCodes.length, sentCodeCount);
    const authenticatedPage = await client.request("/listings");
    assertStatus(authenticatedPage, 200);
    assert.match(await authenticatedPage.text(), new RegExp(`Hi, ${username}`));
  };

  await signupAndSignIn(owner, "listing-owner", "owner@example.test");
  assert.ok(await mongoose.connection.collection("sessions").countDocuments() > 0);
  await signupAndSignIn(reviewer, "listing-reviewer", "reviewer@example.test");
  await signupAndSignIn(outsider, "listing-outsider", "outsider@example.test");

  const User = require("../models/user");
  const Listing = require("../models/listing");
  const Review = require("../models/review");
  assert.equal(await User.countDocuments(), 3);

  const unauthenticated = new TestClient(owner.baseUrl);
  for (const route of ["/signup", "/login", "/forgot-password"]) {
    const authPage = await unauthenticated.request(route);
    assertStatus(authPage, 200);
    assert.match(await authPage.text(), /Log in|Sign up/);
  }
  assertStatus(await unauthenticated.request("/verify-email"), 404);
  const missingPage = await unauthenticated.request("/missing-page");
  assertStatus(missingPage, 404);
  assert.match(await missingPage.text(), /Page not found/);

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
  const authenticatedPage = await loginClient.request("/listings");
  assertStatus(authenticatedPage, 200);
  const authenticatedPageHtml = await authenticatedPage.text();
  assert.match(authenticatedPageHtml, /Hi, listing-owner/);
  assert.match(authenticatedPageHtml, /Log out/);

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

  const sentCodeCount = sentCodes.length;
  const duplicateSignup = await unauthenticated.postForm("/signup", {
    username: "different-owner",
    email: "owner@example.test",
    password: "different-password-123"
  });
  assertStatus(duplicateSignup, 400);
  assert.match(await duplicateSignup.text(), /That email is already in use/);
  assert.equal(sentCodes.length, sentCodeCount);

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
  const loggedOutPage = await owner.request("/signup");
  assertStatus(loggedOutPage, 200);
  assert.match(await loggedOutPage.text(), /Sign up/);
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

  const startupPort = 30000 + crypto.randomInt(20000);
  const startupServer = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      MONGODB_URI: testMongoUri,
      IMAGE_STORAGE: "local",
      IMAGE_UPLOAD_DIRECTORY: uploadDirectory,
      SESSION_SECRET: `startup-test-${crypto.randomUUID()}`,
      PORT: String(startupPort),
      HOST: "127.0.0.1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let startupOutput = "";
  const startupReady = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup smoke test timed out.")), 15000);
    const handleOutput = (chunk) => {
      startupOutput += chunk.toString();
      if (startupOutput.includes(`Server listening on 0.0.0.0:${startupPort}.`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    startupServer.stdout.on("data", handleOutput);
    startupServer.stderr.on("data", handleOutput);
    startupServer.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    startupServer.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before becoming ready (code ${code}).`));
    });
  });

  try {
    await startupReady;
    const health = await fetch(`http://127.0.0.1:${startupPort}/health`);
    assertStatus(health, 200);
    assert.deepEqual(await health.json(), {
      status: "success",
      message: "Server is up and running"
    });
  } finally {
    if (startupServer.exitCode === null) {
      startupServer.kill("SIGTERM");
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Server did not stop after SIGTERM.")), 12000);
        startupServer.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }
});
