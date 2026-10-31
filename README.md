# Wanderlust

Wanderlust is a server-rendered travel-listing application built with Express, EJS, and MongoDB/Mongoose. It supports account registration, login/logout, password recovery, listing and review management, and listing image uploads.

## Features

- Browse listings and view individual listing details.
- Register with an email address and password, then log in automatically.
- Request a password-reset code and update a password using that code.
- Create, edit, and delete listings. Listing changes require authentication and are checked against listing ownership.
- Add, edit, and delete reviews. Review changes require authentication and are checked against review ownership.
- Upload one JPEG, PNG, GIF, or WebP listing image per request, up to 5 MB. Both the declared type and file signature are checked.
- Store images locally or in an S3-compatible bucket.
- Render validation and error feedback in the EJS interface.

## Prerequisites

- Node.js 20.19 or newer.
- npm.
- MongoDB, either a local server for development or a reachable deployment for production.
- SMTP credentials to use password recovery.
- An S3-compatible bucket and its configuration for the default production image-storage mode.

## Installation

```sh
npm ci
```

Copy the example environment file and edit it for your machine:

```powershell
Copy-Item .env.example .env
```

Start MongoDB and set `MONGODB_URI` in `.env` to the database you intend to use. Configure the environment variables described below, then start the app with `npm run dev`.

The app listens on `0.0.0.0` and `PORT` (default: `3000`). The health endpoint is `GET /health`.

## Environment variables

Values in `.env.example` are examples, not production credentials. Keep `.env` out of version control and use your deployment platform's secret manager for real credentials.

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set to `production` for deployment. Production configuration requires an explicit remote MongoDB URI and strong session secret. |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/wanderlust` outside production | MongoDB connection string, including a database name. Required in production; production rejects localhost addresses. |
| `SESSION_SECRET` | Development-only fallback | Signs session cookies. In production, provide at least 32 bytes with varied secret data. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. |
| `PORT` | `3000` | HTTP port; must be an integer from 1 to 65535. |
| `APP_ORIGIN` | `http://localhost:<PORT>` in development | Exact public application origin. Required in production; set to `https://wonderlust-oijv.onrender.com` on Render. |
| `IMAGE_STORAGE` | `local` outside production; `s3` in production | Choose `local` or `s3`. |
| `IMAGE_UPLOAD_DIRECTORY` | `public/uploads` | Local image directory. For deployment, local storage requires a persistent mounted volume. |
| `S3_BUCKET` | — | Bucket name; required for S3 storage. |
| `S3_REGION` | `us-east-1` | Bucket region. |
| `S3_PUBLIC_URL` | — | Public base URL for stored images; required for S3 storage and must use HTTPS in production. |
| `S3_ENDPOINT` | — | Optional endpoint for S3-compatible providers. |
| `S3_ACCESS_KEY_ID` | — | Optional explicit storage credentials. Set together with `S3_SECRET_ACCESS_KEY`; otherwise the AWS SDK credential provider chain is used. |
| `S3_SECRET_ACCESS_KEY` | — | Optional secret paired with `S3_ACCESS_KEY_ID`. |
| `SMTP_HOST` | — | SMTP server hostname. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_SECURE` | Inferred from port (`true` for 465, otherwise `false`) | Set to `true` for implicit TLS or `false` for STARTTLS. STARTTLS requires TLS; TLS 1.2 or newer is configured. |
| `SMTP_USER` | — | SMTP username. |
| `SMTP_PASS` | — | SMTP password. |
| `MAIL_FROM` | `SMTP_USER` | Sender address accepted by the SMTP provider. |
| `SEED_PASSWORD` | Unsafe built-in seed-only fallback | Password assigned by `npm run seed` to the seed account. Set an appropriate value before running the seed command, and never use this command against production data. |

SMTP settings are optional at server startup, but if any SMTP setting is provided, `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` must all be supplied. Without configured SMTP, password recovery is unavailable; account registration and login remain available.

## MongoDB and seed data

For local development, start a local MongoDB server and use the default URI, or set `MONGODB_URI` to another development database. Production requires a remote MongoDB connection URI with a database name. Use a dedicated database for each environment and keep connection credentials private.

`npm run seed` is **destructive to the database named by `MONGODB_URI`**: it deletes every document in that database's `listings` collection and inserts the sample listings. It also upserts the `seed@wanderlust.local` user and assigns a password hash from `SEED_PASSWORD` (or the insecure built-in fallback if it is unset). The seed account can log in with that password. The script is for disposable development databases only. Check the resolved URI and set `SEED_PASSWORD` before running it; never run it against production or any database containing listings you need to keep. This script does not reset other collections, including reviews.

## Development commands

```sh
npm run dev    # Start with nodemon
npm start      # Start the server
npm run seed   # Replace all listings in the configured database with sample data
npm test       # Run automated tests
```

There is currently no lint script configured in `package.json`. The GitHub Actions workflow runs `npm run lint --if-present`, so linting is skipped until a lint script is added.

## Tests and continuous integration

`npm test` uses Node's built-in test runner. HTTP integration tests start a uniquely named database on a temporary MongoDB instance and use a temporary image directory; they do not connect to `MONGODB_URI` or send real email. Email delivery is stubbed for application-flow tests, with separate tests for SMTP configuration and provider-response handling. If `mongodb-memory-server` cannot find a compatible MongoDB binary in its cache, it may need to download one.

GitHub Actions runs on pushes and pull requests. It installs dependencies with `npm ci`, runs the optional lint command, and executes the tests on Node.js 20.19. No production credentials are required by the workflow.

## Deployment

1. Use Node.js 20.19 or newer and install with `npm ci`.
2. Set `NODE_ENV=production`, `APP_ORIGIN`, `MONGODB_URI`, and a strong `SESSION_SECRET` through the platform's environment/secret settings. For this Render service, set `APP_ORIGIN=https://wonderlust-oijv.onrender.com`.
3. Configure SMTP if users need password recovery.
4. Configure S3-compatible storage (`S3_BUCKET`, `S3_REGION`, and `S3_PUBLIC_URL`) or explicitly select local storage on a persistent mounted volume. The production default is S3.
5. On Render, set the service type to **Web Service**, the build command to `npm ci`, and the start command to `npm start`. Do not use `npm run dev`; it starts nodemon and is intended only for local development. The server binds to `0.0.0.0` and uses Render's injected `PORT` (falling back to `3000` locally).
6. Route HTTPS traffic through a trusted reverse proxy.

