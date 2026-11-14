import Link from 'next/link';

const API = process.env.STYLE_API_BASE_URL || 'http://localhost:3200';
async function getListings(searchParams) {
  const params = await searchParams;
  const url = new URL('/api/v1/listings', API);
  for (const key of ['type', 'city']) if (params[key]) url.searchParams.set(key, String(params[key]).slice(0, 100));
  try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) return { unavailable: true, listings: [] }; return await response.json(); }
  catch { return { unavailable: true, listings: [] }; }
}

export const metadata = { title: 'Salon jobs and chair rentals', description: 'Browse free public job and chair-rental listings posted by salons and studios.' };

export default async function OpportunitiesPage({ searchParams }) {
  const params = await searchParams;
  const { listings = [], unavailable } = await getListings(searchParams);
  return <main className="results-page wrap"><Link className="back-link" href="/">← Style by Rinero</Link><div className="results-heading"><span className="eyebrow">FOR PROFESSIONALS</span><h1>Find your next opportunity.</h1><p>Browse job openings and chairs available to rent. No account is needed to view or contact a listing.</p></div><form className="searchbar results-search" action="/opportunities"><label><span>⌖</span><input name="city" defaultValue={params.city || ''} placeholder="Town or area"/></label><select name="type" defaultValue={params.type || ''}><option value="">All listings</option><option value="job">Jobs</option><option value="chair_rental">Chair rentals</option></select><button className="button button-orange">Search <b>↗</b></button></form>{unavailable?<div className="results-empty"><b>Listings are temporarily unavailable.</b><p>Please try again shortly.</p></div>:listings.length?<div className="results-grid">{listings.map(item=><article className="result-card" key={item.id}><div className="result-info"><small>{item.listing_type==='job'?'JOB OPENING':'CHAIR RENTAL'} · {item.city}</small><h2>{item.title}</h2><p>{item.business_name}</p><p>{item.description}</p><a href={`mailto:${encodeURIComponent(item.contact_email)}?subject=${encodeURIComponent(item.title)}`}>Contact the business ↗</a></div></article>)}</div>:<div className="results-empty"><b>No public listings match those filters.</b><p>Try another area or check back later.</p></div>}</main>;
}
