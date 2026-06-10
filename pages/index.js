import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to admin dashboard
    router.push('/academy/admin');
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      background: '#0b0f14',
      color: '#f9fafb'
    }}>
      <p>Redirecting to admin dashboard...</p>
    </div>
  );
}
