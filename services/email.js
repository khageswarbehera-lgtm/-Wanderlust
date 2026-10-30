const nodemailer = require("nodemailer");
const {
  mailFrom,
  smtpHost,
  smtpPass,
  smtpPort,
  smtpSecure,
  smtpUser
} = require("../config/env");

const isMailConfigured = Boolean(smtpHost && smtpUser && smtpPass && mailFrom);
const transporter = isMailConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      requireTLS: !smtpSecure,
      tls: { minVersion: "TLSv1.2" },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: { user: smtpUser, pass: smtpPass }
    })
  : null;

async function sendCodeEmail(to, code, purpose) {
  if (!transporter) {
    throw new Error("SMTP email settings are missing.");
  }

  const isVerification = purpose === "verification";
  const subject = isVerification ? "Verify your Wanderlust account" : "Reset your Wanderlust password";
  const action = isVerification ? "verify your email address" : "reset your password";
  const text = `Use this code to ${action}: ${code}. It expires in 10 minutes.`;

  const result = await transporter.sendMail({
    from: mailFrom,
    to,
    subject,
    text,
    html: `<p>Use this code to ${action}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes.</p>`
  });

  if (!result.accepted?.length || result.rejected?.length) {
    const error = new Error("The email provider did not accept the message.");
    error.code = "EMAIL_NOT_ACCEPTED";
    throw error;
  }
}

module.exports = { isMailConfigured, sendCodeEmail };
