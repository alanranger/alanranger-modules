import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SortableTable from '../../../components/admin/SortableTable';

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
          <SortableTable
            columns={[
              {
                key: 'path',
                label: 'Path',
                sortValue: (m) => m.path,
                render: (m) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{m.path}</span>,
              },
              { key: 'title', label: 'Title', sortValue: (m) => m.title || '' },
              { key: 'category', label: 'Category', sortValue: (m) => m.category || '' },
              { key: 'opens', label: 'Opens', sortValue: (m) => m.opens ?? 0 },
              { key: 'unique_openers', label: 'Unique Openers', sortValue: (m) => m.unique_openers ?? 0 },
              {
                key: 'last_opened_at',
                label: 'Last Opened',
                sortValue: (m) => m.last_opened_at || '',
                render: (m) => (m.last_opened_at ? new Date(m.last_opened_at).toLocaleString() : '-'),
              },
            ]}
            rows={modules}
            rowKey={(m) => m.path}
            defaultSort="opens"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
            onRowClick={(m) => handleRowClick(m.path)}
          />

          {selectedModule && moduleDetails && (
            <div className="ar-admin-card" style={{ marginTop: '24px' }}>
              <h2 className="ar-admin-card-title">
                Details: {moduleDetails.title || selectedModule}
              </h2>
              
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Users who opened this module
                </h3>
                <SortableTable
                  columns={[
                    {
                      key: 'member_id',
                      label: 'Member ID',
                      sortValue: (u) => u.member_id || '',
                      render: (u) => (
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {u.member_id?.substring(0, 12)}...
                        </span>
                      ),
                    },
                    { key: 'email', label: 'Email', sortValue: (u) => u.email || '' },
                    { key: 'opens', label: 'Opens', sortValue: (u) => u.opens ?? 0 },
                    {
                      key: 'last_at',
                      label: 'Last Opened',
                      sortValue: (u) => u.last_at || '',
                      render: (u) => new Date(u.last_at).toLocaleString(),
                    },
                  ]}
                  rows={moduleDetails.users || []}
                  rowKey={(u, i) => u.member_id || i}
                  defaultSort="opens"
                  defaultDir="desc"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
