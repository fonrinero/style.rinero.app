import Link from 'next/link';
import BusinessAccess from './business-access';

export const metadata = { title: 'Business account | Style by Rinero' };
export default function BusinessAccountPage() { return <main className="results-page wrap"><Link className="back-link" href="/business">← Business space</Link><div className="results-heading"><span className="eyebrow">BUSINESS ACCESS</span><h1>Your shop account.</h1><p>Business owners use a separate passkey account. Staff invitations are still being built.</p></div><BusinessAccess /></main>; }
