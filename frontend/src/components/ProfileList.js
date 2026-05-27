import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ProfileList({ onSelectProfile, onAddProfile, onEditProfile }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5050';

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE}/api/profiles`);
      setProfiles(response.data.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load profiles');
      setLoading(false);
    }
  };

  const handleDelete = async (profileId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/api/profiles/${profileId}`);
      await loadProfiles();
    } catch (err) {
      alert('Failed to delete profile: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading profiles...</p>
      </div>
    );
  }

  return (
    <div className="profile-list-page">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="6" fill="url(#gradient)"/>
                <path d="M16 8L20 12H18V20H14V12H12L16 8Z" fill="white"/>
                <rect x="10" y="22" width="12" height="2" rx="1" fill="white"/>
                <defs>
                  <linearGradient id="gradient" x1="0" y1="0" x2="32" y2="32">
                    <stop stopColor="#FF9933"/>
                    <stop offset="1" stopColor="#FF6B6B"/>
                  </linearGradient>
                </defs>
              </svg>
              <h1>Terraform State Visualizer</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="main-container">
        {profiles.length > 0 && (
          <div className="profiles-header">
            <h2>Infrastructure Profiles</h2>
            <button onClick={onAddProfile} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Profile
            </button>
          </div>
        )}

        {error && (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h3>Error Loading Profiles</h3>
            <p>{error}</p>
            <button onClick={loadProfiles} className="btn btn-primary">
              Retry
            </button>
          </div>
        )}

        {!error && profiles.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No Profiles Yet</h3>
            <p>Create your first infrastructure profile to get started</p>
            <button onClick={onAddProfile} className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Profile
            </button>
          </div>
        )}

        {!error && profiles.length > 0 && (
          <div className="profiles-grid">
            {profiles.map(profile => (
              <div
                key={profile.id}
                className="profile-card"
                onClick={() => onSelectProfile(profile)}
              >
                <div className="profile-card-header">
                  <div className="profile-icon">
                    {profile.stateSource === 's3' ? (
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="6" fill="#569A31"/>
                        <text x="16" y="21" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">S3</text>
                      </svg>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                        <rect width="32" height="32" rx="6" fill="#388BFD"/>
                        <path d="M10 10H22V12H10V10ZM10 14H22V16H10V14ZM10 18H18V20H10V18Z" fill="white"/>
                      </svg>
                    )}
                  </div>
                  <div className="profile-card-actions">
                    <button
                      className="profile-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditProfile(profile);
                      }}
                      title="Edit profile"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5L13.5 4.5L5 13H3V11L11.5 2.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      className="profile-delete"
                      onClick={(e) => handleDelete(profile.id, e)}
                      title="Delete profile"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4L12 12M4 12L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="profile-card-body">
                  <h3>{profile.name}</h3>
                  <div className="profile-meta">
                    <span className="profile-source-badge">
                      {profile.stateSource === 's3' ? '☁️ S3' : '💾 Local'}
                    </span>
                    {profile.hasCredentials && (
                      <span className="profile-creds-badge">🔑 Credentials</span>
                    )}
                  </div>
                  {profile.stateSource === 's3' && (
                    <div className="profile-path">
                      s3://{profile.stateBucket}/{profile.stateKey}
                    </div>
                  )}
                  {profile.stateSource === 'local' && (
                    <div className="profile-path">
                      {profile.statePath}
                    </div>
                  )}
                </div>

                <div className="profile-card-footer">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfileList;
