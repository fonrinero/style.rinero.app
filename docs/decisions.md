# Decisions and open items

## Agreed
- Product name/domain: Style by Rinero — `style.rinero.app`.
- Reference products: GoBarber, Bookero, and eBarber.gr; broaden beyond barbers to men’s and women’s services.
- Customer can book for self or one of up to five family profiles.
- Shops set child acceptance and age limits.
- Shops manage employees, services, prices, service duration, availability, and breaks.
- Customer chooses a specific professional or any available professional.
- Shops choose full prepayment, deposit, or payment at the shop; prices and cancellation policy are shown before confirmation.
- Payment provider: Stripe Connect. Agreed platform fee: €0.50 per payment, including deposits. Live collection and payouts require Stripe account setup and credentials.
- Customer app: Expo / React Native for iOS and Android. Public booking site: Next.js. Business portal and shared API/database are separate deployable parts.
- Cancellation/reschedule/no-show rules as described in README.
- Jobs and chair rental are free public listings in a distinct business section. Registration is required to post; not to browse or contact.
- Loyalty is tied to the customer account. Booked appointment earns a stamp automatically at its scheduled end; shop is responsible for flagging a no-show.
- Languages: English, Greek, Colombian Spanish. Dark and light themes.

## Still open
- Whether booking accounts require phone numbers in addition to email/passkey.
- Exact treatment of the €0.50 fee for payments collected outside the platform (for example, payment at the shop).
- Native store identifiers, signing, and store publishing setup.
- Passkey library approval and account recovery policy.
