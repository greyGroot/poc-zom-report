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
              <span className="brand-icon">🎓</span>
              <span>Empire English CRM</span>
              <span className="brand-badge">EE CRM v1.0</span>
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
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link"
                title="View JSON Health Probe"
              >
                <span>🩺</span>
                <span>Health</span>
              </a>
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
