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
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const [notifyMember, setNotifyMember] = useState(false);
  const [filters, setFilters] = useState({
    status: statusParam || 'all',
    answer_source: sourceParam || 'all',
    page_url: pageParam || ''
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [statusParam, sourceParam, pageParam, currentPage, sortBy, sortOrder, searchQuery]);

  async function fetchStats() {
    try {
      const res = await fetch('/api/academy/qa/admin/stats?range=30d', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
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
      params.append('limit', '50');
      params.append('offset', String((currentPage - 1) * 50));
      params.append('sort', sortBy);
      params.append('order', sortOrder);
      if (searchQuery) {
        params.append('q', searchQuery);
      }

      const res = await fetch(`/api/academy/qa/admin/questions?${params}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        console.error('Failed to fetch questions:', errorData);
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setTotalQuestions(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch questions:', error);
      setQuestions([]);
      setTotalQuestions(0);
      // Show error message to user
      alert(`Failed to load questions: ${error.message}. Please check console for details.`);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e) {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  }

  function handleSort(column) {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  }

  function getSortIcon(column) {
    if (sortBy !== column) return '';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  }

  // Format AI answer text - convert markdown links and URLs to clickable links
  function formatAIAnswer(text) {
    if (!text) return '';
    let formatted = String(text);
    
    // Helper to escape HTML
    function escapeHtml(html) {
      const div = document.createElement('div');
      div.textContent = html;
      return div.innerHTML;
    }
    
    // Step 1: Convert markdown-style links [title](url) to HTML links
    const placeholderPrefix = '__MDLINK_';
    const placeholderSuffix = '__';
    let linkCounter = 0;
    const linkMap = {};
    
    formatted = formatted.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      function(match, title, url) {
        // Clean URL: trim and remove trailing )
        let cleanUrl = url.trim();
        while (cleanUrl.endsWith(')')) {
          cleanUrl = cleanUrl.slice(0, -1);
        }
        // Validate URL
        try {
          new URL(cleanUrl);
          const placeholder = placeholderPrefix + (linkCounter++) + placeholderSuffix;
          linkMap[placeholder] = {
            title: title,
            url: cleanUrl
          };
          return placeholder;
        } catch (e) {
          return match;
        }
      }
    );
    
    // Step 2: Escape HTML
    formatted = formatted
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Step 3: Replace placeholders with actual anchor tags
    for (const placeholder in linkMap) {
      const link = linkMap[placeholder];
      const escapedTitle = escapeHtml(link.title);
      const escapedUrl = escapeHtml(link.url);
      while (formatted.includes(placeholder)) {
        formatted = formatted.replace(
          placeholder,
          `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${escapedTitle}</a>`
        );
      }
    }
    
    // Step 4: Convert plain URLs to clickable links (but skip URLs already in anchor tags)
    formatted = formatted.replace(
      /(https?:\/\/[^\s\)<>]+)/g,
      function(match, url, offset, fullString) {
        // Check if this URL is already inside an href attribute
        const beforeMatch = fullString.substring(0, offset);
        const lastHref = beforeMatch.lastIndexOf('href="');
        
        if (lastHref !== -1) {
          const afterHref = beforeMatch.substring(lastHref + 6);
          const nextQuote = afterHref.indexOf('"');
          if (nextQuote === -1 || (lastHref + 6 + nextQuote) > offset) {
            return match; // Already in href, skip
          }
        }
        
        // Check if inside anchor tag content
        const lastOpenTag = beforeMatch.lastIndexOf('<a');
        const lastCloseTag = beforeMatch.lastIndexOf('</a>');
        if (lastOpenTag !== -1 && (lastCloseTag === -1 || lastOpenTag > lastCloseTag)) {
          const tagAfterOpen = beforeMatch.substring(lastOpenTag);
          const tagCloseIndex = tagAfterOpen.indexOf('>');
          if (tagCloseIndex !== -1) {
            const anchorStart = lastOpenTag + tagCloseIndex + 1;
            const afterMatch = fullString.substring(offset + match.length);
            const nextCloseTag = afterMatch.indexOf('</a>');
            if (nextCloseTag !== -1 && offset >= anchorStart) {
              return match; // Inside anchor content, skip
            }
          }
        }
        
        // Clean URL: remove trailing )
        let cleanUrl = url;
        while (cleanUrl.endsWith(')')) {
          cleanUrl = cleanUrl.slice(0, -1);
        }
        
        try {
          new URL(cleanUrl);
          const escapedUrl = escapeHtml(cleanUrl);
          return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline;">${escapedUrl}</a>`;
        } catch (e) {
          return escapeHtml(url);
        }
      }
    );
    
    return formatted;
  }

  // Search is handled server-side via 'q' parameter
  const filteredQuestions = questions;
  const totalPages = Math.ceil(totalQuestions / 50);

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
    setAnswerText(question.answer || question.admin_answer || '');
    setAiDraft(question.ai_answer || null);
    setNotifyMember(false);
  }

  async function handleGenerateAI() {
    if (!selectedQuestion) return;
    
    setGeneratingAI(true);
    try {
      const res = await fetch('/api/academy/qa/admin/ai-suggest', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: selectedQuestion.id,
          question: selectedQuestion.question,
          page_url: selectedQuestion.page_url
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || 'Failed to generate AI answer');
      }

      const { question: updatedQuestion, ai_answer } = await res.json();
      setAiDraft(ai_answer);
      setSelectedQuestion(updatedQuestion);
      // Pre-fill answer text with AI draft for editing
      setAnswerText(ai_answer);
    } catch (error) {
      console.error('Failed to generate AI answer:', error);
      alert(`Failed to generate AI answer: ${error.message}`);
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handlePublishAI() {
    if (!selectedQuestion || !aiDraft) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/academy/qa/admin/publish-ai', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: selectedQuestion.id,
          notify_member: notifyMember
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || 'Failed to publish AI answer');
      }

      const { question } = await res.json();
      
      // Update local state
      setQuestions(questions.map(q => q.id === question.id ? question : q));
      setSelectedQuestion(null);
      setAnswerText('');
      setAiDraft(null);
      setNotifyMember(false);
      
      // Refresh stats
      fetchStats();
    } catch (error) {
      console.error('Failed to publish AI answer:', error);
      alert(`Failed to publish AI answer: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion() {
    if (!selectedQuestion) return;
    
    if (!confirm(`Are you sure you want to permanently delete this question?\n\n"${selectedQuestion.question.substring(0, 100)}${selectedQuestion.question.length > 100 ? '...' : ''}"\n\nThis action cannot be undone.`)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/academy/qa/admin/questions/${selectedQuestion.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || 'Failed to delete question');
      }

      // Close modal and refresh questions list and stats
      setSelectedQuestion(null);
      setAnswerText('');
      setAiDraft(null);
      setNotifyMember(false);
      await fetchQuestions();
      await fetchStats(); // Refresh stats to update tile counts
      alert('Question deleted successfully');
    } catch (error) {
      console.error('Failed to delete question:', error);
      alert(`Failed to delete question: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAnswer() {
    if (!selectedQuestion) return;
    
    setSaving(true);
    try {
      const res = await fetch('/api/academy/qa/admin/answer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: selectedQuestion.id,
          answer: answerText,
          answered_by: 'Alan',
          notify_member: notifyMember
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errorData.error || 'Failed to save answer');
      }

      const { question } = await res.json();
      
      // Update local state
      setQuestions(questions.map(q => q.id === question.id ? question : q));
      setSelectedQuestion(null);
      setAnswerText('');
      setAiDraft(null);
      setNotifyMember(false);
      
      // Refresh stats
      fetchStats();
    } catch (error) {
      console.error('Failed to save answer:', error);
      alert(`Failed to save answer: ${error.message}`);
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
                <th 
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('created_at')}
                >
                  Date Asked{getSortIcon('created_at')}
                </th>
                <th 
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('member_name')}
                >
                  Member{getSortIcon('member_name')}
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Question
                </th>
                <th 
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('status')}
                >
                  Status{getSortIcon('status')}
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Answer Source
                </th>
                <th 
                  style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('admin_answered_at')}
                >
                  Answered Date{getSortIcon('admin_answered_at')}
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.map((question) => (
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
                    {formatDate(question.answered_at || question.admin_answered_at || question.ai_answered_at)}
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
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--ar-border)' }}>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '14px' }}>
                Page {currentPage} of {totalPages}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="ar-admin-btn"
                  style={{ opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="ar-admin-btn"
                  style={{ opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
                  setAiDraft(null);
                  setNotifyMember(false);
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Member</div>
                  <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                    {selectedQuestion.member_name || selectedQuestion.member_email || 'Unknown'}
                  </div>
                  <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Page</div>
                  <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                    {selectedQuestion.page_url || '-'}
                  </div>
                  <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Date Asked</div>
                  <div style={{ color: 'var(--ar-text)', fontSize: '14px', marginBottom: '16px' }}>
                    {formatDate(selectedQuestion.created_at)}
                  </div>
                </div>
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI}
                  className="ar-admin-btn"
                  style={{
                    padding: '8px 16px',
                    background: generatingAI ? '#6b7280' : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: generatingAI ? 'not-allowed' : 'pointer',
                    opacity: generatingAI ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                    marginLeft: '16px'
                  }}
                  title="Regenerate AI answer for this question"
                >
                  {generatingAI ? '🔄 Regenerating...' : '🔄 Regenerate AI'}
                </button>
              </div>
              <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginBottom: '8px' }}>Question</div>
              <div style={{ color: 'var(--ar-text)', fontSize: '14px', lineHeight: '1.6' }}>
                {selectedQuestion.question}
              </div>
              {/* 
                AI DRAFT VISIBILITY POLICY:
                
                Admin UI shows AI draft when: answer IS NULL AND ai_answer IS NOT NULL
                - This matches member UI behavior (member sees draft before publishing)
                - Once published (answer IS NOT NULL), this section is hidden
                - Admin can edit AI draft before publishing, or publish directly
              */}
              {(selectedQuestion.ai_answer || aiDraft) && !selectedQuestion.answer && (
                <>
                  <div style={{ color: 'var(--ar-text-muted)', fontSize: '13px', marginTop: '16px', marginBottom: '8px' }}>
                    AI Suggested Answer {aiDraft && '(New Draft)'}
                  </div>
                  <div 
                    style={{ 
                      color: '#1f2937', 
                      fontSize: '13px', 
                      lineHeight: '1.6',
                      padding: '12px',
                      background: '#f0f9ff',
                      borderRadius: '6px',
                      border: '1px solid #3b82f6',
                      marginBottom: '12px',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      overflowX: 'hidden',
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word'
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: formatAIAnswer(aiDraft || selectedQuestion.ai_answer) 
                    }}
                  />
                </>
              )}
            </div>

            {/* AI Actions */}
            {selectedQuestion.status !== 'answered' && (
              <div style={{ marginBottom: '24px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleGenerateAI}
                  disabled={generatingAI}
                  className="ar-admin-btn"
                  style={{
                    flex: 1,
                    background: '#f59e0b',
                    opacity: generatingAI ? 0.5 : 1,
                    cursor: generatingAI ? 'not-allowed' : 'pointer'
                  }}
                >
                  {generatingAI ? 'Generating AI Draft...' : '🤖 Generate AI Draft'}
                </button>
                {aiDraft && (
                  <button
                    onClick={handlePublishAI}
                    disabled={saving}
                    className="ar-admin-btn"
                    style={{
                      flex: 1,
                      background: '#10b981',
                      opacity: saving ? 0.5 : 1,
                      cursor: saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {saving ? 'Publishing...' : '✓ Publish AI Answer'}
                  </button>
                )}
              </div>
            )}

            {/* Answer Textarea */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: '24px' }}>
              <label style={{ color: 'var(--ar-text)', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Your Answer {selectedQuestion.status === 'answered' && '(Edit)'}
              </label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Enter your answer here, or use AI Draft above..."
                style={{
                  flex: 1,
                  minHeight: '200px',
                  maxHeight: '500px',
                  padding: '12px',
                  background: 'var(--ar-card)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}
              />
            </div>

            {/* Notify Member Checkbox */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyMember}
                  onChange={(e) => setNotifyMember(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--ar-text)', fontSize: '14px' }}>
                  Notify member by email when answer is saved
                </span>
              </label>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveAnswer}
                disabled={saving || !answerText.trim()}
                className="ar-admin-btn"
                style={{ 
                  flex: 1,
                  minWidth: '150px',
                  opacity: (!answerText.trim() || saving) ? 0.5 : 1,
                  cursor: (!answerText.trim() || saving) ? 'not-allowed' : 'pointer'
                }}
              >
                {saving ? 'Saving...' : notifyMember ? 'Save & Notify' : 'Save Answer'}
              </button>
              <button
                onClick={handleDeleteQuestion}
                disabled={saving}
                style={{
                  padding: '10px 20px',
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1
                }}
              >
                🗑️ Delete
              </button>
              <button
                onClick={() => {
                  setSelectedQuestion(null);
                  setAnswerText('');
                  setAiDraft(null);
                  setNotifyMember(false);
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
