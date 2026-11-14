'use client';

import { useCallback, useEffect, useState } from 'react';

async function api(path, payload, method = payload === undefined ? 'GET' : 'POST') {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: 'same-origin',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function appointmentDate(value) {
  const date = new Date(`${String(value).replace(' ', 'T').replace(/Z?$/, 'Z')}`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function money(cents) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(Number(cents || 0) / 100);
}

export default function BookingHistory() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const result = await api('me/bookings');
      setBookings(result.bookings || []);
    } catch (err) {
      setError(err.message || 'Could not load your appointments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function cancel(booking) {
    if (!window.confirm(`Cancel your ${booking.service_name} appointment at ${booking.business_name}?`)) return;
    setBusyId(booking.id); setError(''); setNotice('');
    try {
      const result = await api(`me/bookings/${booking.id}/cancel`, {}, 'POST');
      setNotice(result.late
        ? `Appointment cancelled. This is inside the shop’s ${result.cancellation_hours}-hour cancellation window. No online payment was collected by this booking system.`
        : 'Appointment cancelled. The time is available to book again.');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not cancel this appointment.');
    } finally {
      setBusyId('');
    }
  }

  const now = Date.now();
  return <section className="account-panel appointment-panel" aria-labelledby="appointment-title">
    <div className="family-heading"><div><span className="eyebrow">YOUR BOOKINGS</span><h2 id="appointment-title">Appointments</h2><p>Review your bookings and cancel future appointments here.</p></div></div>
    {error && <div className="account-alert error" role="alert">{error}</div>}
    {notice && <div className="account-alert success" role="status">{notice}</div>}
    {loading ? <p className="family-empty">Loading appointments…</p> : bookings.length === 0 ? <p className="family-empty">You have no appointments yet.</p> : <div className="appointment-list">
      {bookings.map((booking) => {
        const future = new Date(`${String(booking.starts_at).replace(' ', 'T').replace(/Z?$/, 'Z')}`).getTime() > now;
        const canCancel = booking.booking_status === 'confirmed' && future && booking.payment_status === 'not_required';
        const status = booking.booking_status.replaceAll('_', ' ');
        return <article className="appointment-item" key={booking.id}>
          <div className="appointment-main"><div className="appointment-title-row"><b>{booking.service_name}</b><span className={`appointment-status ${booking.booking_status}`}>{status}</span></div>
            <p>{booking.business_name} · {booking.location_name}{booking.city ? `, ${booking.city}` : ''}</p>
            <p>{appointmentDate(booking.starts_at)} · with {booking.professional_name}</p>
            <p>{money(booking.price_cents)} · Booking code <strong>{booking.public_code}</strong>{booking.family_profile_id ? ' · Family member' : ''}</p>
          </div>
          {canCancel && <button className="button button-outline appointment-cancel" disabled={busyId === booking.id} onClick={() => cancel(booking)}>{busyId === booking.id ? 'Cancelling…' : 'Cancel appointment'}</button>}
          {booking.booking_status === 'confirmed' && future && booking.payment_status !== 'not_required' && <p className="booking-note">Contact the shop to change this appointment; payment changes are not available online yet.</p>}
        </article>;
      })}
    </div>}
  </section>;
}
