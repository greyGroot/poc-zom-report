export const metadata = {
  title: 'Empire English CRM',
  description: 'EE CRM - Teacher Schedule and Zoom Attendance Validation',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, background: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}
