import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ExamsPage() {
  const router = useRouter();
  const { period = '30d', metric } = router.query;
  
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchExams();
    fetchStats();
  }, [router.query]);

  async function fetchExams() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams?period=${period}`);
      const data = await res.json();
      setExams(data);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`/api/admin/exams/stats?period=${period}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <Link href="/academy/admin" style={{ color: 'var(--ar-orange)', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>
        <h1 className="ar-admin-title">Exam Analytics</h1>
        <p className="ar-admin-subtitle">Exam attempts, pass rates, and performance</p>
      </div>

      {stats && (
        <div className="ar-admin-kpi-grid" style={{ marginBottom: '32px' }}>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Total Attempts</div>
            <div className="ar-admin-kpi-value">{stats.total_attempts}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Passed</div>
            <div className="ar-admin-kpi-value">{stats.passed}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Failed</div>
            <div className="ar-admin-kpi-value">{stats.failed}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Pass Rate</div>
            <div className="ar-admin-kpi-value">{stats.pass_rate}%</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Avg Score</div>
            <div className="ar-admin-kpi-value">{stats.avg_score}%</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
        </div>
      )}

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
      </div>

      {loading ? (
        <div className="ar-admin-loading">Loading exams...</div>
      ) : exams.length === 0 ? (
        <div className="ar-admin-empty">No exam results found</div>
      ) : (
        <div className="ar-admin-card">
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Email</th>
                <th>Module ID</th>
                <th>Score</th>
                <th>Passed</th>
                <th>Attempt</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {exam.memberstack_id?.substring(0, 12)}...
                  </td>
                  <td>{exam.email || '-'}</td>
                  <td>{exam.module_id}</td>
                  <td>{exam.score_percent}%</td>
                  <td>{exam.passed ? '✓' : '✗'}</td>
                  <td>{exam.attempt}</td>
                  <td>{new Date(exam.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
