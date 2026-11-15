'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

async function api(path, options = {}) {
  const response = await fetch(`/api/v1/${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function todayLocal() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function money(cents) { return `€${(Number(cents || 0) / 100).toFixed(2)}`; }

export default function BookingPanel({ shopId }) {
  const [data, setData] = useState(null); const [user, setUser] = useState(null); const [profiles, setProfiles] = useState([]);
  const [serviceId, setServiceId] = useState(''); const [locationId, setLocationId] = useState(''); const [date, setDate] = useState(todayLocal()); const [profileId, setProfileId] = useState('self');
  const [slots, setSlots] = useState([]); const [selected, setSelected] = useState(null); const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true); const [finding, setFinding] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([api(`shops/${encodeURIComponent(shopId)}/booking-options`), api('auth/me').catch(() => null)])
      .then(async ([shop, account]) => {
        if (!live) return; setData(shop); setUser(account?.user || null); setServiceId(shop.services?.[0]?.id || ''); setLocationId(shop.locations?.[0]?.id || '');
        if (account?.user) { const result = await api('me/family-profiles').catch(() => ({ profiles: [] })); if (live) setProfiles(result.profiles || []); }
      }).catch((err) => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [shopId]);

  const selectedProfile = useMemo(() => profileId === 'self' ? user : profiles.find((profile) => profile.id === profileId), [profileId, user, profiles]);
  const eligibleServices = useMemo(() => (data?.services || []).filter((service) => !selectedProfile || service.audience === 'all' || (service.audience === 'men' && selectedProfile.gender === 'male') || (service.audience === 'women' && selectedProfile.gender === 'female')), [data, selectedProfile]);
  useEffect(() => { if (serviceId && !eligibleServices.some((service) => service.id === serviceId)) setServiceId(eligibleServices[0]?.id || ''); }, [eligibleServices, serviceId]);

  async function findTimes(event) {
    event.preventDefault(); setFinding(true); setError(''); setSelected(null); setSlots([]);
    try { const qs = new URLSearchParams({ service_id: serviceId, location_id: locationId, date }); const result = await api(`availability?${qs}`); setSlots(result.slots || []); }
    catch (err) { setError(err.message); }
    finally { setFinding(false); }
  }
  async function book() {
    if (!selected) return;
    if (!user) { setError('Sign in to your customer account before booking.'); return; }
    setSaving(true); setError('');
    try {
      const result = await api('bookings', { method: 'POST', body: JSON.stringify({ service_id: serviceId, location_id: locationId, professional_id: selected.professional_id, starts_at: selected.starts_at, local_date: date, family_profile_id: profileId === 'self' ? null : profileId }) });
      setBooking({ ...result.booking, payment_mode: result.payment_mode }); setSelected(null); setSlots([]);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="booking-panel"><p>Loading shop services…</p></section>;
  if (error && !data) return <section className="booking-panel"><div className="account-alert error">{error}</div></section>;
  if (!data) return null;
  if (booking) return <section className="booking-panel booking-confirmation"><span className="eyebrow">BOOKING CONFIRMED</span><h2>You’re booked.</h2><p>Show this code if the shop asks for your booking details.</p><strong className="booking-code">{booking.public_code}</strong><dl><div><dt>Service</dt><dd>{booking.service_name}</dd></div><div><dt>With</dt><dd>{booking.professional_name}</dd></div><div><dt>Location</dt><dd>{booking.location_name} · {booking.city}</dd></div><div><dt>Starts</dt><dd>{new Date(booking.starts_at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</dd></div><div><dt>Payment</dt><dd>{booking.payment_mode === 'onsite' ? `Pay at shop · ${money(booking.price_cents)}` : 'Payment status unavailable'}</dd></div></dl><button className="button button-outline" onClick={() => setBooking(null)}>Book another appointment</button></section>;
  return <section className="booking-panel" id="book">
    <div className="booking-panel-heading"><div><span className="eyebrow">BOOK AN APPOINTMENT</span><h2>Choose a service and time.</h2><p>Times shown use the shop’s local time. {data.business.payment_mode === 'onsite' ? 'Payment is due at the shop.' : 'This shop requires online payment, but checkout is not available yet.'}</p></div><span className="booking-pill">{data.business.cancellation_hours}h cancellation rule</span></div>
    {!user && <div className="booking-signin"><span>Sign in with your email and password or a passkey to book and manage appointments.</span><Link className="button button-outline" href={`/account?next=${encodeURIComponent(`/shops/${shopId}#book`)}`}>Customer sign in</Link></div>}
    {user && <label className="booking-field">Who is this appointment for?<select value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="self">Me · {user.display_name}</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.age}</option>)}</select></label>}
    {data.business.accepts_children && <p className="booking-note">Children accepted{data.business.minimum_child_age != null ? ` from age ${data.business.minimum_child_age}` : ''}.</p>}
    <form className="booking-form" onSubmit={findTimes}>
      <label className="booking-field">Service<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Choose a service</option>{eligibleServices.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.duration_minutes} min · {money(service.price_cents)}</option>)}</select></label>
      <label className="booking-field">Shop location<select required value={locationId} onChange={(event) => setLocationId(event.target.value)}>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.city}</option>)}</select></label>
      <label className="booking-field">Date<input type="date" required min={todayLocal()} max={new Date(Date.now()+90*86400000).toISOString().slice(0,10)} value={date} onChange={(event) => setDate(event.target.value)}/></label>
      <button className="button button-orange" disabled={!serviceId || !locationId || finding}>{finding ? 'Finding available times…' : 'Show available times'}</button>
    </form>
    {error && <div className="account-alert error" role="alert">{error}</div>}
    {slots.length > 0 && <div className="booking-times"><h3>Available times</h3><div className="booking-slot-grid">{slots.map((slot) => <button type="button" key={`${slot.professional_id}-${slot.starts_at}`} className={`booking-slot${selected?.starts_at===slot.starts_at&&selected?.professional_id===slot.professional_id?' selected':''}`} onClick={() => setSelected(slot)}><b>{slot.local_time}</b><span>{slot.professional_name}</span></button>)}</div>{selected && <div className="booking-review"><span>{selected.local_time} · {selected.professional_name}</span><button className="button button-orange" disabled={!user || saving || data.business.payment_mode !== 'onsite'} onClick={book}>{saving ? 'Confirming…' : data.business.payment_mode === 'onsite' ? 'Confirm appointment' : 'Online payment setup required'}</button></div>}</div>}
    {!finding && slots.length===0 && serviceId && date && <p className="booking-note">Choose a date and tap “Show available times” to check the live schedule.</p>}
    {eligibleServices.length===0 && <p className="booking-note">No services match the selected customer profile. Check their gender choice in your account.</p>}
  </section>;
}
