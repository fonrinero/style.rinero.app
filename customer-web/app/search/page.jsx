import Link from 'next/link';

const API = process.env.STYLE_API_BASE_URL || 'http://localhost:3200';
async function findShops(params) {
  const url = new URL('/api/v1/shops', API);
  for (const key of ['q', 'city', 'category']) if (params[key]) url.searchParams.set(key, String(params[key]).slice(0, 100));
  try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) return { shops: [], unavailable: true }; return await response.json(); }
  catch { return { shops: [], unavailable: true }; }
}

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const area = params.city ? ` in ${params.city}` : ' nearby';
  return { title: `Find hair, beauty and wellness${area}`, description: `Browse local professionals, services and prices${area} with Style by Rinero.` };
}

export default async function SearchPage({ searchParams }) {
  const params = await searchParams;
  const { shops = [], unavailable } = await findShops(params);
  return <main className="results-page wrap"><Link className="back-link" href="/">← Style by Rinero</Link><div className="results-heading"><span className="eyebrow">YOUR NEXT APPOINTMENT</span><h1>Find your people.</h1><p>Compare local shops, services and starting prices.</p></div><form className="searchbar results-search" action="/search"><label><span>⌕</span><input name="q" defaultValue={params.q || ''} placeholder="Service, salon or professional"/></label><label><span>⌖</span><input name="city" defaultValue={params.city || ''} placeholder="Town or area"/></label><button className="button button-orange">Search <b>↗</b></button></form>{unavailable ? <div className="results-empty"><b>Shop listings are temporarily unavailable.</b><p>Please try again shortly.</p></div> : shops.length ? <div className="results-grid">{shops.map(shop=><article className="result-card" key={`${shop.business_id}-${shop.location_id}`}><div className="result-art"><span>{shop.category || 'STYLE'}</span></div><div className="result-info"><small>{shop.category}</small><h2>{shop.name}</h2><p>{[shop.location_name, shop.city, shop.address].filter(Boolean).join(' · ')}</p><div><span>{shop.service_count} services</span>{shop.from_price_cents != null && <b>From €{(shop.from_price_cents / 100).toFixed(0)}</b>}</div><Link href={`/shops/${shop.business_id}`}>See services and availability ↗</Link></div></article>)}</div> : <div className="results-empty"><b>No shops match those filters yet.</b><p>Try another service or town. New local businesses will appear here.</p></div>}</main>;
}
