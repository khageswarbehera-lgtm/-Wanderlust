const test = require("node:test");
const assert = require("node:assert/strict");

const configPath = require.resolve("../config/env");
const servicePath = require.resolve("../services/email");
const mailerPath = require.resolve("nodemailer");
const environmentKeys = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM"
];
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

test("SMTP delivery requires TLS and rejects messages not accepted by the provider", async (t) => {
  t.after(() => {
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
    delete require.cache[configPath];
    delete require.cache[servicePath];
    delete require.cache[mailerPath];
  });

  Object.assign(process.env, {
    SMTP_HOST: "smtp.test.invalid",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "test-user",
    SMTP_PASS: "test-only-secret",
    MAIL_FROM: "noreply@example.test"
  });
  delete require.cache[configPath];
  delete require.cache[servicePath];

  let transportOptions;
  let messageResult = { accepted: ["user@example.test"], rejected: [] };
  let sentMessage;
  require.cache[mailerPath] = {
    id: mailerPath,
    filename: mailerPath,
    loaded: true,
    exports: {
      createTransport(options) {
        transportOptions = options;
        return {
          async sendMail(message) {
            sentMessage = message;
            return messageResult;
          }
        };
      }
    }
  };

  const emailService = require("../services/email");
  assert.equal(emailService.isMailConfigured, true);
  assert.equal(transportOptions.secure, false);
  assert.equal(transportOptions.requireTLS, true);
  assert.equal(transportOptions.tls.minVersion, "TLSv1.2");

  await emailService.sendCodeEmail("user@example.test", "123456", "verification");
  assert.equal(sentMessage.to, "user@example.test");
  assert.match(sentMessage.text, /123456/);

  messageResult = { accepted: [], rejected: ["user@example.test"] };
  await assert.rejects(
    emailService.sendCodeEmail("user@example.test", "654321", "password-reset"),
    { code: "EMAIL_NOT_ACCEPTED" }
  );

  process.env.SMTP_PORT = "465";
  delete process.env.SMTP_SECURE;
  delete require.cache[configPath];
  const implicitTlsConfig = require("../config/env");
  assert.equal(implicitTlsConfig.smtpSecure, true);

  process.env.SMTP_USER = "";
  process.env.SMTP_PASS = "";
  process.env.MAIL_FROM = "";
  delete require.cache[configPath];
  assert.throws(
    () => require("../config/env"),
    /SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured together/
  );
});
