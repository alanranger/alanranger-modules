// Membership Status Tile Component
// This component displays membership information and quiz results
// Use this as a reference for integrating into your dashboard

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MembershipStatusTile({ memberId, memberData }) {
  const [photographyStyle, setPhotographyStyle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch member data including photography style
    if (memberData) {
      setPhotographyStyle(memberData.photography_style);
      setLoading(false);
    } else if (memberId) {
      fetchMemberData();
    }
  }, [memberId, memberData]);

  async function fetchMemberData() {
    try {
      const response = await fetch(`/api/academy/member-data?memberId=${memberId}`);
      const data = await response.json();
      if (data.photography_style) {
        setPhotographyStyle(data.photography_style);
      }
    } catch (error) {
      console.error('Error fetching member data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Get quiz URL with memberId parameter
  const quizUrl = `https://www.alanranger.com/which-photography-style-is-right-for-you?memberId=${memberId}`;

  return (
    <div className="membership-status-tile" style={{
      padding: '20px',
      border: '2px solid #333',
      borderRadius: '8px',
      backgroundColor: '#1a1a1a',
      color: '#f9fafb',
      marginBottom: '20px'
    }}>
      {/* Account Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
        <div style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: '#fbbf24',
          marginRight: '8px'
        }}></div>
        <span style={{ fontSize: '14px', color: '#fbbf24' }}>Account</span>
      </div>

      {/* Membership Status Title */}
      <h2 style={{
        margin: '0 0 20px 0',
        fontSize: '20px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        Membership Status
        <span style={{ fontSize: '16px' }}>👤</span>
      </h2>

      {/* Member Information */}
      <div style={{ marginBottom: '20px' }}>
        <p><strong>Name:</strong> {memberData?.name || 'N/A'}</p>
        <p><strong>Email:</strong> {memberData?.email || 'N/A'}</p>
        <p><strong>Member ID:</strong> {memberId || 'N/A'}</p>
        <p><strong>Status:</strong> {memberData?.plan_summary?.status === 'TRIALING' ? 'Trial member' : 'Annual member'}</p>
        {memberData?.plan_summary?.expiry_date && (
          <p><strong>Trial End Date:</strong> {
            new Date(memberData.plan_summary.expiry_date).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          } ({Math.ceil((new Date(memberData.plan_summary.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))} days)</p>
        )}
      </div>

      {/* Photography Style Quiz Result */}
      {photographyStyle ? (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#2a2a2a',
          borderRadius: '6px',
          border: '1px solid #444'
        }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#f97316' }}>
            Your Photography Style Is:
          </h3>
          <p style={{
            margin: '0',
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#f97316'
          }}>
            {photographyStyle}
          </p>
        </div>
      ) : (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: '#2a2a2a',
          borderRadius: '6px',
          border: '1px solid #444'
        }}>
          <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            Discover your photography style!
          </p>
          <a
            href={quizUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: '#f97316',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '50px',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
          >
            Take Photography Personality Quiz
          </a>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexDirection: 'column' }}>
        <button style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#4b5563',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          cursor: 'pointer',
          fontSize: '14px'
        }}>
          Manage subscription
        </button>
        <button style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#f97316',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          Upgrade Membership
        </button>
      </div>
    </div>
  );
}
