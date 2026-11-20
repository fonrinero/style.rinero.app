'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VerifyEmail() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const supplied = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    window.history.replaceState(null, '', window.location.pathname);
    setToken(supplied);
    if (!supplied) setError('This verification link is invalid or expired. Request a new one.');
  }, []);
  async function confirm() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/v1/auth/email/verify', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'This verification link could not be used.');
      const target = result.return_to === '/business-account' ? '/business-account' : '/account';
      const params = new URLSearchParams({ verified: '1', email: result.email || '' });
      if (!result.can_register) params.set('existing', '1');
      router.replace(`${target}?${params.toString()}`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <main className="results-page wrap"><section className="account-panel account-form">
    <span className="eyebrow">EMAIL VERIFICATION</span><h1>Confirm your email.</h1>
    <p>Press the button to verify this address and continue. This link can only be used once.</p>
    {error && <div className="account-alert error" role="alert">{error}</div>}
    <button className="button button-orange account-submit" disabled={busy || !token} onClick={confirm}>{busy ? 'Verifying…' : 'Verify email and continue'}</button>
  </section></main>;
}
