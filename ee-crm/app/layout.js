import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Empire English CRM',
  description: 'EE CRM - Teacher Schedule Sync & Zoom Attendance Reconciliation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="navbar">
          <div className="nav-inner">
            <Link href="/" className="nav-brand">
              <span>Empire English CRM</span>
              <span className="brand-badge">v.0.0.1</span>
            </Link>

            <nav className="nav-links">
              <Link href="/" className="nav-link">
                <span>👥</span>
                <span>Teachers</span>
              </Link>
              <Link href="/logs" className="nav-link">
                <span>📋</span>
                <span>System Logs</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="main-content">
          {children}
        </main>
      </body>
    </html>
  );
}
