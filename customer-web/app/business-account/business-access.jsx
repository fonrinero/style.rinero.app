'use client';

import { useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

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

const categories = ['Barbershop','Hair salon','Nail salon','Beauty salon','Massage studio','Other'];

export default function BusinessAccess() {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', businessName: '', category: 'Barbershop' });
  const [businesses, setBusinesses] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(event) { setForm({ ...form, [event.target.name]: event.target.value }); }

  async function signOut() {
    await api('auth/logout', {}); setUser(null); setBusinesses([]);
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'register') {
        const displayName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
        const optionsJSON = await api('auth/register/options', {
          account_type: 'business', email: form.email, display_name: displayName, phone: form.phone,
          business_name: form.businessName, business_category: form.category
        });
        const credential = await startRegistration({ optionsJSON });
        const result = await api('auth/register/verify', credential);
        setUser(result.user);
      } else {
        const optionsJSON = await api('auth/login/options', { email: form.email });
        const credential = await startAuthentication({ optionsJSON });
        const result = await api('auth/login/verify', credential);
        if (!['business_owner','staff','admin'].includes(result.user.role)) {
          await api('auth/logout', {});
          throw new Error('This is a customer account. Use the customer sign-in page instead.');
        }
        setUser(result.user);
      }
      const result = await api('businesses/mine');
      setBusinesses(result.businesses || []);
    } catch (err) { setError(err.message || 'Passkey sign-in was cancelled or failed.'); }
    finally { setBusy(false); }
  }

  if (user) return <section className="business-access-panel">
    <div className="business-access-heading"><div><span className="eyebrow">BUSINESS SPACE</span><h2>Welcome, {user.display_name}.</h2><p>Signed in with your passkey.</p></div><button className="button button-outline" onClick={signOut}>Sign out</button></div>
    {businesses.length ? <div className="business-access-list">{businesses.map((business) => <article key={business.id}><div><b>{business.name}</b><span>{business.category} · {business.access_role}</span></div><span className={`business-state ${business.status}`}>{business.status}</span></article>)}</div> : <div className="account-alert error">No business is linked to this account. Ask the business owner to invite this email.</div>}
    {businesses.some((business) => business.status === 'pending') && <p className="account-help">Your business profile is awaiting activation. Service, staff, and schedule management will appear after the business setup tools are connected.</p>}
  </section>;

  return <form className="account-panel account-form business-access-panel" onSubmit={submit}>
    {error && <div className="account-alert error" role="alert">{error}</div>}
    <div><span className="eyebrow">{mode === 'register' ? 'NEW BUSINESS' : 'BUSINESS ACCESS'}</span><h2>{mode === 'register' ? 'Create your owner account.' : 'Sign in to your shop.'}</h2><p>{mode === 'register' ? 'Your passkey protects the business account. You can add staff after setup.' : 'Use the passkey saved on your device or password manager.'}</p></div>
    {mode === 'register' && <>
      <div className="account-fields"><label>First name<input name="firstName" autoComplete="given-name" required maxLength="80" value={form.firstName} onChange={update}/></label><label>Last name<input name="lastName" autoComplete="family-name" required maxLength="80" value={form.lastName} onChange={update}/></label></div>
      <label>Phone number<input name="phone" type="tel" autoComplete="tel" required maxLength="32" value={form.phone} onChange={update}/></label>
      <label>Business name<input name="businessName" required maxLength="180" value={form.businessName} onChange={update}/></label>
      <label>Business type<select name="category" value={form.category} onChange={update}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
    </>}
    <label>Email address<input name="email" type="email" autoComplete="email" required maxLength="254" value={form.email} onChange={update}/></label>
    <button className="button button-orange account-submit" disabled={busy}>{busy ? 'Waiting for your device…' : mode === 'register' ? 'Create owner account with passkey' : 'Continue with passkey'}</button>
    <button type="button" className="account-switch" onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(''); }}>{mode === 'register' ? 'Already have a business account? Sign in' : 'New business? Create an owner account'}</button>
  </form>;
}
