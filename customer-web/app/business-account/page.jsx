import Link from 'next/link';
import BusinessAccess from './business-access';

export const metadata = { title: 'Business account | Style by Rinero' };
export default async function BusinessAccountPage({ searchParams }) {
  const params = await searchParams;
  const verifiedEmail = params?.verified === '1' && typeof params.email === 'string' ? params.email : '';
  return <main className="results-page wrap"><Link className="back-link" href="/business">← Business space</Link><div className="results-heading"><span className="eyebrow">BUSINESS ACCESS</span><h1>Your shop account.</h1><p>Business owners use a separate passkey account. Staff invitations are still being built.</p></div><BusinessAccess verifiedEmail={verifiedEmail} existingAccount={params?.existing === '1'} initialMode={params?.mode === 'register' ? 'register' : 'signin'} /></main>;
}
