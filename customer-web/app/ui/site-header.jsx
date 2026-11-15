'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Controls from './controls';
import { T } from './language-provider';

export default function SiteHeader() {
  const pathname = usePathname();
  const home = pathname === '/';
  const href = (section) => home ? `#${section}` : `/#${section}`;
  return <header className={`topbar${home ? ' home-topbar' : ''}`}>
    <Link className="brand" href="/" aria-label="Rstyle by Rinero home"><span className="brand-icon">R</span><span className="brand-wordmark">RSTYLE<small>BY RINERO</small></span></Link>
    <nav><Link href="/search"><T>Discover</T></Link><Link href={href('how')}><T>How it works</T></Link><Link href="/business"><T>For businesses</T></Link><Link href="/opportunities"><T>Jobs & chairs</T></Link></nav>
    <div className="top-actions"><Controls/><Link className="button button-orange small" href="/account"><T>Sign in</T></Link></div>
  </header>;
}
