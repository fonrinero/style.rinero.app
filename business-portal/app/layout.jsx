import './portal.css';

export const metadata = {
  title: 'Business portal | Style by Rinero',
  description: 'Manage your salon, team, services, appointments and payments.'
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
