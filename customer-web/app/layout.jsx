import './globals.css';
import { LanguageProvider } from './ui/language-provider';
import SiteHeader from './ui/site-header';

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://style.rinero.app'),
  title: { default: 'Style by Rinero | Find your people. Book your style.', template: '%s | Style by Rinero' },
  description: 'Find barbers, hair salons, nail studios and wellness professionals in Ireland. Compare services, prices and appointment times, then book online.',
  openGraph: { title: 'Style by Rinero', description: 'Find your people. Book your style.', type: 'website' },
  robots: { index: true, follow: true }
};

// A per-request nonce is required for inline Next.js bootstrap scripts.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  return <html lang="en" data-theme="dark"><body><LanguageProvider><SiteHeader/>{children}</LanguageProvider></body></html>;
}
