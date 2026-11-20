'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import BookingHistory from './booking-history';

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

export default function AccountAccess({ verifiedEmail = '', existingAccount = false }) {
  const [mode, setMode] = useState(verifiedEmail && !existingAccount ? 'register' : 'signin');
  const [authMethod, setAuthMethod] = useState('password');
  const [form, setForm] = useState({ email: verifiedEmail, first_name: '', last_name: '', phone: '', age: '', gender: 'unspecified' });
  const [user, setUser] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileForm, setProfileForm] = useState({ name: '', age: '', gender: 'unspecified' });
  const [editingProfile, setEditingProfile] = useState(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('auth/me').then(async (data) => { setUser(data.user); const result = await api('me/family-profiles'); setProfiles(result.profiles || []); }).catch(() => {}); }, []);
  function update(event) { setForm({ ...form, [event.target.name]: event.target.value }); }
  async function run(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (authMethod === 'password' && mode === 'register') {
        if (!verifiedEmail) {
          await api('auth/email/request', { email: form.email, return_to: '/account' });
          setMessage('If this email can be used, a verification link has been sent. Open it on this device to continue registration.');
          return;
        }
        const payload = { email: form.email, password: form.password, display_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(), phone: form.phone.trim(), age: form.age === '' ? null : Number(form.age), gender: form.gender };
        const result = await api('auth/password/register', payload);
        setUser(result.user); setProfiles([]); setMessage('Your account is ready.');
      } else if (authMethod === 'password') {
        const result = await api('auth/password/login', { email: form.email, password: form.password });
        setUser(result.user); setMessage('You are signed in.');
      } else if (mode === 'register') {
        if (!verifiedEmail) {
          await api('auth/email/request', { email: form.email, return_to: '/account' });
          setMessage('If this email can be used, a verification link has been sent. Open it on this device to continue registration.');
          return;
        }
        const payload = {
          email: form.email,
          display_name: `${form.first_name.trim()} ${form.last_name.trim()}`.trim(),
          phone: form.phone.trim(),
          age: form.age === '' ? null : Number(form.age),
          gender: form.gender
        };
        const optionsJSON = await api('auth/register/options', payload);
        const credential = await startRegistration({ optionsJSON });
        const result = await api('auth/register/verify', credential);
        setUser(result.user); setProfiles([]); setMessage('Your account is ready. Your passkey is saved on this device or password manager.');
      } else {
        const optionsJSON = await api('auth/login/options', { email: form.email });
        const credential = await startAuthentication({ optionsJSON });
        const result = await api('auth/login/verify', credential);
        setUser(result.user); setMessage('You are signed in.');
      }
    } catch (err) { setError(err.message || (authMethod === 'passkey' ? 'Passkey sign-in was cancelled or failed.' : 'Email and password could not be accepted.')); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await api('auth/logout', {}); setUser(null); setMessage('You have signed out.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function addProfile(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api('me/family-profiles', { ...profileForm, age: Number(profileForm.age) }, 'POST'); setProfiles((items) => [...items, result.profile]); setProfileForm({ name: '', age: '', gender: 'unspecified' }); setShowProfileForm(false); setMessage('Family profile added.'); }
    catch (err) { setError(err.message || 'Could not add this family profile.'); }
    finally { setBusy(false); }
  }
  async function saveProfile(event) {
    event.preventDefault(); if (!editingProfile) return; setBusy(true); setError('');
    try { const result = await api(`me/family-profiles/${editingProfile.id}`, { name: editingProfile.name, age: Number(editingProfile.age), gender: editingProfile.gender }, 'PATCH'); setProfiles((items) => items.map((item) => item.id === result.profile.id ? result.profile : item)); setEditingProfile(null); setMessage('Family profile updated.'); }
    catch (err) { setError(err.message || 'Could not update this family profile.'); }
    finally { setBusy(false); }
  }
  async function deleteProfile(id) {
    if (!window.confirm('Remove this family profile?')) return; setBusy(true); setError('');
    try { await api(`me/family-profiles/${id}`, {}, 'DELETE'); setProfiles((items) => items.filter((item) => item.id !== id)); setMessage('Family profile removed.'); }
    catch (err) { setError(err.message || 'Could not remove this family profile.'); }
    finally { setBusy(false); }
  }

  return <>
    <Link className="back-link" href="/">← Style by Rinero</Link>
    <div className="results-heading"><span className="eyebrow">CUSTOMER ACCOUNT</span><h1>{user ? `Hello, ${user.display_name}.` : mode === 'register' ? 'Create your account.' : 'Welcome back.'}</h1><p>{user ? 'Your account is ready for your next appointment.' : 'Sign in with an email and password, or use a passkey on your phone or computer.'}</p></div>
    {error && <div className="account-alert error" role="alert">{error}</div>}
    {message && <div className="account-alert success" role="status">{message}</div>}
    {user ? <><section className="account-panel"><b>{user.email}</b><p>Signed in to your Style by Rinero account.</p><button className="button button-orange" disabled={busy} onClick={logout}>{busy ? 'Please wait…' : 'Sign out'}</button></section>
      <BookingHistory />
      <section className="account-panel family-panel"><div className="family-heading"><div><span className="eyebrow">BOOK FOR YOUR FAMILY</span><h2>Family profiles</h2><p>Add up to five people. Choose who the appointment is for when booking.</p></div><span className="family-count">{profiles.length}/5</span></div>
        {profiles.length ? <div className="family-list">{profiles.map((profile) => editingProfile?.id === profile.id ? <form className="family-item family-editor" key={profile.id} onSubmit={saveProfile}>
          <label>Name<input required maxLength="100" value={editingProfile.name} onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}/></label><label>Age<input required type="number" min="0" max="120" value={editingProfile.age} onChange={(e) => setEditingProfile({ ...editingProfile, age: e.target.value })}/></label><label>Gender<select value={editingProfile.gender} onChange={(e) => setEditingProfile({ ...editingProfile, gender: e.target.value })}><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option><option value="unspecified">Prefer not to say</option></select></label><div className="family-actions"><button className="button button-orange" disabled={busy}>Save</button><button type="button" className="account-switch" onClick={() => setEditingProfile(null)}>Cancel</button></div>
        </form> : <article className="family-item" key={profile.id}><div><b>{profile.name}</b><span>{profile.age} · {profile.gender === 'unspecified' ? 'Gender not set' : profile.gender}</span></div><div className="family-actions"><button className="account-switch" disabled={busy} onClick={() => setEditingProfile({ ...profile, age: String(profile.age) })}>Edit</button><button className="account-switch danger-link" disabled={busy} onClick={() => deleteProfile(profile.id)}>Remove</button></div></article>)}</div> : <p className="family-empty">No family profiles added yet.</p>}
        {showProfileForm ? <form className="family-item family-editor" onSubmit={addProfile}><label>Name<input required maxLength="100" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}/></label><label>Age<input required type="number" min="0" max="120" value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}/></label><label>Gender<select value={profileForm.gender} onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value })}><option value="male">Male</option><option value="female">Female</option><option value="nonbinary">Non-binary</option><option value="unspecified">Prefer not to say</option></select></label><div className="family-actions"><button className="button button-orange" disabled={busy}>Add profile</button><button type="button" className="account-switch" onClick={() => setShowProfileForm(false)}>Cancel</button></div></form> : profiles.length < 5 && <button className="button button-orange family-add" disabled={busy} onClick={() => setShowProfileForm(true)}>+ Add family member</button>}
      </section></> : <form className="account-panel account-form" onSubmit={run}>
      {mode === 'register' && <>
        <div className="account-fields"><label>First name<input name="first_name" autoComplete="given-name" required maxLength="80" value={form.first_name} onChange={update}/></label><label>Last name<input name="last_name" autoComplete="family-name" required maxLength="80" value={form.last_name} onChange={update}/></label></div>
        <label>Phone number<input name="phone" type="tel" autoComplete="tel" required value={form.phone} onChange={update} maxLength="32"/></label>
        <div className="account-fields"><label>Age<input name="age" type="number" min="13" max="120" value={form.age} onChange={update}/></label><label>Gender<select name="gender" value={form.gender} onChange={update}><option value="unspecified">Prefer not to say</option><option value="male">Man</option><option value="female">Woman</option><option value="nonbinary">Non-binary</option></select></label></div>
        <p className="account-help">Family profiles for children can be added after account setup.</p>
      </>}
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength="254" value={form.email} readOnly={Boolean(mode === 'register' && verifiedEmail && !existingAccount)} onChange={update}/></label>
      {mode === 'register' && verifiedEmail && <p className="account-help">Email verified. Complete your account setup below.</p>}
      <div className="auth-methods" role="group" aria-label="Sign-in method"><button type="button" className={authMethod === 'password' ? 'selected' : ''} onClick={() => setAuthMethod('password')}>Email & password</button><button type="button" className={authMethod === 'passkey' ? 'selected' : ''} onClick={() => setAuthMethod('passkey')}>Passkey</button></div>
      {authMethod === 'password' && <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="10" maxLength="128" required value={form.password || ''} onChange={update}/></label>}
      {authMethod === 'password' && mode === 'register' && <p className="account-help">Use at least 10 characters. Password reset is not available yet.</p>}
      <button className="button button-orange account-submit" disabled={busy}>{busy ? (authMethod === 'passkey' ? 'Waiting for your device…' : 'Please wait…') : authMethod === 'passkey' ? (mode === 'register' ? 'Create account with passkey' : 'Continue with passkey') : (mode === 'register' ? 'Create account' : 'Sign in')}</button>
      {!existingAccount && <button type="button" className="account-switch" onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(''); setMessage(''); }}>{mode === 'register' ? 'Already registered? Sign in' : 'New to Style? Create an account'}</button>}
    </form>}
  </>;
}
