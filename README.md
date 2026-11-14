# Style by Rinero

Separate project and deployment from `stamps.rinero.app`. Intended hostname: `style.rinero.app`.

## Project parts

1. `customer-web/` — search-engine-friendly Next.js website.
2. `customer-app/` — Expo / React Native iOS and Android app.
3. `business-portal/` — separate business management website.
4. `server/` — shared Node API and MySQL schema in `server/database/`.

The root package coordinates the four workspaces. All three interfaces call the same API; there should be one source of booking, availability, payment and loyalty state.

## Current status

The customer website has passkey registration, passkey sign-in, session check, and sign-out. It collects first name, surname, phone, email, age (optional), and gender. The account area supports creating, editing, and removing up to five family profiles. The API verifies WebAuthn challenges, stores passkey credentials and hashed session tokens, and scopes family-profile actions to the signed-in customer.

Shop pages now show active services, locations, and professionals; customers can select themselves or a family profile, check live appointment slots, and create a confirmed booking when a shop is configured for payment at the appointment. Slot generation accounts for weekly availability, breaks, schedule exceptions, and existing bookings. Online payment modes deliberately cannot confirm a booking until a payment provider flow is implemented and connected. The schedule convention is Monday `0` through Sunday `6` in `availability_rules.weekday`.

This is still an incomplete product and is not ready for customer launch. Remaining work includes Stripe Connect onboarding, payment and shop payouts, customer booking rescheduling, verified email/account recovery, booking notifications, business/staff setup tools and invitations, loyalty reward redemption, reviews, and store-published native apps. Customer accounts now show their bookings and can cancel future confirmed bookings that have no payment record. The four-hour shop policy is reported for late cancellations, but no cancellation fee is collected. Paid bookings cannot be cancelled in-app until refund handling exists. A confirmed booking currently has no payment collected. Do not represent the service as fully launched or paid-booking ready.

Passkey deployment requirements:

- Use HTTPS in production. Set `PUBLIC_URL` to the exact customer website origin (for example `https://style.rinero.app`) and `WEBAUTHN_RP_ID` to its hostname (`style.rinero.app`).
- Set `STYLE_API_BASE_URL` in the customer-web deployment to the private API origin, such as `http://127.0.0.1:3200` when both services share a host.
- Import the canonical schema at `database/schema.sql`. For an existing database, apply `database/migrations/001_user_profile_fields.sql` once before using registration; it adds phone, gender, and age fields to users.
- Account lookup currently uses the email entered at registration/sign-in. Email ownership verification and account recovery are not implemented yet; do not treat this as launch-ready account recovery.

Business owners can now create a passkey account and a pending business profile. Shop location, service, professional, schedule editing, staff invitations, and activation controls are still unfinished. There are no seeded/example businesses.

## Local setup

1. Install Node.js 22 or newer and MySQL 8 / MariaDB 10.6 or newer.
2. Copy `.env.example` to `.env`, set database credentials and a long random `SESSION_SECRET`. Keep `.env` outside the public document root and never upload it to a static web folder.
3. Create the database and tables by importing `server/database/schema.sql` into MySQL. Create a database user with access only to `style_rinero`.
4. In this directory run `npm install`. Configure the API and customer-web workspaces, then start each service using its workspace script.
5. Put the customer website behind HTTPS and configure its `/api/v1/*` proxy target using `STYLE_API_BASE_URL`. Do not expose the database port publicly.

Without a configured database, the site shell still serves, but shop and listing searches show that data is unavailable.

## Security and privacy notes

- The native app and business portal do not yet have integrated account access. Do not enter real customer data.
- The platform does not send email or WhatsApp messages and does not collect payment details.
- Booking contact details, privacy-request processing, data retention/deletion, processor agreements, and the controller's legal details need to be completed before launch.
- Near-me uses browser geolocation only after an explicit tap; coordinates are used for that search and are not saved by this app.
- Mobile app integrity checks (Apple App Attest / Google Play Integrity) require native apps and are not provided by this installable web shell.
