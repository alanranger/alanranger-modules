export default function Custom404() {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: '#0b0f14',
      color: '#f9fafb'
    }}>
      <h1 style={{ fontSize: '48px', marginBottom: '16px' }}>404</h1>
      <p>This page could not be found.</p>
      <a href="/academy/admin" style={{ color: '#E57200', marginTop: '24px' }}>
        Go to Admin Dashboard
      </a>
    </div>
  );
}
