# ResinStudio Backend

Node.js/Express + MongoDB REST API for the ResinStudio storefront, admin portal, and mobile app.
See `../IMPLEMENTATION_PROMPT.md` for the full functional spec and `../PROGRESS.md` for build status.

## Setup

1. **Install dependencies**: `npm install`
2. **Create accounts and get credentials** (see `../ACCOUNT_SETUP.md` for step-by-step instructions):
   - MongoDB Atlas (free M0 cluster) → connection string
   - Cloudinary (free tier) → cloud name, API key/secret
   - Razorpay (test mode, no KYC needed) → key ID/secret
3. **Copy `.env.example` to `.env`** and fill in the values from step 2.
4. **Run the dev server**: `npm run dev` — starts on `http://localhost:4000`, API docs at `/api/docs` once built.

## Scripts

| Command                             | Purpose                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                       | Start dev server with hot reload (tsx watch)                               |
| `npm run build` / `npm start`       | Production build + run                                                     |
| `npm run lint` / `npm run lint:fix` | ESLint                                                                     |
| `npm test`                          | Run Jest test suite                                                        |
| `npm run seed`                      | Populate the database with demo data (admin user, sample products, orders) |

## Notes

- Email/SMS providers default to `console` (logged to stdout, not actually sent) via `EMAIL_PROVIDER`/`SMS_PROVIDER` in `.env` — the full order lifecycle is demoable before Brevo/Twilio accounts exist. Switch to the real provider name once configured.
- Pre-commit hook (Husky + lint-staged) runs ESLint + Prettier on staged files automatically.
