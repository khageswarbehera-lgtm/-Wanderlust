const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const loadProductionConfig = (overrides = {}, script = "require('./config/env')") => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    APP_ORIGIN: "https://wonderlust-oijv.onrender.com",
    IMAGE_STORAGE: "local",
    MONGODB_URI: "mongodb+srv://db.example.test/wanderlust",
    SESSION_SECRET: crypto.randomBytes(48).toString("base64url"),
    ...overrides
  };
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: process.cwd(),
    env,
    encoding: "utf8"
  });

  return result;
};

test("production config requires remote MongoDB and a strong session secret", () => {
  const valid = loadProductionConfig();
  assert.equal(valid.status, 0, valid.stderr);

  const missingMongoUri = loadProductionConfig({ MONGODB_URI: "" });
  assert.notEqual(missingMongoUri.status, 0);
  assert.match(missingMongoUri.stderr, /MONGODB_URI is required in production/);

  const localMongoUri = loadProductionConfig({
    MONGODB_URI: "mongodb://127.0.0.1:27017/wanderlust"
  });
  assert.notEqual(localMongoUri.status, 0);
  assert.match(localMongoUri.stderr, /remote MongoDB database in production/);

  const weakSessionSecret = loadProductionConfig({ SESSION_SECRET: "too-short" });
  assert.notEqual(weakSessionSecret.status, 0);
  assert.match(weakSessionSecret.stderr, /SESSION_SECRET must contain at least 32 bytes/);

  const repetitiveSessionSecret = loadProductionConfig({ SESSION_SECRET: "a".repeat(48) });
  assert.notEqual(repetitiveSessionSecret.status, 0);
  assert.match(repetitiveSessionSecret.stderr, /varied secret data/);

  const missingAppOrigin = loadProductionConfig({ APP_ORIGIN: "" });
  assert.notEqual(missingAppOrigin.status, 0);
  assert.match(missingAppOrigin.stderr, /APP_ORIGIN is required in production/);

  const insecureAppOrigin = loadProductionConfig({ APP_ORIGIN: "http://wonderlust-oijv.onrender.com" });
  assert.notEqual(insecureAppOrigin.status, 0);
  assert.match(insecureAppOrigin.stderr, /APP_ORIGIN must use HTTPS/);

  const appOriginWithPath = loadProductionConfig({ APP_ORIGIN: "https://wonderlust-oijv.onrender.com/path" });
  assert.notEqual(appOriginWithPath.status, 0);
  assert.match(appOriginWithPath.stderr, /APP_ORIGIN must be an HTTP\(S\) origin/);
});

test("Cloudflare R2 config maps its credentials and endpoint to the storage adapter", () => {
  const configuration = loadProductionConfig({
    IMAGE_STORAGE: "r2",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_BUCKET: "wanderlust-images",
    R2_PUBLIC_URL: "https://images.example.test/",
    R2_ACCESS_KEY_ID: "r2-access-key",
    R2_SECRET_ACCESS_KEY: "r2-secret-key"
  }, `const config=require('./config/env'); process.stdout.write(JSON.stringify({
    type: config.imageStorageType,
    bucket: config.imageStorageBucket,
    publicUrl: config.imageStoragePublicUrl,
    region: config.imageStorageRegion,
    endpoint: config.imageStorageEndpoint,
    accessKeyId: config.imageStorageAccessKeyId,
    secretAccessKey: config.imageStorageSecretAccessKey
  }))`);

  assert.equal(configuration.status, 0, configuration.stderr);
  assert.deepEqual(JSON.parse(configuration.stdout), {
    type: "r2",
    bucket: "wanderlust-images",
    publicUrl: "https://images.example.test",
    region: "auto",
    endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    accessKeyId: "r2-access-key",
    secretAccessKey: "r2-secret-key"
  });
});

test("Cloudflare R2 config rejects incomplete and insecure settings", () => {
  const baseConfig = {
    IMAGE_STORAGE: "r2",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_BUCKET: "wanderlust-images",
    R2_PUBLIC_URL: "https://images.example.test",
    R2_ACCESS_KEY_ID: "r2-access-key",
    R2_SECRET_ACCESS_KEY: "r2-secret-key"
  };
  const missingCredentials = loadProductionConfig({
    ...baseConfig,
    R2_SECRET_ACCESS_KEY: ""
  });
  assert.notEqual(missingCredentials.status, 0);
  assert.match(missingCredentials.stderr, /R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required/);

  const malformedAccountId = loadProductionConfig({
    ...baseConfig,
    R2_ACCOUNT_ID: "not-an-account-id"
  });
  assert.notEqual(malformedAccountId.status, 0);
  assert.match(malformedAccountId.stderr, /R2_ACCOUNT_ID must be a 32-character/);

  const insecurePublicUrl = loadProductionConfig({
    ...baseConfig,
    R2_PUBLIC_URL: "http://images.example.test"
  });
  assert.notEqual(insecurePublicUrl.status, 0);
  assert.match(insecurePublicUrl.stderr, /R2_PUBLIC_URL must use HTTPS in production/);
});

test("Cloudflare R2 config requires every R2 setting", () => {
  const validConfig = {
    IMAGE_STORAGE: "r2",
    R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    R2_BUCKET: "wanderlust-images",
    R2_PUBLIC_URL: "https://images.example.test",
    R2_ACCESS_KEY_ID: "test-access-key",
    R2_SECRET_ACCESS_KEY: "test-secret-key"
  };

  for (const [variable, message] of [
    ["R2_ACCOUNT_ID", /R2_ACCOUNT_ID must be a 32-character/],
    ["R2_BUCKET", /R2_BUCKET and R2_PUBLIC_URL are required/],
    ["R2_PUBLIC_URL", /R2_BUCKET and R2_PUBLIC_URL are required/],
    ["R2_ACCESS_KEY_ID", /R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required/],
    ["R2_SECRET_ACCESS_KEY", /R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required/]
  ]) {
    const invalidConfig = loadProductionConfig({
      ...validConfig,
      [variable]: ""
    });
    assert.notEqual(invalidConfig.status, 0, `${variable} should be required`);
    assert.match(invalidConfig.stderr, message, `${variable} should have a useful validation error`);
  }
});
