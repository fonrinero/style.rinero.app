import AccountAccess from './ui/account-access';

export const metadata = { title: 'Customer account | Style by Rinero' };

export default async function AccountPage({ searchParams }) {
  const params = await searchParams;
  const verifiedEmail = params?.verified === '1' && typeof params.email === 'string' ? params.email : '';
  return <main className="results-page wrap"><AccountAccess verifiedEmail={verifiedEmail} existingAccount={params?.existing === '1'} /></main>;
}
