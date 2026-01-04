import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminDashboard() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [refreshResults, setRefreshResults] = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);

  useEffect(() => {
    addDebugLog('Dashboard initialized');
    fetchKPIs();
  }, []);

  function addDebugLog(message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, { timestamp, message, data }]);
    console.log(`[Admin Dashboard] ${timestamp}: ${message}`, data || '');
  }

  async function fetchKPIs() {
    try {
      addDebugLog('Fetching KPIs...');
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKpis(data);
      addDebugLog('KPIs loaded successfully', { counts: data });
    } catch (error) {
      addDebugLog('Failed to fetch KPIs', { error: error.message });
      console.error('Failed to fetch KPIs:', error);
    } finally {
      setLoading(false);
    }
  }

  function copyDebugLogs() {
    const logText = debugLogs.map(log => 
      `[${log.timestamp}] ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}`
    ).join('\n\n');
    
    navigator.clipboard.writeText(logText).then(() => {
      addDebugLog('Debug logs copied to clipboard');
      alert('Debug logs copied to clipboard!');
    }).catch(err => {
      addDebugLog('Failed to copy logs', { error: err.message });
    });
  }

  if (loading) {
    return (
      <div className="ar-admin-container">
        <div className="ar-admin-loading">Loading dashboard...</div>
      </div>
    );
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshProgress({ step: 'Starting refresh...', progress: 0 });
    setRefreshResults(null);
    addDebugLog('Starting data refresh from Memberstack');
    
    try {
      setRefreshProgress({ step: 'Connecting to Memberstack...', progress: 10 });
      addDebugLog('Connecting to Memberstack API');
      
      setRefreshProgress({ step: 'Syncing members and module data...', progress: 20 });
      addDebugLog('Refreshing data from Memberstack');
      
      // Refresh endpoint now handles both member sync and module events
      const res = await fetch('/api/admin/refresh', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      setRefreshProgress({ step: 'Processing response...', progress: 70 });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
        const errorMessage = errorData.error || errorData.message || `HTTP ${res.status}: ${res.statusText}`;
        addDebugLog('Refresh API error', { status: res.status, error: errorMessage, fullError: errorData });
        throw new Error(errorMessage);
      }
      
      const result = await res.json();
      addDebugLog('Refresh completed', result);
      console.log('Refresh result:', result);
      
      setRefreshProgress({ step: 'Updating dashboard...', progress: 85 });
      
      // Reload KPIs
      await fetchKPIs();
      
      // Trigger refresh of top lists
      setRefreshTrigger(prev => prev + 1);
      
      setRefreshProgress({ step: 'Complete!', progress: 100 });
      
      // Show results modal
      setRefreshResults(result);
      setShowResultsModal(true);
      
      setTimeout(() => {
        setRefreshProgress(null);
      }, 500);
      
    } catch (error) {
      addDebugLog('Refresh failed', { error: error.message, stack: error.stack });
      console.error('Refresh failed:', error);
      setRefreshProgress({ step: 'Error occurred', progress: 0, error: error.message });
      setRefreshResults({ error: error.message });
      setShowResultsModal(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="ar-admin-container">
      {/* Version Badge */}
      <VersionBadge />

      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 className="ar-admin-title">Admin Analytics Dashboard</h1>
            <p className="ar-admin-subtitle">Academy activity and engagement metrics</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className="ar-admin-btn-secondary"
              style={{ minWidth: '100px' }}
            >
              {showDebugPanel ? '🔍 Hide Debug' : '🔍 Show Debug'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="ar-admin-btn"
              style={{ 
                minWidth: '140px',
                opacity: refreshing ? 0.6 : 1,
                cursor: refreshing ? 'not-allowed' : 'pointer'
              }}
            >
              {refreshing ? 'Refreshing...' : '🔄 Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      {/* Refresh Progress Bar */}
      {refreshProgress && (
        <div className="ar-admin-card" style={{ marginBottom: '24px' }}>
          <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--ar-text)' }}>{refreshProgress.step}</div>
            <div style={{ fontSize: '14px', color: 'var(--ar-text-muted)' }}>{refreshProgress.progress}%</div>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--ar-border)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${refreshProgress.progress}%`,
              height: '100%',
              background: refreshProgress.error ? '#ef4444' : 'var(--ar-orange)',
              transition: 'width 0.3s ease',
              borderRadius: '4px'
            }} />
          </div>
          {refreshProgress.error && (
            <div style={{ marginTop: '8px', color: '#ef4444', fontSize: '14px' }}>
              Error: {refreshProgress.error}
            </div>
          )}
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && refreshResults && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => setShowResultsModal(false)}>
          <div style={{
            background: 'var(--ar-card)',
            border: '2px solid var(--ar-border)',
            borderRadius: 'var(--ar-radius)',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--ar-text)', margin: 0 }}>
                {refreshResults.error ? '❌ Refresh Failed' : '✅ Refresh Complete'}
              </h2>
              <button
                onClick={() => setShowResultsModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--ar-text-muted)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>
            
            {refreshResults.error ? (
              <div style={{ color: '#ef4444' }}>
                <p style={{ marginBottom: '12px' }}>{refreshResults.error}</p>
                <p style={{ fontSize: '14px', color: 'var(--ar-text-muted)' }}>
                  Check the debug log for more details.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  {refreshResults.total_members_fetched !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                      <span style={{ color: 'var(--ar-text-muted)' }}>Total Members Fetched:</span>
                      <span style={{ color: 'var(--ar-text)', fontWeight: 600 }}>{refreshResults.total_members_fetched || 0}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Members Processed:</span>
                    <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{refreshResults.members_processed || 0}</span>
                  </div>
                  {refreshResults.members_skipped !== undefined && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                      <span style={{ color: 'var(--ar-text-muted)' }}>Members Skipped:</span>
                      <span style={{ color: 'var(--ar-text-muted)', fontWeight: 600 }}>{refreshResults.members_skipped || 0}</span>
                      <span style={{ fontSize: '12px', color: 'var(--ar-text-muted)', fontStyle: 'italic' }}>
                        (no opened modules data)
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Events Added:</span>
                    <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{refreshResults.events_added || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Status:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Success</span>
                  </div>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--ar-text-muted)', marginTop: '16px' }}>
                  {refreshResults.message || 'Data has been synced from Memberstack to Supabase.'}
                </p>
                {refreshResults.members_skipped > 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginTop: '12px', fontStyle: 'italic' }}>
                    Note: Skipped members don't have <code>arAcademy.modules.opened</code> data in their Memberstack JSON yet.
                  </p>
                )}
              </div>
            )}
            
            <button
              onClick={() => setShowResultsModal(false)}
              className="ar-admin-btn"
              style={{ width: '100%', marginTop: '20px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="ar-admin-card" style={{ marginBottom: '24px', maxHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="ar-admin-card-title" style={{ margin: 0 }}>Debug Log</h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={copyDebugLogs}
                className="ar-admin-btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                📋 Copy Logs
              </button>
              <button
                onClick={() => setDebugLogs([])}
                className="ar-admin-btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                🗑️ Clear
              </button>
            </div>
          </div>
          <div style={{
            flex: 1,
            overflow: 'auto',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6'
          }}>
            {debugLogs.length === 0 ? (
              <div style={{ color: 'var(--ar-text-muted)', fontStyle: 'italic' }}>
                No debug logs yet. Actions will appear here.
              </div>
            ) : (
              debugLogs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: '8px', color: 'var(--ar-text)' }}>
                  <span style={{ color: 'var(--ar-text-muted)' }}>[{log.timestamp}]</span>{' '}
                  <span>{log.message}</span>
                  {log.data && (
                    <pre style={{
                      marginTop: '4px',
                      marginLeft: '20px',
                      color: 'var(--ar-text-muted)',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: '1px solid var(--ar-border)',
        paddingBottom: '12px'
      }}>
        <Link href="/academy/admin" style={{
          padding: '8px 16px',
          background: 'var(--ar-card)',
          border: '1px solid var(--ar-border)',
          borderRadius: '6px',
          color: 'var(--ar-text)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px'
        }}>
          Overview
        </Link>
        <Link href="/academy/admin/members" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Members
        </Link>
        <Link href="/academy/admin/activity" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Activity
        </Link>
        <Link href="/academy/admin/exams" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Exams
        </Link>
      </div>

      {/* Member Counts Row */}
      <div className="ar-admin-kpi-grid">
        <Link href="/academy/admin/members" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Total Members</div>
          <div className="ar-admin-kpi-value">{kpis?.totalMembers || 0}</div>
          <div className="ar-admin-kpi-period">All-time</div>
        </Link>
        <Link href="/academy/admin/members?plan=trial" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Trials</div>
          <div className="ar-admin-kpi-value">{kpis?.trials || 0}</div>
          <div className="ar-admin-kpi-period">Active trialing</div>
        </Link>
        <Link href="/academy/admin/members?plan=annual" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Annual Plans</div>
          <div className="ar-admin-kpi-value">{kpis?.annual || 0}</div>
          <div className="ar-admin-kpi-period">Active</div>
        </Link>
        <Link href="/academy/admin/members?filter=trials_expiring" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Trials Expiring</div>
          <div className="ar-admin-kpi-value">{kpis?.trialsExpiring30d || 0}</div>
          <div className="ar-admin-kpi-period">Next 30 days</div>
        </Link>
        <Link href="/academy/admin/members?filter=annual_expiring" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Annual Plans Expiring</div>
          <div className="ar-admin-kpi-value">{kpis?.annualExpiring30d || 0}</div>
          <div className="ar-admin-kpi-period">Next 30 days</div>
        </Link>
        <Link href="/academy/admin/members?filter=all_expiring" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">All Plans Expiring</div>
          <div className="ar-admin-kpi-value">{kpis?.allPlansExpiring60d || 0}</div>
          <div className="ar-admin-kpi-period">Next 60 days</div>
        </Link>
      </div>

      {/* Signups Row */}
      <div className="ar-admin-kpi-grid">
        <Link href="/academy/admin/members?sort=created_at&order=desc" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">New Signups</div>
          <div className="ar-admin-kpi-value">{kpis?.signups24h || 0}</div>
          <div className="ar-admin-kpi-period">24 hours</div>
        </Link>
        <Link href="/academy/admin/members?sort=created_at&order=desc" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">New Signups</div>
          <div className="ar-admin-kpi-value">{kpis?.signups7d || 0}</div>
          <div className="ar-admin-kpi-period">7 days</div>
        </Link>
        <Link href="/academy/admin/members?sort=created_at&order=desc" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">New Signups</div>
          <div className="ar-admin-kpi-value">{kpis?.signups30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/activity?period=24h" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers24h || 0}</div>
          <div className="ar-admin-kpi-period">24 hours</div>
        </Link>
        <Link href="/academy/admin/activity?period=7d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers7d || 0}</div>
          <div className="ar-admin-kpi-period">7 days</div>
        </Link>
        <Link href="/academy/admin/activity?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
      </div>

      {/* Engagement Row */}
      <div className="ar-admin-kpi-grid">
        <Link href="/academy/admin/modules?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Avg Modules Opened</div>
          <div className="ar-admin-kpi-value">{kpis?.avgModulesOpened30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days per member</div>
        </Link>
        <Link href="/academy/admin/modules?period=30d&unique=true" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Unique Modules</div>
          <div className="ar-admin-kpi-value">{kpis?.uniqueModulesOpened30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/exams?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Avg Exam Attempts</div>
          <div className="ar-admin-kpi-value">{kpis?.avgExamAttempts30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days per member</div>
        </Link>
        <Link href="/academy/admin/exams?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Exam Attempts</div>
          <div className="ar-admin-kpi-value">{kpis?.examAttempts30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/exams?period=30d&metric=pass_rate" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Pass Rate</div>
          <div className="ar-admin-kpi-value">{kpis?.passRate30d ? `${kpis.passRate30d}%` : '0%'}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/activity?event_type=bookmark_add&period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Bookmarks Added</div>
          <div className="ar-admin-kpi-value">{kpis?.bookmarks30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
      </div>

      {/* Top Lists */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '32px' }}>
        <div className="ar-admin-card">
          <h2 className="ar-admin-card-title">Top 20 Modules by Opens (30d)</h2>
          <TopModulesList refreshTrigger={refreshTrigger} />
        </div>
        <div className="ar-admin-card">
          <h2 className="ar-admin-card-title">Most Active Members (30d)</h2>
          <TopMembersList refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
}

function TopModulesList({ refreshTrigger }) {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchModules();
  }, [refreshTrigger]);

  async function fetchModules() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/top-modules?limit=20&period=30d');
      const data = await res.json();
      setModules(data);
    } catch (err) {
      console.error('Failed to fetch top modules:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="ar-admin-loading">Loading...</div>;
  if (modules.length === 0) return <div className="ar-admin-empty">No data available</div>;

  return (
    <table className="ar-admin-table">
      <thead>
        <tr>
          <th>Module</th>
          <th>Opens</th>
          <th>Unique</th>
        </tr>
      </thead>
      <tbody>
        {modules.map((module, idx) => (
          <tr key={idx}>
            <td>{module.title || module.path}</td>
            <td>{module.opens}</td>
            <td>{module.unique_openers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VersionBadge() {
  const [version, setVersion] = useState('dev');
  const [buildDate, setBuildDate] = useState('');

  useEffect(() => {
    // Fetch version from API endpoint (Vercel env vars are server-side only)
    fetch('/api/admin/version')
      .then(res => res.json())
      .then(data => {
        if (data.version && data.version !== 'dev') {
          setVersion(data.version.substring(0, 7));
        }
      })
      .catch(() => {
        // Fallback: try client-side env var (set at build time)
        const envVersion = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
        if (envVersion) {
          setVersion(envVersion.substring(0, 7));
        }
      });
    
    // Set build date
    const now = new Date();
    setBuildDate(now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
  }, []);

  return (
      <div style={{
      position: 'fixed',
      top: '16px',
      left: '16px',
      background: 'var(--ar-card)',
      border: '1px solid var(--ar-border)',
      borderRadius: '8px',
      padding: '8px 12px',
      fontSize: '11px',
      color: 'var(--ar-text-muted)',
      fontFamily: 'monospace',
      zIndex: 100,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      cursor: 'default'
    }}>
      <div>Version: <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{version}</span></div>
      <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.7 }}>
        {buildDate}
      </div>
    </div>
  );
}

function TopMembersList({ refreshTrigger }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMembers();
  }, [refreshTrigger]);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/top-members?limit=20&period=30d');
      const data = await res.json();
      setMembers(data);
    } catch (err) {
      console.error('Failed to fetch top members:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="ar-admin-loading">Loading...</div>;
  if (members.length === 0) return <div className="ar-admin-empty">No data available</div>;

  return (
    <table className="ar-admin-table">
      <thead>
        <tr>
          <th>Member</th>
          <th>Events</th>
          <th>Modules</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member, idx) => (
          <tr key={idx}>
            <td>{member.email || member.member_id || 'Unknown'}</td>
            <td>{member.event_count}</td>
            <td>{member.module_opens}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
