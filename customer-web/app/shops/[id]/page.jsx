import Link from 'next/link';
import BookingPanel from './booking-panel';

const API = process.env.STYLE_API_BASE_URL || 'http://127.0.0.1:3200';
async function getShop(id) {
  try { const response = await fetch(new URL(`/api/v1/shops/${encodeURIComponent(id)}/booking-options`, API), { cache: 'no-store' }); if (!response.ok) return null; return await response.json(); }
  catch { return null; }
}
export async function generateMetadata({ params }) { const { id } = await params; const data = await getShop(id); return { title: data?.business?.name || 'Shop services', description: data?.business?.description || 'View services, prices and appointment times.', alternates: { canonical: `/shops/${id}` } }; }
export default async function ShopPage({ params }) {
  const { id } = await params; const data = await getShop(id);
  if (!data) return <main className="results-page wrap"><Link className="back-link" href="/search">← Search shops</Link><div className="results-empty"><b>Shop details are unavailable.</b><p>It may be inactive or temporarily unreachable.</p></div></main>;
  const { business, locations, services, professionals } = data;
  return <main className="results-page wrap"><Link className="back-link" href="/search">← Search shops</Link>
    <header className="shop-profile-heading">{business.cover_photo_url && <img className="shop-cover" src={business.cover_photo_url} alt=""/>}<div className="shop-profile-title">{business.logo_url && <img className="shop-logo" src={business.logo_url} alt=""/>}<div><span className="eyebrow">{business.category}</span><h1>{business.name}</h1><p>{business.description || 'Choose a service, see the team and book a time.'}</p></div></div>
      {!!locations.length && <div className="shop-locations">{locations.map((location) => <span key={location.id}>⌖ {location.name} · {location.address}, {location.city}</span>)}</div>}
    </header>
    <section className="shop-services"><div className="section-heading"><span className="eyebrow">SERVICES & PRICES</span><h2>What would you like?</h2></div>{services.length ? <div className="service-list">{services.map((service) => <article className="service-row" key={service.id}><div><b>{service.name}</b><small>{service.duration_minutes} minutes · {service.audience==='all'?'Everyone':service.audience==='men'?'Men':'Women'}</small>{service.description&&<p>{service.description}</p>}</div><strong>€{(service.price_cents / 100).toFixed(2)}</strong><a className="button button-outline" href="#book">Choose time</a></article>)}</div> : <div className="results-empty"><b>No active services are listed yet.</b></div>}</section>
    {!!professionals.length && <section className="shop-team"><div className="section-heading"><span className="eyebrow">THE TEAM</span><h2>Choose your person.</h2></div><div className="team-strip">{professionals.map((person) => <article className="team-card" key={person.id}>{person.photo_url ? <img src={person.photo_url} alt=""/> : <span className="team-avatar">✦</span>}<div><b>{person.name}</b>{person.bio&&<p>{person.bio}</p>}</div></article>)}</div></section>}
    <BookingPanel shopId={id}/>
  </main>;
}
