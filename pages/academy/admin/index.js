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

  async function fetchKPIs(forceStripeRefresh = false) {
    try {
      addDebugLog('Fetching KPIs...');
      // If forcing refresh, also refresh Stripe metrics cache
      if (forceStripeRefresh) {
        try {
          await fetch('/api/stripe/metrics?force=1');
          addDebugLog('Stripe metrics cache refreshed');
        } catch (err) {
          console.warn('Failed to refresh Stripe cache:', err);
        }
      }
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
      
      // Reload KPIs with forced Stripe refresh
      await fetchKPIs(true);
      
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
                {/* Summary Stats */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Members Fetched:</span>
                    <span style={{ color: 'var(--ar-text)', fontWeight: 600 }}>{refreshResults.members_fetched || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Members Processed:</span>
                    <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{refreshResults.members_upserted || 0}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--ar-border)' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Events Added:</span>
                    <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{refreshResults.events_upserted || 0}</span>
                  </div>
                </div>

                {/* Plan Type Breakdown */}
                {(refreshResults.new_trials > 0 || refreshResults.new_annual > 0 || refreshResults.updated_members > 0) && (
                  <div style={{ marginTop: '16px', marginBottom: '16px', paddingTop: '16px', borderTop: '1px solid var(--ar-border)' }}>
                    <div style={{ color: 'var(--ar-text-muted)', fontSize: '12px', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Changes Detected
                    </div>
                    {refreshResults.new_trials > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: 'var(--ar-text-muted)' }}>New Trial Members:</span>
                        <span style={{ color: 'rgba(245,158,11,0.95)', fontWeight: 600 }}>+{refreshResults.new_trials}</span>
                      </div>
                    )}
                    {refreshResults.new_annual > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: 'var(--ar-text-muted)' }}>New Annual Members:</span>
                        <span style={{ color: 'rgba(34,197,94,0.95)', fontWeight: 600 }}>+{refreshResults.new_annual}</span>
                      </div>
                    )}
                    {refreshResults.updated_members > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ color: 'var(--ar-text-muted)' }}>Updated Members:</span>
                        <span style={{ color: 'var(--ar-text)', fontWeight: 600 }}>{refreshResults.updated_members}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Message */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--ar-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--ar-text-muted)' }}>Status:</span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Success</span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--ar-text-muted)', marginTop: '12px', lineHeight: '1.5' }}>
                    {refreshResults.message || 'Data has been synced from Memberstack to Supabase.'}
                  </p>
                </div>
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
        <>
          {/* Stripe Debug Info */}
          {kpis?.stripe && (
            <div className="ar-admin-card" style={{ marginBottom: '16px' }}>
              <h2 className="ar-admin-card-title" style={{ marginBottom: '16px' }}>Stripe Debug Info</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Key Mode:</span>
                  <span style={{ marginLeft: '8px', fontWeight: 600, color: kpis.stripe.stripe_key_mode === 'live' ? '#10b981' : '#f59e0b' }}>
                    {kpis.stripe.stripe_key_mode || 'unknown'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Annual Price ID:</span>
                  <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {kpis.stripe.annual_price_id_used || 'not set'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Invoices Found:</span>
                  <span style={{ marginLeft: '8px', fontWeight: 600 }}>
                    {kpis.stripe.debug_invoices_found ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Annual Invoices Matched:</span>
                  <span style={{ marginLeft: '8px', fontWeight: 600 }}>
                    {kpis.stripe.debug_annual_invoices_matched ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Paid Annual Invoices:</span>
                  <span style={{ marginLeft: '8px', fontWeight: 600 }}>
                    {kpis.stripe.paid_annual_invoices_count_all_time || 0}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--ar-text-muted)' }}>Annual Revenue (pennies):</span>
                  <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '12px' }}>
                    {kpis.stripe.debug_annual_revenue_pennies_sum ?? 'N/A'}
                  </span>
                </div>
                {kpis.stripe.debug_sample_annual_invoice_ids && kpis.stripe.debug_sample_annual_invoice_ids.length > 0 && (
                  <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                    <div style={{ color: 'var(--ar-text-muted)', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                      Sample Annual Invoice IDs:
                    </div>
                    {kpis.stripe.debug_sample_annual_invoice_ids.map((inv, idx) => (
                      <div key={idx} style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '12px', 
                        padding: '8px', 
                        background: 'var(--ar-bg)',
                        borderRadius: '4px',
                        marginTop: '4px',
                        border: '1px solid var(--ar-border)'
                      }}>
                        <div><strong>ID:</strong> {inv.id}</div>
                        <div><strong>Total:</strong> £{Math.round(inv.total)}</div>
                        {inv.amount_paid && <div><strong>Amount Paid:</strong> £{Math.round(inv.amount_paid)}</div>}
                        <div><strong>Created:</strong> {new Date(inv.created).toLocaleString()}</div>
                        <div><strong>Billing Reason:</strong> {inv.billing_reason}</div>
                        <div><strong>Currency:</strong> {inv.currency}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
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
        </>
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
        <Link href="/academy/admin/qa" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Q&A
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
          <div className="ar-admin-kpi-value">{kpis?.trials ?? 0}</div>
          <div className="ar-admin-kpi-period">Active</div>
        </Link>
        <Link href="/academy/admin/members?plan=annual" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Annual Plans</div>
          <div className="ar-admin-kpi-value">{kpis?.stripe?.annual_active_count ?? kpis?.annual ?? 0}</div>
          <div className="ar-admin-kpi-period">Active (Stripe)</div>
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
          <div className="ar-admin-kpi-value">{kpis?.allPlansExpiring7d || 0}</div>
          <div className="ar-admin-kpi-period">Next 7 days</div>
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


      {/* Revenue & Retention Row */}
      <div style={{ marginTop: '32px' }}>
        <h2 className="ar-admin-card-title" style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 700 }}>
          Revenue & Retention
        </h2>
        <div className="ar-admin-kpi-grid">
          <div 
            className="ar-admin-kpi-tile" 
            title="Conversion rate: Of all people who ever had a trial, what % converted to annual in the last 30 days? Formula: (Conversions in last 30d) / (All people who ever had a trial) × 100. This shows recent conversion activity regardless of when the trial ended."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Trial → Annual Conversion
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.trialConversionRate30d !== null && kpis?.bi?.trialConversionRate30d !== undefined
                ? `${kpis.bi.trialConversionRate30d}%`
                : (kpis?.bi?.trialToAnnualConversions30d > 0 
                  ? `${kpis.bi.trialToAnnualConversions30d}`
                  : '—')}
            </div>
            <div className="ar-admin-kpi-period">
              {kpis?.bi?.trialToAnnualConversions30d ?? 0}/{kpis?.bi?.activeTrials30d ?? 0} trials (30d active)
            </div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Trials that ended in the last 30 days without converting to annual, divided by total trials ended in the period. Conversion window: 7 days after trial end."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Trial Drop-off
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.trialDropoffRate30d !== null && kpis?.bi?.trialDropoffRate30d !== undefined
                ? `${kpis.bi.trialDropoffRate30d}%`
                : '—'}
            </div>
            <div className="ar-admin-kpi-period">
              {kpis?.bi?.trialDropOff30d || 0}/{kpis?.bi?.trialsEnded30d || 0} ended (30d)
            </div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Trials expiring in 7d with low activation (under 3 module opens and 0 exam attempts)."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              At-Risk Trials
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">{kpis?.bi?.atRiskTrialsNext7d || 0}</div>
            <div className="ar-admin-kpi-period">Next 7 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Annual subscriptions with status='canceled' and ended_at within last 90 days. Churn rate = churned / (active at start + churned)."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Annual Churn
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.annualChurnRate90d !== null && kpis?.bi?.annualChurnRate90d !== undefined
                ? `${kpis.bi.annualChurnRate90d}%`
                : '—'}
            </div>
            <div className="ar-admin-kpi-period">
              {kpis?.bi?.annualChurnCount90d || 0} churned (90d)
            </div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Annual subscriptions with cancel_at_period_end=true AND current_period_end within next 30 days. Sum of subscription revenue for these at-risk subscriptions."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Revenue at Risk
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.revenueAtRiskNext30d !== null && kpis?.bi?.revenueAtRiskNext30d !== undefined
                ? `£${Math.round(kpis.bi.revenueAtRiskNext30d)}`
                : '—'}
            </div>
            <div className="ar-admin-kpi-period">
              {kpis?.bi?.atRiskAnnualCount || 0} at-risk (next 30d)
            </div>
          </div>
        </div>
      </div>

      {/* Revenue & Growth Row */}
      <div style={{ marginTop: '32px' }}>
        <div className="ar-admin-kpi-grid">
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from Stripe paid invoices (all plans). Revenue is based on Stripe paid invoices (after discounts, before Stripe fees). All-time total."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Total Revenue (Net)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.revenue_net_all_time_gbp !== null && kpis?.stripe?.revenue_net_all_time_gbp !== undefined
                ? `£${Math.round(kpis.stripe.revenue_net_all_time_gbp)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">All-time (all plans)</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from annual subscriptions in the last 30 days. Includes both direct annual signups and trial conversions. Net = after Stripe fees."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Annual Revenue (Net)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.annual_revenue_net_30d_gbp !== null && kpis?.stripe?.annual_revenue_net_30d_gbp !== undefined
                ? `£${Math.round(kpis.stripe.annual_revenue_net_30d_gbp)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">Last 30 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from trial-to-annual conversions. Conversion = annual subscription started within 7 days of trial end. All-time total."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Revenue from Conversions
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.revenueFromConversionsAllTime !== null && kpis?.bi?.revenueFromConversionsAllTime !== undefined
                ? `£${Math.round(kpis.bi.revenueFromConversionsAllTime)}`
                : (kpis?.stripe?.revenue_from_conversions_net_all_time_gbp !== null && kpis?.stripe?.revenue_from_conversions_net_all_time_gbp !== undefined
                  ? `£${Math.round(kpis.stripe.revenue_from_conversions_net_all_time_gbp)}`
                  : '£0')}
            </div>
            <div className="ar-admin-kpi-period">All-time</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from direct annual signups (no trial first). All-time total."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Revenue from Direct Annual
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.revenue_from_direct_annual_net_all_time_gbp !== null && kpis?.stripe?.revenue_from_direct_annual_net_all_time_gbp !== undefined
                ? `£${Math.round(kpis.stripe.revenue_from_direct_annual_net_all_time_gbp)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">All-time</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Potential revenue if all active trials convert to annual. Gross = active trials × annual price."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Trial Opportunity (if 100% convert)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.opportunity_revenue_gross_gbp !== null && kpis?.stripe?.opportunity_revenue_gross_gbp !== undefined
                ? `£${Math.round(kpis.stripe.opportunity_revenue_gross_gbp)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">
              Gross ({kpis?.trials || 0} active trials)
            </div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Lost revenue from trials that expired without converting. Calculated as: expired trials without conversion × annual price. All-time total."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Lost Revenue (Expired Trials)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value" style={{ color: '#ef4444' }}>
              {kpis?.bi?.lostRevenueOpportunityAllTime !== null && kpis?.bi?.lostRevenueOpportunityAllTime !== undefined
                ? `£${Math.round(kpis.bi.lostRevenueOpportunityAllTime)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">
              {kpis?.bi?.trialsEndedWithoutConversionAllTime ?? 0} expired (all-time)
            </div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Annual Run-Rate: Sum of annual subscription revenue from all active annual subscriptions (price × quantity per year)."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              ARR (Annual Run-Rate)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.arr_gbp !== null && kpis?.stripe?.arr_gbp !== undefined
                ? `£${Math.round(kpis.stripe.arr_gbp)}`
                : '—'}
            </div>
            <div className="ar-admin-kpi-period">From active annuals</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from direct annual signups (no trial first) in the last 30 days. Net = after Stripe fees."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Revenue from Direct Annual (30d)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.stripe?.revenue_from_direct_annual_net_30d_gbp !== null && kpis?.stripe?.revenue_from_direct_annual_net_30d_gbp !== undefined
                ? `£${Math.round(kpis.stripe.revenue_from_direct_annual_net_30d_gbp)}`
                : '£0'}
            </div>
            <div className="ar-admin-kpi-period">Last 30 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net paid revenue from trial-to-annual conversions in the last 30 days. Net = after Stripe fees."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Revenue from Conversions (30d)
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">
              {kpis?.bi?.revenueFromConversions30d !== null && kpis?.bi?.revenueFromConversions30d !== undefined
                ? `£${Math.round(kpis.bi.revenueFromConversions30d)}`
                : (kpis?.stripe?.revenue_from_conversions_net_30d_gbp !== null && kpis?.stripe?.revenue_from_conversions_net_30d_gbp !== undefined
                  ? `£${Math.round(kpis.stripe.revenue_from_conversions_net_30d_gbp)}`
                  : '£0')}
            </div>
            <div className="ar-admin-kpi-period">Last 30 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Total number of trials that ended (all-time). Supporting stat for conversion calculations."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Trials Ended
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">{kpis?.bi?.trialsEnded30d || 0}</div>
            <div className="ar-admin-kpi-period">Last 30 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Total number of members who started a trial and later converted to annual plan. All-time count."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Conversions — Trial → Annual
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">{kpis?.bi?.trialToAnnualConversionsAllTime ?? 0}</div>
            <div className="ar-admin-kpi-period">All-time</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Number of annual subscriptions with cancel_at_period_end=true AND current_period_end within next 30 days. Supporting stat for revenue at risk."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              At-Risk Annual
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value">{kpis?.bi?.atRiskAnnualCount || 0}</div>
            <div className="ar-admin-kpi-period">Next 30 days</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net change in total members over last 30 days (new members minus churned members)."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Net Member Growth
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value" style={{ 
              color: (kpis?.bi?.netMemberGrowth30d || 0) >= 0 ? 'var(--ar-text)' : '#ef4444' 
            }}>
              {(kpis?.bi?.netMemberGrowth30d || 0) >= 0 ? '+' : ''}{kpis?.bi?.netMemberGrowth30d || 0}
            </div>
            <div className="ar-admin-kpi-period">30 days (new - churned)</div>
          </div>
          <div 
            className="ar-admin-kpi-tile" 
            title="Net change in paid (annual) members over last 30 days (new annual starts minus annual churn)."
            style={{ cursor: 'help' }}
          >
            <div className="ar-admin-kpi-label">
              Net Paid Growth
              <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>ⓘ</span>
            </div>
            <div className="ar-admin-kpi-value" style={{ 
              color: (kpis?.bi?.netPaidGrowth30d || 0) >= 0 ? 'var(--ar-text)' : '#ef4444' 
            }}>
              {(kpis?.bi?.netPaidGrowth30d || 0) >= 0 ? '+' : ''}{kpis?.bi?.netPaidGrowth30d || 0}
            </div>
            <div className="ar-admin-kpi-period">30 days (new annual - churned)</div>
          </div>
        </div>
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
      padding: '12px 16px',
      fontSize: '14px',
      color: 'var(--ar-text-muted)',
      fontFamily: 'monospace',
      zIndex: 100,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      cursor: 'default'
    }}>
      <div>Version: <span style={{ color: 'var(--ar-orange)', fontWeight: 600 }}>{version}</span></div>
      <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
        {buildDate}
      </div>
    </div>
  );
}

function TopMembersList({ refreshTrigger }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'

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

  function handleSort(column) {
    if (sortColumn === column) {
      // Toggle direction if clicking the same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column and default to descending
      setSortColumn(column);
      setSortDirection('desc');
    }
  }

  function getSortedMembers() {
    if (!sortColumn) return members;

    const sorted = [...members].sort((a, b) => {
      let aVal, bVal;

      switch (sortColumn) {
        case 'email':
          aVal = (a.email || a.member_id || 'Unknown').toLowerCase();
          bVal = (b.email || b.member_id || 'Unknown').toLowerCase();
          break;
        case 'login_days_30d':
          aVal = a.login_days_30d || 0;
          bVal = b.login_days_30d || 0;
          break;
        case 'login_days_alltime':
          aVal = a.login_days_alltime || 0;
          bVal = b.login_days_alltime || 0;
          break;
        case 'last_login':
          aVal = a.last_login ? new Date(a.last_login).getTime() : 0;
          bVal = b.last_login ? new Date(b.last_login).getTime() : 0;
          break;
        case 'event_count':
          aVal = a.event_count || 0;
          bVal = b.event_count || 0;
          break;
        case 'module_opens':
          aVal = a.module_opens || 0;
          bVal = b.module_opens || 0;
          break;
        case 'questions_asked':
          aVal = a.questions_asked || 0;
          bVal = b.questions_asked || 0;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });

    return sorted;
  }

  function SortIcon({ column }) {
    if (sortColumn !== column) {
      return (
        <span style={{ 
          marginLeft: '6px', 
          opacity: 0.3,
          fontSize: '12px',
          display: 'inline-block',
          width: '12px'
        }}>↕</span>
      );
    }
    return (
      <span style={{ 
        marginLeft: '6px', 
        fontSize: '12px',
        color: 'var(--ar-orange)',
        display: 'inline-block',
        width: '12px'
      }}>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  }

  if (loading) return <div className="ar-admin-loading">Loading...</div>;
  if (members.length === 0) return <div className="ar-admin-empty">No data available</div>;

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return 'Invalid date';
    }
  }

  const sortedMembers = getSortedMembers();

  return (
    <table className="ar-admin-table">
      <thead>
        <tr>
          <th 
            onClick={() => handleSort('email')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Member <SortIcon column="email" />
          </th>
          <th 
            onClick={() => handleSort('login_days_30d')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Login Days (30d) <SortIcon column="login_days_30d" />
          </th>
          <th 
            onClick={() => handleSort('login_days_alltime')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Login Days (All-time) <SortIcon column="login_days_alltime" />
          </th>
          <th 
            onClick={() => handleSort('last_login')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Last Login <SortIcon column="last_login" />
          </th>
          <th 
            onClick={() => handleSort('event_count')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Events <SortIcon column="event_count" />
          </th>
          <th 
            onClick={() => handleSort('module_opens')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Modules <SortIcon column="module_opens" />
          </th>
          <th 
            onClick={() => handleSort('questions_asked')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            Questions <SortIcon column="questions_asked" />
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedMembers.map((member, idx) => (
          <tr key={idx}>
            <td>{member.email || member.member_id || 'Unknown'}</td>
            <td>{member.login_days_30d || 0}</td>
            <td>{member.login_days_alltime || 0}</td>
            <td>{formatDate(member.last_login)}</td>
            <td>{member.event_count}</td>
            <td>{member.module_opens}</td>
            <td>{member.questions_asked || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
