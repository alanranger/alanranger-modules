// /pages/academy/admin/members/index.js
// Members directory page with filters and table

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const formatDate = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatMoney = (amount, currency = 'GBP') => {
  if (amount == null || Number.isNaN(amount)) return '—';
  const value = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  if (Number.isNaN(value)) return '—';
  const normalizedCurrency = (currency || 'GBP').toUpperCase();
  if (normalizedCurrency === 'GBP') {
    return `£${Math.round(value)}`;
  }
  return `${Math.round(value)} ${normalizedCurrency}`;
};

const getStatusBadgeStyle = (status) => {
  if (status === 'active') {
    return { background: 'rgba(34, 197, 94, 0.2)', color: '#22c55e' };
  }
  if (status === 'trialing') {
    return { background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24' };
  }
  return { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' };
};

export default function MembersDirectory() {
  const router = useRouter();
  const { sort = 'updated_at', order = 'desc' } = router.query;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [sortConfig, setSortConfig] = useState({ field: sort, direction: order });
  
  // Active Now Count
  const [activeNowCount, setActiveNowCount] = useState(0);
  const [activeNowLoading, setActiveNowLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  // Filters
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSeenFilter, setLastSeenFilter] = useState('');
  const [activeNowFilter, setActiveNowFilter] = useState(false);
  const [tileFilter, setTileFilter] = useState('');
  const latestRequestId = useRef(0);

  const tileFilterLabels = {
    all_members_all_time: 'Total members (all-time)',
    signups_24h: 'New signups (24h)',
    signups_7d: 'New signups (7d)',
    signups_30d: 'New signups (30d)',
    trials_expiring: 'Trials expiring (30d)',
    annual_expiring: 'Annuals expiring (30d)',
    all_expiring: 'All plans expiring (7d)',
    trial_conversions_30d: 'Trial → annual conversions (30d)',
    trial_conversions_all_time: 'Trial → annual conversions (all-time)',
    trial_dropoff_30d: 'Trial drop-off (30d)',
    trial_dropoff_all_time: 'Expired trials (no conversion, all-time)',
    trials_ended_30d: 'Trials ended (30d)',
    at_risk_trials_7d: 'At-risk trials (next 7d)',
    annual_all_time: 'Annual members (all-time)',
    direct_annual_all_time: 'Direct annual (all-time)',
    arr_active_annual: 'Active annual (ARR cohort)',
    annual_revenue_30d: 'Annual starts (30d)',
    direct_annual_30d: 'Direct annual (30d)',
    revenue_conversions_all_time: 'Revenue from conversions (all-time)',
    revenue_conversions_30d: 'Revenue from conversions (30d)',
    net_member_growth_30d: 'Net member growth (30d)',
    net_paid_growth_30d: 'Net paid growth (30d)',
    annual_churn_90d: 'Annual churn (90d)',
    at_risk_annual_30d: 'At-risk annual (next 30d)',
    trial_opportunity_all: 'Active trials (opportunity)',
    trial_opportunity_3pct: 'Trials expiring (30d, 3% target)'
  };

  useEffect(() => {
    // Read filters from URL query params
    const { plan, status, search, last_seen, active_now, page, limit, sort, order, filter } = router.query;
    if (plan) setPlanFilter(plan);
    if (status) setStatusFilter(status);
    if (search) setSearchQuery(search);
    if (last_seen) setLastSeenFilter(last_seen);
    if (active_now !== undefined) setActiveNowFilter(active_now === 'true');
    if (filter) setTileFilter(filter);
    if (!filter) setTileFilter('');
    if (page) setPagination(prev => ({ ...prev, page: Number.parseInt(page, 10) }));
    if (limit) setPagination(prev => ({ ...prev, limit: Number.parseInt(limit, 10) }));
    if (sort) {
      setSortConfig({ field: sort, direction: order || 'desc' });
    } else {
      // Default sort if not specified
      setSortConfig({ field: 'updated_at', direction: 'desc' });
    }
  }, [router.query]);

  useEffect(() => {
    // Fetch members when pagination, filters, or sort changes
    fetchMembers();
  }, [pagination.page, pagination.limit, planFilter, statusFilter, searchQuery, lastSeenFilter, activeNowFilter, tileFilter, sortConfig]);

  // Fetch active now count and set up polling every 1 minute
  useEffect(() => {
    fetchActiveNow();
    
    // Set up polling every 1 minute (60000 ms) for more frequent updates
    const pollInterval = setInterval(() => {
      fetchActiveNow();
    }, 1 * 60 * 1000);

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
  }, []);

  async function fetchMembers() {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);
      if (planFilter) params.append('plan', planFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (lastSeenFilter) params.append('last_seen', lastSeenFilter);
      if (activeNowFilter) params.append('active_now', 'true');
      if (tileFilter) params.append('filter', tileFilter);
      // Add sort parameters for server-side sorting
      if (sortConfig.field) {
        params.append('sort', sortConfig.field);
        params.append('order', sortConfig.direction);
      }

      const res = await fetch(`/api/admin/members?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      if (requestId === latestRequestId.current) {
        // Members are already sorted on the server, no need for client-side sorting
        setMembers(data.members || []);
        setPagination(data.pagination || pagination);
      }
    } catch (error) {
      if (requestId === latestRequestId.current) {
        console.error('Failed to fetch members:', error);
      }
    } finally {
      if (requestId === latestRequestId.current) {
        setLoading(false);
      }
    }
  }

  async function fetchActiveNow() {
    setActiveNowLoading(true);
    try {
      const url = '/api/admin/members-active-now';
      console.log('[fetchActiveNow] Calling:', url);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store' // Prevent caching
      });
      
      console.log('[fetchActiveNow] Response status:', res.status, res.statusText);
      console.log('[fetchActiveNow] Response URL:', res.url);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[fetchActiveNow] API error:', res.status, errorText);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      console.log('[fetchActiveNow] Active now response:', data);
      setActiveNowCount(data.count || 0);
      setLastUpdated(data.last_updated ? new Date(data.last_updated) : new Date());
    } catch (error) {
      console.error('[fetchActiveNow] Failed to fetch active now count:', error);
      // Set count to 0 on error to show something
      setActiveNowCount(0);
    } finally {
      setActiveNowLoading(false);
    }
  }

  function handleActiveNowClick() {
    const newActiveNowFilter = !activeNowFilter;
    setActiveNowFilter(newActiveNowFilter);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
    
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...(planFilter && { plan: planFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(lastSeenFilter && { last_seen: lastSeenFilter }),
        ...(newActiveNowFilter && { active_now: 'true' }),
        ...(tileFilter && { filter: tileFilter }),
        sort: sortConfig.field,
        order: sortConfig.direction,
        page: 1,
        limit: pagination.limit
      }
    });
  }

  function handleFilterChange() {
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...(planFilter && { plan: planFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(lastSeenFilter && { last_seen: lastSeenFilter }),
        ...(activeNowFilter && { active_now: 'true' }),
        ...(tileFilter && { filter: tileFilter }),
        sort: sortConfig.field,
        order: sortConfig.direction,
        page: 1, // Reset to page 1 when filters change
        limit: pagination.limit
      }
    });
  }

  function handlePageChange(newPage) {
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...router.query,
        page: newPage
      }
    });
  }

  function handleLimitChange(newLimit) {
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...router.query,
        limit: newLimit,
        page: 1 // Reset to page 1 when limit changes
      }
    });
  }

  function handleClearTileFilter() {
    const { filter, ...rest } = router.query;
    setTileFilter('');
    setPagination(prev => ({ ...prev, page: 1 }));
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...rest,
        page: 1
      }
    });
  }

  function handleSort(field) {
    const direction = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const newSortConfig = { field, direction };
    setSortConfig(newSortConfig);
    
    // Reset to page 1 when sorting changes
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Update URL to persist sort
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...router.query,
        sort: field,
        order: direction,
        page: 1 // Reset to page 1
      }
    }, undefined, { shallow: false }); // Use shallow: false to ensure proper navigation
    
    // fetchMembers will be called by useEffect when router.query changes
  }

  function getSortIcon(field) {
    if (sortConfig.field !== field) {
      return '↕️'; // Neutral
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }

  return (
    <div className="ar-admin-container ar-admin-container--wide">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Members Directory</h1>
            <p className="ar-admin-subtitle">View and filter all academy members</p>
          </div>
        </div>

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
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: '6px',
            color: 'var(--ar-text-muted)',
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '14px'
          }}>
            Overview
          </Link>
          <Link href="/academy/admin/members" style={{
            padding: '8px 16px',
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            textDecoration: 'none',
            fontWeight: 600,
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
        <Link href="/academy/admin/ghost" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Ghost
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

        {/* Active Now Tile */}
        <div className="ar-admin-kpi-grid" style={{ marginBottom: '24px' }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="ar-admin-kpi-tile"
              onClick={handleActiveNowClick}
              aria-pressed={Boolean(activeNowFilter)}
              style={{ 
                cursor: 'pointer', 
                position: 'relative',
                border: activeNowFilter ? '2px solid var(--ar-orange)' : '1px solid var(--ar-border)',
                background: activeNowFilter ? 'rgba(255, 152, 0, 0.1)' : 'var(--ar-card)',
                width: '100%',
                textAlign: 'left'
              }}
              title={activeNowFilter ? 'Click to clear filter' : 'Click to filter by logged in members'}
            >
              <div className="ar-admin-kpi-label">
                Logged In Right Now
                {activeNowFilter && <span style={{ marginLeft: '8px', color: 'var(--ar-orange)' }}>●</span>}
              </div>
              <div className="ar-admin-kpi-value">
                {activeNowLoading ? '...' : activeNowCount}
              </div>
              <div className="ar-admin-kpi-period">
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString()}`
                  : 'Refreshing every 1 minute'
                }
              </div>
            </button>
            <button
              type="button"
              onClick={fetchActiveNow}
              disabled={activeNowLoading}
              aria-label="Refresh active now count"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'transparent',
                border: '1px solid var(--ar-border)',
                borderRadius: '4px',
                color: 'var(--ar-text-muted)',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: activeNowLoading ? 'not-allowed' : 'pointer',
                opacity: activeNowLoading ? 0.5 : 1,
                zIndex: 10
              }}
              title="Refresh count"
            >
              {activeNowLoading ? '...' : '↻'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="ar-admin-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="filter-plan" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Plan</label>
              <select
                id="filter-plan"
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">All Plans</option>
                <option value="trial">Trial</option>
                <option value="paid">Paid</option>
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-status" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="canceled">Canceled</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-last-seen" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Last Seen</label>
              <select
                id="filter-last-seen"
                value={lastSeenFilter}
                onChange={(e) => setLastSeenFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">Any Time</option>
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-search" style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Search</label>
              <input
                id="filter-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFilterChange()}
                placeholder="Name or email..."
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
          {tileFilter ? (
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--ar-text-muted)' }}>Tile filter:</span>
              <span style={{
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'rgba(229, 114, 0, 0.15)',
                border: '1px solid rgba(229, 114, 0, 0.4)',
                color: 'var(--ar-text)',
                fontSize: '12px',
                fontWeight: 600
              }}>
                {tileFilterLabels[tileFilter] || tileFilter}
              </span>
              <button
                type="button"
                onClick={handleClearTileFilter}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid var(--ar-border)',
                  color: 'var(--ar-text-muted)',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Clear tile filter
              </button>
            </div>
          ) : null}
        </div>

        {/* Members Table */}
        {loading ? (
          <div className="ar-admin-loading">Loading members...</div>
        ) : (
          <div className="ar-admin-card">
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <h2 className="ar-admin-card-title">Members ({pagination.total})</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="members-per-page" style={{ fontSize: '12px', color: 'var(--ar-text-muted)' }}>Show:</label>
                <select
                  id="members-per-page"
                  value={pagination.limit}
                  onChange={(e) => handleLimitChange(Number.parseInt(e.target.value, 10))}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--ar-bg)',
                    border: '1px solid var(--ar-border)',
                    borderRadius: '6px',
                    color: 'var(--ar-text)',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="500">500</option>
                  <option value="1000">1000</option>
                  <option value="9999">All</option>
                </select>
                <span style={{ fontSize: '12px', color: 'var(--ar-text-muted)' }}>per page</span>
              </div>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1400px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
                    <th 
                      onClick={() => handleSort('name')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Name {getSortIcon('name')}
                    </th>
                    <th 
                      onClick={() => handleSort('email')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Email {getSortIcon('email')}
                    </th>
                    <th 
                      onClick={() => handleSort('plan_name')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Plan {getSortIcon('plan_name')}
                    </th>
                    <th 
                      onClick={() => handleSort('status')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Status {getSortIcon('status')}
                    </th>
                    <th 
                      onClick={() => handleSort('plan_expiry_date')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Expires {getSortIcon('plan_expiry_date')}
                    </th>
                    <th 
                      onClick={() => handleSort('signed_up')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Signed Up {getSortIcon('signed_up')}
                    </th>
                    <th 
                      onClick={() => handleSort('last_seen')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Last Seen {getSortIcon('last_seen')}
                    </th>
                    <th 
                      onClick={() => handleSort('modules_opened_unique')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Modules {getSortIcon('modules_opened_unique')}
                    </th>
                    <th 
                      onClick={() => handleSort('exams_attempted')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Exams {getSortIcon('exams_attempted')}
                    </th>
                    <th 
                      onClick={() => handleSort('bookmarks_count')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Bookmarks {getSortIcon('bookmarks_count')}
                    </th>
                    <th 
                      onClick={() => handleSort('photography_style')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Type {getSortIcon('photography_style')}
                    </th>
                    <th
                      onClick={() => handleSort('hue_test_score')}
                      style={{ padding: '12px', textAlign: 'center', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', minWidth: '64px' }}
                    >
                      <span style={{ display: 'inline-block', lineHeight: 1.1 }}>
                        Colour<br />IQ {getSortIcon('hue_test_score')}
                      </span>
                    </th>
                    <th
                      onClick={() => handleSort('total_paid')}
                      style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', minWidth: '120px' }}
                    >
                      Total Paid {getSortIcon('total_paid')}
                    </th>
                    <th
                      onClick={() => handleSort('current_amount')}
                      style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', minWidth: '140px' }}
                    >
                      Current Amount {getSortIcon('current_amount')}
                    </th>
                    <th
                      onClick={() => handleSort('refunds_total')}
                      style={{ padding: '12px', textAlign: 'right', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', minWidth: '140px' }}
                    >
                      Refunds/Credits {getSortIcon('refunds_total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan="15" style={{ padding: '24px', textAlign: 'center', color: 'var(--ar-text-muted)' }}>
                        No members found
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr 
                        key={member.member_id}
                        onClick={() => router.push(`/academy/admin/members/${member.member_id}`)}
                        style={{
                          borderBottom: '1px solid var(--ar-border)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 165, 0, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                          {member.name || member.email || member.member_id || '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.email || '—'}</td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.plan_name}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            ...getStatusBadgeStyle(member.status)
                          }}>
                            {member.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {member.plan_expiry_date ? formatDate(member.plan_expiry_date) : '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {formatDate(member.signed_up)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {formatDate(member.last_seen)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                          {member.modules_opened_unique} / {member.modules_opened_total}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                          {member.exams_attempted > 0 ? `${member.exams_passed} / ${member.exams_attempted}` : '0 / 0'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.bookmarks_count}</td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {member.photography_style || '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)', textAlign: 'center', fontWeight: 600 }}>
                          {member.hue_test_score ?? '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(member.total_paid ?? 0, member.currency)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(member.current_amount ?? 0, member.currency)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)', textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(member.refunds_total ?? 0, member.currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="ar-admin-btn-secondary"
                  style={{ minWidth: '80px' }}
                >
                  Previous
                </button>
                
                {/* Page numbers */}
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        style={{
                          padding: '6px 12px',
                          background: pagination.page === pageNum ? 'var(--ar-brand)' : 'var(--ar-card)',
                          border: '1px solid var(--ar-border)',
                          borderRadius: '6px',
                          color: pagination.page === pageNum ? '#fff' : 'var(--ar-text)',
                          fontSize: '14px',
                          fontWeight: pagination.page === pageNum ? 700 : 500,
                          cursor: 'pointer',
                          minWidth: '40px'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <span style={{ padding: '8px 16px', color: 'var(--ar-text-muted)', fontSize: '14px' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="ar-admin-btn-secondary"
                  style={{ minWidth: '80px' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
