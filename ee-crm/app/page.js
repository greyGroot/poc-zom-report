export default function HomePage() {
  return (
    <div style={{ maxWidth: 700, margin: '60px auto', padding: 32, background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
      <h1 style={{ margin: '0 0 12px 0', fontSize: 24, color: '#0f172a' }}>Empire English CRM</h1>
      <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.6 }}>
        Infrastructure deployment successful. Core integrations and persistence layer active.
      </p>
      <div style={{ marginTop: 24, padding: 16, background: '#f1f5f9', borderRadius: 8 }}>
        <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>
          🩺 <strong>Health Check:</strong> <a href="/api/health" style={{ color: '#2563eb', textDecoration: 'none' }}>/api/health</a>
        </p>
      </div>
    </div>
  );
}
