const groups = [
  ['Your business', 'Shop profile', 'Locations', 'Team & professionals', 'Services & prices'],
  ['Your day', 'Appointments', 'Staff schedules', 'Breaks & time off', 'Customer messages'],
  ['Your growth', 'Payments & payouts', 'Reports', 'Loyalty', 'Reviews'],
  ['Your listings', 'Job listings', 'Chair rentals']
];

export default function BusinessHome() {
  return <main className="portal-shell">
    <header className="portal-header"><a className="portal-brand" href="/">style<span>.</span>rinero</a><span>BUSINESS SPACE</span><a className="portal-login" href="https://style.rinero.app/business-account">Business sign in ↗</a></header>
    <section className="portal-hero"><div className="portal-eyebrow">FOR YOUR SALON, STUDIO OR BARBERSHOP</div><h1>Your team, bookings<br/><i>and business in sync.</i></h1><p>Set up your services, professionals, locations and schedules. Customers can then find a time and book online.</p><div className="portal-actions"><a className="portal-button primary" href="https://style.rinero.app/business-account?mode=register">Create a business account</a><a className="portal-button" href="https://style.rinero.app/business-account">I already have an account</a></div></section>
    <section className="portal-grid">{groups.map(([title,...items])=><article key={title}><h2>{title}</h2>{items.map(item=><div className="portal-row" key={item}><span>{item}</span><span>›</span></div>)}</article>)}</section>
    <aside className="portal-note"><b>Payments:</b> Stripe Connect is the agreed provider. Customer payments, including deposits, will route to the relevant business account with the €0.50 platform fee per payment. Live charges remain disabled until Stripe onboarding and credentials are configured.</aside>
  </main>;
}