Production sessions are stored in the same MongoDB database for seven days; MongoDB TTL cleanup is used for expired sessions. Cookies are HTTP-only, secure in production, and `SameSite=Lax`. The app trusts one proxy hop in production; adjust `app.js` if the deployment topology differs. Mutating requests that include an `Origin` header are checked against the exact configured `APP_ORIGIN` in production and the exact request origin in development. On Render, set `APP_ORIGIN=https://wonderlust-oijv.onrender.com`; locally use `http://localhost:3000`. Proxy-forwarded protocol and host are used only when proxy trust is enabled. CORS is not configured. `SIGINT` and `SIGTERM` initiate HTTP and MongoDB shutdown; open connections are force-closed after the 10-second grace period.

## Known limitations

- Authentication mutation endpoints have MongoDB-backed per-IP rate limits: signup (5/hour), login (10/15 minutes), password reset (10/15 minutes), password recovery request (5/hour), and logout (10/15 minutes). A `429` response includes `Retry-After`. Password-reset codes expire after 10 minutes and allow up to five failed code attempts. Limits are fixed in code, not configurable through environment variables; production deployments must use the configured trusted proxy so client IPs are identified correctly.
- Origin checks apply only when a mutating request includes an `Origin` header. The app does not configure CORS or provide a separate CSRF-token middleware.
- The app uses Express's in-memory session store in development unless configured otherwise; those sessions are not durable across restarts and should not be used for a multi-instance deployment. The integration suite explicitly configures a MongoDB session store against its temporary test database.
- The test suite uses a temporary MongoDB instance and stubs email. It does not validate connectivity to a production MongoDB cluster, live SMTP delivery, S3 permissions, a deployment proxy, or a full production browser workflow.
- Sample listing image URLs refer to externally hosted Unsplash images; their availability is outside this application's control.
- No platform-specific deployment manifest is included. Configure the runtime and persistent services in the chosen hosting platform.
