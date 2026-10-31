const test = require("node:test");
const assert = require("node:assert/strict");
const { createOriginValidation, parseOrigin } = require("../middleware/validateOrigin");

const productionOrigin = "https://wonderlust-oijv.onrender.com";

const runValidation = (middleware, {
  method = "POST",
  headers = {},
  trustProxy = 1,
  protocol = "http"
} = {}) => new Promise((resolve) => {
  const request = {
    method,
    protocol,
    app: { get: (setting) => setting === "trust proxy" && trustProxy },
    get: (name) => headers[name.toLowerCase()]
  };
  middleware(request, {}, (error) => resolve(error || null));
});

test("origin parser accepts HTTP(S) origins and rejects non-origin URLs", () => {
  assert.equal(parseOrigin(productionOrigin), productionOrigin);
  assert.equal(parseOrigin("https://wonderlust-oijv.onrender.com.attacker.example"), "https://wonderlust-oijv.onrender.com.attacker.example");
  assert.equal(parseOrigin("https://wonderlust-oijv.onrender.com/path"), null);
  assert.equal(parseOrigin("javascript:alert(1)"), null);
  assert.equal(parseOrigin("https://user:pass@wonderlust-oijv.onrender.com"), null);
});

test("production origin validation accepts the exact Render origin through its HTTPS proxy", async () => {
  const middleware = createOriginValidation({
    isProduction: true,
    appOrigin: productionOrigin
  });
  const error = await runValidation(middleware, {
    headers: {
      origin: productionOrigin,
      host: "internal-render-host",
      "x-forwarded-host": "wonderlust-oijv.onrender.com",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(error, null);
});

test("production origin validation rejects other hosts, protocols, and ports", async () => {
  const middleware = createOriginValidation({
    isProduction: true,
    appOrigin: productionOrigin
  });
  const variations = [
    { origin: "https://wonderlust-oijv.onrender.com.attacker.example", host: "wonderlust-oijv.onrender.com" },
    { origin: "http://wonderlust-oijv.onrender.com", host: "wonderlust-oijv.onrender.com" },
    { origin: "https://wonderlust-oijv.onrender.com:444", host: "wonderlust-oijv.onrender.com:444" }
  ];

  for (const { origin, host } of variations) {
    const error = await runValidation(middleware, {
      headers: {
        origin,
        host,
        "x-forwarded-host": host,
        "x-forwarded-proto": origin.startsWith("http://") ? "http" : "https"
      }
    });
    assert.equal(error?.status, 403);
  }
});

test("local origin validation compares the exact request origin", async () => {
  const middleware = createOriginValidation({
    isProduction: false,
    appOrigin: "http://localhost:3000"
  });
  assert.equal(await runValidation(middleware, {
    trustProxy: false,
    protocol: "http",
    headers: { origin: "http://localhost:3000", host: "localhost:3000" }
  }), null);

  const error = await runValidation(middleware, {
    trustProxy: false,
    protocol: "http",
    headers: { origin: "http://localhost:3000.attacker.example", host: "localhost:3000" }
  });
  assert.equal(error?.status, 403);
});
