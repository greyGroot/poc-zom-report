import './globals.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import Header from './components/Header';

export const metadata = {
  title: 'Empire English CRM',
  description: 'EE CRM - Teacher Schedule Sync & Zoom Attendance Reconciliation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <Header />
          <main className="main-content">
            {children}
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
