// /pages/academy/admin/ghost.js
// Ghost Login - View any member's dashboard as they see it

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function GhostLogin() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMembers, setFilteredMembers] = useState([]);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    // Filter members based on search query
    if (!searchQuery.trim()) {
      setFilteredMembers(members);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = members.filter(member => {
        const email = (member.email || '').toLowerCase();
        const name = (member.name || '').toLowerCase();
        const memberId = (member.member_id || '').toLowerCase();
        return email.includes(query) || name.includes(query) || memberId.includes(query);
      });
      setFilteredMembers(filtered);
    }
  }, [searchQuery, members]);

  async function fetchMembers() {
    setLoading(true);
    try {
      // Fetch all members (we'll paginate in the UI)
      const res = await fetch('/api/admin/members?limit=1000');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      setMembers(data.members || []);
      setFilteredMembers(data.members || []);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      alert('Failed to load members: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGhostLogin(member) {
    // Open dashboard in new tab with ghost parameter
    const dashboardUrl = `https://www.alanranger.com/academy/dashboard?ghostEmail=${encodeURIComponent(member.email || '')}`;
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="ar-admin-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ar-text)', marginBottom: '8px' }}>
          👻 Ghost Login
        </h1>
        <p style={{ color: 'var(--ar-text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
          View any member's dashboard exactly as they see it. Click on a member to open their dashboard in a new tab.
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by email, name, or member ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '8px',
            color: 'var(--ar-text)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px',
        borderBottom: '1px solid var(--ar-border)',
        paddingBottom: '10px'
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
        <Link href="/academy/admin/ghost" style={{
          padding: '8px 16px',
          background: 'var(--ar-card)',
          border: '1px solid var(--ar-border)',
          borderRadius: '6px',
          color: 'var(--ar-text)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px'
        }}>
          Ghost
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
          Loading members...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px', color: 'var(--ar-text-muted)', fontSize: '14px' }}>
            Showing {filteredMembers.length} of {members.length} members
          </div>

          {/* Members List */}
          <div className="ar-admin-card">
            <div style={{
              display: 'grid',
              gap: '12px',
              maxHeight: 'calc(100vh - 300px)',
              overflowY: 'auto',
              padding: '4px'
            }}>
              {filteredMembers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
                  {searchQuery ? 'No members found matching your search.' : 'No members found.'}
                </div>
              ) : (
                filteredMembers.map((member) => (
                  <div
                    key={member.member_id}
                    onClick={() => handleGhostLogin(member)}
                    style={{
                      padding: '16px',
                      background: 'var(--ar-card)',
                      border: '1px solid var(--ar-border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(229, 114, 0, 0.1)';
                      e.currentTarget.style.borderColor = 'var(--ar-brand)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--ar-card)';
                      e.currentTarget.style.borderColor = 'var(--ar-border)';
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '16px', 
                        fontWeight: 700, 
                        color: 'var(--ar-text)',
                        marginBottom: '4px'
                      }}>
                        {member.name || 'No name'}
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        color: 'var(--ar-text-muted)',
                        marginBottom: '2px'
                      }}>
                        {member.email || 'No email'}
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: 'var(--ar-text-muted)',
                        fontFamily: 'monospace'
                      }}>
                        {member.member_id}
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: '4px',
                      marginLeft: '16px'
                    }}>
                      <div style={{
                        padding: '6px 12px',
                        background: 'var(--ar-brand)',
                        color: '#fff',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        whiteSpace: 'nowrap'
                      }}>
                        👻 View Dashboard
                      </div>
                      {member.plan_summary && (
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--ar-text-muted)',
                          textTransform: 'capitalize'
                        }}>
                          {member.plan_summary.plan_type || 'Unknown'} • {member.plan_summary.status || 'Unknown'}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
