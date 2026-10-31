const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const loadProductionConfig = (overrides = {}) => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    APP_ORIGIN: "https://wonderlust-oijv.onrender.com",
    IMAGE_STORAGE: "local",
    MONGODB_URI: "mongodb+srv://db.example.test/wanderlust",
    SESSION_SECRET: crypto.randomBytes(48).toString("base64url"),
    ...overrides
  };
  const result = spawnSync(process.execPath, ["-e", "require('./config/env')"], {
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
