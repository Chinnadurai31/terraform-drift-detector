import React from 'react';

function LoginPage({ onLogin }) {
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="animated-logo">
          <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
            <defs>
              <linearGradient id="logo-gradient" x1="0" y1="0" x2="120" y2="120">
                <stop offset="0%" stopColor="#FF9933"/>
                <stop offset="50%" stopColor="#FF6B6B"/>
                <stop offset="100%" stopColor="#388BFD"/>
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Infrastructure layers */}
            <rect className="infra-layer layer-1" x="20" y="80" width="30" height="30" rx="4" fill="url(#logo-gradient)" opacity="0.8"/>
            <rect className="infra-layer layer-2" x="70" y="80" width="30" height="30" rx="4" fill="url(#logo-gradient)" opacity="0.8"/>

            <rect className="infra-layer layer-3" x="20" y="40" width="30" height="30" rx="4" fill="url(#logo-gradient)" opacity="0.9"/>
            <rect className="infra-layer layer-4" x="45" y="40" width="30" height="30" rx="4" fill="url(#logo-gradient)" opacity="0.9"/>
            <rect className="infra-layer layer-5" x="70" y="40" width="30" height="30" rx="4" fill="url(#logo-gradient)" opacity="0.9"/>

            <circle className="infra-layer layer-6" cx="60" cy="15" r="10" fill="url(#logo-gradient)" filter="url(#glow)"/>

            {/* Connecting lines */}
            <line className="connection-line line-1" x1="35" y1="80" x2="35" y2="70" stroke="#388BFD" strokeWidth="2" opacity="0.6"/>
            <line className="connection-line line-2" x1="85" y1="80" x2="85" y2="70" stroke="#388BFD" strokeWidth="2" opacity="0.6"/>
            <line className="connection-line line-3" x1="35" y1="40" x2="60" y2="25" stroke="#388BFD" strokeWidth="2" opacity="0.6"/>
            <line className="connection-line line-4" x1="60" y1="40" x2="60" y2="25" stroke="#388BFD" strokeWidth="2" opacity="0.6"/>
            <line className="connection-line line-5" x1="85" y1="40" x2="60" y2="25" stroke="#388BFD" strokeWidth="2" opacity="0.6"/>
          </svg>
        </div>

        <div className="login-content">
          <h1 className="login-title">Terraform State Visualizer</h1>
          <p className="login-subtitle">Visualize and monitor your infrastructure state with real-time drift detection</p>

          <button onClick={onLogin} className="login-button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L13 5H11V11H9V5H7L10 2Z" fill="currentColor"/>
              <rect x="4" y="13" width="12" height="2" rx="1" fill="currentColor"/>
              <path d="M3 17H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Enter Dashboard
          </button>
        </div>

        <div className="login-features">
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <span>Multi-Profile Support</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">🔍</span>
            <span>Drift Detection</span>
          </div>
          <div className="feature-item">
            <span className="feature-icon">☁️</span>
            <span>S3 & Local State</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
