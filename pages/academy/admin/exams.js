import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ExamsPage() {
  const router = useRouter();
  const { period = 'lifetime', sort = 'progress_asc', search: searchParam = '' } = router.query;
  
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [search, setSearch] = useState(searchParam || '');

  useEffect(() => {
    fetchProgress();
  }, [period, sort, searchParam]);

  async function fetchProgress() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period, sort });
      if (searchParam) params.append('search', searchParam);
      const res = await fetch(`/api/admin/progress?${params}`);
      const data = await res.json();
      setProgress(data);
    } catch (error) {
      console.error('Failed to fetch progress:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    const value = e.target.value;
    setSearch(value);
    router.push({ 
      query: { ...router.query, search: value || undefined } 
    }, undefined, { shallow: true });
  }

  function handleSort(newSort) {
    router.push({ 
      query: { ...router.query, sort: newSort } 
    });
  }

  function getSortIcon(column) {
    if (sort === column) return ' ↑';
    if (sort === column.replace('_asc', '_desc') || sort === column.replace('_desc', '_asc')) return ' ↓';
    return '';
  }

  function formatModuleId(moduleId) {
    // Extract number from module-01-exposure -> 01
    const match = moduleId.match(/module-(\d+)-/);
    return match ? match[1] : moduleId.replace('module-', '').substring(0, 2);
  }

  function getModuleTitle(moduleId) {
    const titles = {
      'module-01-exposure': 'Exposure',
      'module-02-aperture': 'Aperture',
      'module-03-shutter': 'Shutter',
      'module-04-iso': 'ISO',
      'module-05-manual': 'Manual',
      'module-06-metering': 'Metering',
      'module-07-bracketing': 'Bracketing',
      'module-08-focusing': 'Focusing',
      'module-09-dof': 'DoF',
      'module-10-drange': 'DRange',
      'module-11-wb': 'WB',
      'module-12-drive': 'Drive',
      'module-13-jpeg-raw': 'JPEG/RAW',
      'module-14-sensors': 'Sensors',
      'module-15-focal': 'Focal'
    };
    return titles[moduleId] || formatModuleId(moduleId);
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const passedModules = selectedMember?.modules.filter(m => m.status === 'passed') || [];
  const failedModules = selectedMember?.modules.filter(m => m.status === 'failed') || [];
  const remainingModules = selectedMember?.modules.filter(m => m.status === 'not_taken') || [];

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Progress</h1>
            <p className="ar-admin-subtitle">Module completion progress by member</p>
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
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            textDecoration: 'none',
            fontWeight: 600,
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
      </div>

      {/* Filters */}
      <div className="ar-admin-filters" style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={handleSearch}
          style={{
            padding: '8px 12px',
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            fontSize: '14px',
            width: '300px'
          }}
        />
        <select
          className="ar-admin-select"
          value={period}
          onChange={(e) => router.push({ query: { ...router.query, period: e.target.value } })}
        >
          <option value="lifetime">Lifetime</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <select
          className="ar-admin-select"
          value={sort}
          onChange={(e) => handleSort(e.target.value)}
        >
          <option value="progress_asc">Progress (Lowest First)</option>
          <option value="progress_desc">Progress (Highest First)</option>
          <option value="last_exam_desc">Last Exam (Recent First)</option>
          <option value="last_exam_asc">Last Exam (Oldest First)</option>
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
        </select>
      </div>

      {loading ? (
        <div className="ar-admin-loading">Loading progress...</div>
      ) : progress.length === 0 ? (
        <div className="ar-admin-empty">No progress data found</div>
      ) : (
        <div className="ar-admin-card">
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th 
                  onClick={() => handleSort('name_asc')}
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                >
                  Member {getSortIcon('name_asc')}
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Email
                </th>
                <th 
                  onClick={() => handleSort('progress_asc')}
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                >
                  Progress {getSortIcon('progress_asc')}
                </th>
                <th 
                  onClick={() => handleSort('last_exam_desc')}
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                >
                  Last Exam {getSortIcon('last_exam_desc')}
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Total Attempts
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Last Module Passed
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Modules
                </th>
              </tr>
            </thead>
            <tbody>
              {progress.map((member) => (
                <tr 
                  key={member.member_id}
                  onClick={() => setSelectedMember(member)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ar-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                    {member.name || member.email || 'Unknown'}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px' }}>
                    {member.email || '-'}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontWeight: 600, minWidth: '50px' }}>
                        {member.passedCount}/15
                      </span>
                      <div style={{
                        flex: 1,
                        height: '8px',
                        background: 'var(--ar-border)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        maxWidth: '200px'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${(member.passedCount / 15) * 100}%`,
                          background: member.passedCount === 15 ? '#10b981' : 'var(--ar-orange)',
                          transition: 'width 0.3s'
                        }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px' }}>
                    {formatDate(member.lastExamAt)}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                    {member.totalAttempts}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px' }}>
                    {member.lastModulePassed ? (
                      <div>
                        <div>{getModuleTitle(member.lastModulePassed.moduleId)}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ar-text-muted)' }}>
                          {formatDate(member.lastModulePassed.passedAt)}
                        </div>
                      </div>
                    ) : '-'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '400px' }}>
                      {member.modules.map((module) => {
                        let bgColor = 'var(--ar-border)';
                        let textColor = 'var(--ar-text-muted)';
                        let title = `${getModuleTitle(module.moduleId)}: Not taken`;
                        
                        if (module.status === 'passed') {
                          bgColor = '#10b981';
                          textColor = '#fff';
                          title = `${getModuleTitle(module.moduleId)}: Passed (${module.bestScore}%, ${module.attempts} attempt${module.attempts !== 1 ? 's' : ''})`;
                        } else if (module.status === 'failed') {
                          bgColor = '#ef4444';
                          textColor = '#fff';
                          title = `${getModuleTitle(module.moduleId)}: Failed (Best: ${module.bestScore}%, ${module.attempts} attempt${module.attempts !== 1 ? 's' : ''}, Last: ${formatDate(module.lastAttemptAt)})`;
                        }
                        
                        return (
                          <div
                            key={module.moduleId}
                            title={title}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '4px',
                              background: bgColor,
                              color: textColor,
                              fontSize: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              cursor: 'help'
                            }}
                          >
                            {formatModuleId(module.moduleId)}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Side Panel */}
      {selectedMember && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '500px',
            height: '100vh',
            background: 'var(--ar-bg)',
            borderLeft: '1px solid var(--ar-border)',
            boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '24px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ color: 'var(--ar-text)', fontSize: '20px', fontWeight: 600 }}>
              {selectedMember.name || selectedMember.email || 'Unknown Member'}
            </h2>
            <button
              onClick={() => setSelectedMember(null)}
              style={{
                background: 'transparent',
                border: '1px solid var(--ar-border)',
                borderRadius: '6px',
                padding: '8px 12px',
                color: 'var(--ar-text)',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--ar-card)', borderRadius: '8px' }}>
            <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Email</div>
            <div style={{ color: 'var(--ar-text)', fontSize: '14px' }}>{selectedMember.email || '-'}</div>
            <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginTop: '16px', marginBottom: '8px' }}>Progress</div>
            <div style={{ color: 'var(--ar-text)', fontSize: '18px', fontWeight: 600 }}>
              {selectedMember.passedCount}/15 modules passed
            </div>
            <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginTop: '16px', marginBottom: '8px' }}>Total Attempts</div>
            <div style={{ color: 'var(--ar-text)', fontSize: '14px' }}>{selectedMember.totalAttempts}</div>
            <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginTop: '16px', marginBottom: '8px' }}>Last Exam</div>
            <div style={{ color: 'var(--ar-text)', fontSize: '14px' }}>{formatDate(selectedMember.lastExamAt)}</div>
          </div>

          {/* Passed Modules */}
          {passedModules.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: 'var(--ar-text)', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                Passed Modules ({passedModules.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {passedModules.map((module) => (
                  <div
                    key={module.moduleId}
                    style={{
                      padding: '12px',
                      background: 'var(--ar-card)',
                      borderRadius: '6px',
                      border: '1px solid #10b981'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--ar-text)', fontWeight: 600 }}>
                        {getModuleTitle(module.moduleId)}
                      </span>
                      <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 600 }}>
                        {module.bestScore}%
                      </span>
                    </div>
                    <div style={{ color: 'var(--ar-text-muted)', fontSize: '12px' }}>
                      {module.attempts} attempt{module.attempts !== 1 ? 's' : ''} • Passed: {formatDate(module.firstPassedAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed Modules */}
          {failedModules.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ color: 'var(--ar-text)', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                Failed Modules ({failedModules.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {failedModules.map((module) => (
                  <div
                    key={module.moduleId}
                    style={{
                      padding: '12px',
                      background: 'var(--ar-card)',
                      borderRadius: '6px',
                      border: '1px solid #ef4444'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--ar-text)', fontWeight: 600 }}>
                        {getModuleTitle(module.moduleId)}
                      </span>
                      <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600 }}>
                        Best: {module.bestScore}%
                      </span>
                    </div>
                    <div style={{ color: 'var(--ar-text-muted)', fontSize: '12px' }}>
                      {module.attempts} attempt{module.attempts !== 1 ? 's' : ''} • Last: {formatDate(module.lastAttemptAt)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remaining Modules */}
          {remainingModules.length > 0 && (
            <div>
              <h3 style={{ color: 'var(--ar-text)', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                Remaining Modules ({remainingModules.length})
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {remainingModules.map((module) => (
                  <div
                    key={module.moduleId}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--ar-card)',
                      borderRadius: '6px',
                      border: '1px solid var(--ar-border)',
                      color: 'var(--ar-text-muted)',
                      fontSize: '13px'
                    }}
                  >
                    {getModuleTitle(module.moduleId)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overlay */}
      {selectedMember && (
        <div
          onClick={() => setSelectedMember(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999
          }}
        />
      )}
    </div>
  );
}
