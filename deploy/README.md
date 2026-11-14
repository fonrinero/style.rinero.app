# CloudPanel deployment preparation

This starts the API, customer website, and business portal as separate PM2
processes on localhost ports 3200, 3100, and 3201. It does not configure
CloudPanel vhosts, DNS, a production database, Stripe, or the Expo app stores.

## Build on the server

From the project root, after creating the protected `.env` file and importing
`server/database/schema.sql`:

```sh
npm install
npm run build --workspace @style/customer-web
npm run build --workspace @style/business-portal
```

The API uses the `PORT=3200` value in PM2 and loads `.env` from the project
root. Set `PUBLIC_URL=https://style.rinero.app` and
`WEBAUTHN_RP_ID=style.rinero.app` in that protected `.env` file. Keep database
credentials and provider secrets out of GitHub and out of the public web root.

## PM2

Start the processes from the project root:

```sh
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

Configure CloudPanel reverse proxies so the customer website is available on
the chosen public hostname and sends traffic to `127.0.0.1:3100`. Keep API
port `3200` and portal port `3201` private; the website proxies API requests
to the API. Choose and configure the business portal's public hostname before
giving shop owners access.

## Current release limitation

This config only prepares the Node processes. The current project is not a
production booking/payment release: Stripe Connect payouts and charges,
business setup/staff management, account recovery, notifications, and native
app release configuration are not complete. Do not take real customer
payments or expose the portal publicly until those flows and the CloudPanel
hostnames have been completed and checked.
