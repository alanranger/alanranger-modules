import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ModulesPage() {
  const router = useRouter();
  const { period = '30d', category } = router.query;
  
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState(null);
  const [moduleDetails, setModuleDetails] = useState(null);

  useEffect(() => {
    fetchModules();
  }, [router.query]);

  async function fetchModules() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period: period,
        ...(category && { category })
      });
      
      const res = await fetch(`/api/admin/modules?${params}`);
      const data = await res.json();
      setModules(data);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchModuleDetails(path) {
    try {
      const res = await fetch(`/api/admin/modules/detail?path=${encodeURIComponent(path)}&period=${period}`);
      const data = await res.json();
      setModuleDetails(data);
    } catch (error) {
      console.error('Failed to fetch module details:', error);
    }
  }

  function handleRowClick(path) {
    if (selectedModule === path) {
      setSelectedModule(null);
      setModuleDetails(null);
    } else {
      setSelectedModule(path);
      fetchModuleDetails(path);
    }
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <Link href="/academy/admin" style={{ color: 'var(--ar-orange)', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>
        <h1 className="ar-admin-title">Module Analytics</h1>
        <p className="ar-admin-subtitle">Module engagement and opens by path</p>
      </div>

      <div className="ar-admin-filters">
        <select
          className="ar-admin-select"
          value={period}
          onChange={(e) => router.push({ query: { ...router.query, period: e.target.value } })}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>

        <select
          className="ar-admin-select"
          value={category || ''}
          onChange={(e) => router.push({ 
            query: { ...router.query, category: e.target.value || undefined } 
          })}
        >
          <option value="">All Categories</option>
          <option value="camera">Camera</option>
          <option value="gear">Gear</option>
          <option value="composition">Composition</option>
          <option value="genre">Genre</option>
        </select>
      </div>

      {loading ? (
        <div className="ar-admin-loading">Loading modules...</div>
      ) : modules.length === 0 ? (
        <div className="ar-admin-empty">No modules found</div>
      ) : (
        <>
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Opens</th>
                  <th>Unique Openers</th>
                  <th>Last Opened</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((module) => (
                  <tr 
                    key={module.path}
                    onClick={() => handleRowClick(module.path)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {module.path}
                    </td>
                    <td>{module.title || '-'}</td>
                    <td>{module.category || '-'}</td>
                    <td>{module.opens}</td>
                    <td>{module.unique_openers}</td>
                    <td>
                      {module.last_opened_at 
                        ? new Date(module.last_opened_at).toLocaleString()
                        : '-'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedModule && moduleDetails && (
            <div className="ar-admin-card" style={{ marginTop: '24px' }}>
              <h2 className="ar-admin-card-title">
                Details: {moduleDetails.title || selectedModule}
              </h2>
              
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Users who opened this module
                </h3>
                <table className="ar-admin-table">
                  <thead>
                    <tr>
                      <th>Member ID</th>
                      <th>Email</th>
                      <th>Opens</th>
                      <th>Last Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moduleDetails.users?.map((user, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {user.member_id?.substring(0, 12)}...
                        </td>
                        <td>{user.email || '-'}</td>
                        <td>{user.opens}</td>
                        <td>{new Date(user.last_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
