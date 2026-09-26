import './globals.css';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import AuthProvider from './components/AuthProvider';
import Header from './components/Header';

export const metadata = {
  title: 'Empire English CRM',
  description: 'EE CRM - Teacher Schedule Sync & Zoom Attendance Reconciliation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <LanguageProvider>
            {process.env.NEXT_PUBLIC_EE_CRM_AUTH_BYPASS === 'true' && (
              <aside className="auth-bypass-notice" role="status" aria-label="Environment notice">
                <span className="sr-only">Environment notice: </span>
                <span>Authentication bypass is active — testing only</span>
              </aside>
            )}
            <Header />
            <main className="main-content">
              {children}
            </main>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

