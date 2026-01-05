import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function QAPage() {
  const router = useRouter();
  const { status: statusParam, answer_source: sourceParam, page_url: pageParam } = router.query;
  
  const [stats, setStats] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({
    status: statusParam || 'all',
    answer_source: sourceParam || 'all',
    page_url: pageParam || ''
  });

  useEffect(() => {
    fetchStats();
    fetchQuestions();
  }, [statusParam, sourceParam, pageParam]);

  async function fetchStats() {
    try {
      const res = await fetch('/api/academy/qa/admin/stats?range=30d');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function fetchQuestions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusParam && statusParam !== 'all') {
        params.append('status', statusParam);
      }
      if (sourceParam && sourceParam !== 'all') {
        params.append('answer_source', sourceParam);
      }
      if (pageParam) {
        params.append('page_url', pageParam);
      }
      params.append('limit', '100');
      params.append('sort', 'created_at');
      params.append('order', 'desc');

      const res = await fetch(`/api/academy/qa/admin/questions?${params}`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleTileClick(filterType, filterValue) {
    const newFilters = { ...filters };
    if (filterType === 'status') {
      newFilters.status = filterValue;
    } else if (filterType === 'answer_source') {
      newFilters.answer_source = filterValue;
    }
    setFilters(newFilters);
    router.push({
      query: { ...router.query, status: filterValue === 'all' ? undefined : filterValue }
    });
  }

  function handleAnswerClick(question) {
    setSelectedQuestion(question);
    setAnswerText(question.admin_answer || question.ai_answer || '');
  }

  async function handleSaveAnswer() {
    if (!selectedQuestion) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/academy/qa/admin/questions/${selectedQuestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: answerText,
          answered_by: 'admin',
          answer_source: 'manual'
        })
      });

      if (!res.ok) throw new Error('Failed to save answer');

      const { question } = await res.json();
      
      // Update local state
      setQuestions(questions.map(q => q.id === question.id ? question : q));
      setSelectedQuestion(null);
      setAnswerText('');
      
      // Refresh stats
      fetchStats();
    } catch (error) {
      console.error('Failed to save answer:', error);
      alert('Failed to save answer. Please try again.');
    } finally {
      setSaving(false);
    }
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

  function getStatusBadge(status) {
    const badges = {
      'ai_suggested': { label: 'AI Suggested', color: '#f59e0b' },
      'queued': { label: 'Queued', color: '#ef4444' },
      'answered': { label: 'Answered', color: '#10b981' },
      'closed': { label: 'Closed', color: '#6b7280' }
    };
    const badge = badges[status] || { label: status, color: '#6b7280' };
    return (
      <span style={{
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 600,
        background: `${badge.color}20`,
        color: badge.color
      }}>
        {badge.label}
      </span>
    );
  }


  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Q&A</h1>
            <p className="ar-admin-subtitle">Manage member questions and answers</p>
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
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px'
          }}>
            Q&A
          </Link>
        </div>
      </div>

      {/* KPI Tiles */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px', 
          marginBottom: '24px' 
        }}>
          <div 
            className="ar-admin-kpi-tile"
            onClick={() => handleTileClick('status', 'all')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ar-admin-kpi-label">Questions Posted (30d)</div>
            <div className="ar-admin-kpi-value">{stats.questionsPosted || 0}</div>
          </div>
          <div 
            className="ar-admin-kpi-tile"
            onClick={() => handleTileClick('status', 'answered')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ar-admin-kpi-label">Answered (30d)</div>
            <div className="ar-admin-kpi-value">{stats.answered || 0}</div>
          </div>
          <div 
            className="ar-admin-kpi-tile"
            onClick={() => handleTileClick('status', 'outstanding')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ar-admin-kpi-label">Outstanding</div>
            <div className="ar-admin-kpi-value">{stats.outstanding || 0}</div>
          </div>
          <div 
            className="ar-admin-kpi-tile"
            onClick={() => handleTileClick('answer_source', 'ai')}
            style={{ cursor: 'pointer' }}
          >
            <div className="ar-admin-kpi-label">AI Answered (30d)</div>
            <div className="ar-admin-kpi-value">{stats.answeredByAI || 0}</div>
          </div>
          {stats.avgResponseTimeHours !== null && (
            <div className="ar-admin-kpi-tile">
              <div className="ar-admin-kpi-label">Avg Response Time</div>
              <div className="ar-admin-kpi-value">{stats.avgResponseTimeHours}h</div>
            </div>
          )}
          <div className="ar-admin-kpi-tile">
            <div className="ar-admin-kpi-label">Members with Outstanding</div>
            <div className="ar-admin-kpi-value">{stats.membersWithOutstanding || 0}</div>
          </div>
        </div>
      )}

      {/* Questions Table */}
      {loading ? (
        <div className="ar-admin-loading">Loading questions...</div>
      ) : questions.length === 0 ? (
        <div className="ar-admin-empty">No questions found</div>
      ) : (
        <div className="ar-admin-card">
          <h2 className="ar-admin-card-title">Questions ({questions.length})</h2>
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Date Asked
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Member
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Question
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Answer Source
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Answered Date
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr 
                  key={question.id}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--ar-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px' }}>
                    {formatDate(question.created_at)}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px' }}>
                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                      {question.member_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)' }}>
                      {question.member_email || 'No email'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ar-text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                      {question.member_id || 'No ID'}
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '13px', maxWidth: '400px' }}>
                    <div style={{ 
                      whiteSpace: 'normal',
                      wordWrap: 'break-word',
                      lineHeight: '1.5'
                    }}>
                      {question.question}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {getStatusBadge(question.status)}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '12px' }}>
                    {question.answer_source === 'ai' ? 'Robo-Ranger' : question.answer_source === 'manual' ? 'Manual' : '-'}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--ar-text)', fontSize: '12px' }}>
                    {formatDate(question.admin_answered_at || question.ai_answered_at)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <button
                      onClick={() => handleAnswerClick(question)}
                      className="ar-admin-btn"
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px',
                        background: question.status === 'answered' ? 'var(--ar-border)' : 'var(--ar-orange)',
                        color: question.status === 'answered' ? 'var(--ar-text)' : '#fff'
                      }}
                    >
                      {question.status === 'answered' ? 'Edit' : 'Answer'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Answer Modal/Drawer */}
      {selectedQuestion && (
        <>
          <div
            onClick={() => setSelectedQuestion(null)}
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
          <div 
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: '600px',
              height: '100vh',
              background: 'var(--ar-bg)',
              borderLeft: '1px solid var(--ar-border)',
              boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.3)',
              zIndex: 1000,
              overflowY: 'auto',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: 'var(--ar-text)', fontSize: '20px', fontWeight: 600 }}>
                {selectedQuestion.status === 'answered' ? 'Edit Answer' : 'Answer Question'}
              </h2>
              <button
                onClick={() => {
                  setSelectedQuestion(null);
                  setAnswerText('');
                }}
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

            {/* Question Details */}
            <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--ar-card)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Member</div>
              <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                {extractFirstName(selectedQuestion.member_name) || selectedQuestion.member_email || 'Unknown'}
              </div>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Page</div>
              <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                {selectedQuestion.page_url || '-'}
              </div>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Date Asked</div>
              <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                {formatDate(selectedQuestion.created_at)}
              </div>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Question</div>
              <div style={{ color: 'var(--ar-text)', fontSize: '14px', lineHeight: '1.6' }}>
                {selectedQuestion.question}
              </div>
              {selectedQuestion.ai_answer && !selectedQuestion.admin_answer && (
                <>
                  <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginTop: '16px', marginBottom: '8px' }}>AI Suggested Answer</div>
                  <div style={{ 
                    color: 'var(--ar-text)', 
                    fontSize: '13px', 
                    lineHeight: '1.6',
                    padding: '12px',
                    background: '#fef3c7',
                    borderRadius: '6px',
                    border: '1px solid #f59e0b'
                  }}>
                    {selectedQuestion.ai_answer}
                  </div>
                </>
              )}
            </div>

            {/* Answer Textarea */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: '24px' }}>
              <label style={{ color: 'var(--ar-text)', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Your Answer
              </label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Enter your answer here..."
                style={{
                  flex: 1,
                  minHeight: '200px',
                  padding: '12px',
                  background: 'var(--ar-card)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSaveAnswer}
                disabled={saving || !answerText.trim()}
                className="ar-admin-btn"
                style={{ 
                  flex: 1,
                  opacity: (!answerText.trim() || saving) ? 0.5 : 1,
                  cursor: (!answerText.trim() || saving) ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : 'Save Answer'}
              </button>
              <button
                onClick={() => {
                  setSelectedQuestion(null);
                  setAnswerText('');
                }}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
