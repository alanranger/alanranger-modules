import '../styles/admin-globals.css';
import { useRouter } from 'next/router';
import { AdminSessionCacheProvider } from '../components/admin/AdminSessionCacheProvider';

function App({ Component, pageProps }) {
  const router = useRouter();
  const isAdminRoute = router.pathname.startsWith('/academy/admin');

  if (isAdminRoute) {
    return (
      <AdminSessionCacheProvider>
        <Component {...pageProps} />
      </AdminSessionCacheProvider>
    );
  }

  return <Component {...pageProps} />;
}

export default App;
