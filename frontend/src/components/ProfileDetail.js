import React, { useEffect, useState } from 'react';
import axios from 'axios';

function ProfileDetail({ profile, onBack }) {
  const [resources, setResources] = useState([]);
  const [groupedResources, setGroupedResources] = useState({});
  const [selectedResource, setSelectedResource] = useState(null);
  const [expandedTypes, setExpandedTypes] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [driftData, setDriftData] = useState(null);
  const [driftLoading, setDriftLoading] = useState(false);
  const [viewMode, setViewMode] = useState('infra');
  const [credentialStatus, setCredentialStatus] = useState(null);
  const [credentialChecking, setCredentialChecking] = useState(false);
  const [stateMetadata, setStateMetadata] = useState(null);
  const [showOnlyDrifted, setShowOnlyDrifted] = useState(false);

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5050';

  // AWS Service Icons
  const getAWSIcon = (type) => {
    const icons = {
      'aws_instance': { icon: 'EC2', color: '#FF9900' },
      'aws_s3_bucket': { icon: 'S3', color: '#569A31' },
      'aws_lambda_function': { icon: 'λ', color: '#FF9900' },
      'aws_dynamodb_table': { icon: 'DDB', color: '#4053D6' },
      'aws_vpc': { icon: 'VPC', color: '#3B48CC' },
      'aws_subnet': { icon: 'SUB', color: '#7AA116' },
      'aws_security_group': { icon: 'SG', color: '#DD344C' },
      'aws_iam_role': { icon: 'IAM', color: '#DD344C' },
      'aws_iam_policy': { icon: 'POL', color: '#DD344C' },
      'aws_db_instance': { icon: 'RDS', color: '#4053D6' },
      'aws_ecs_cluster': { icon: 'ECS', color: '#FF9900' },
      'aws_ecs_service': { icon: 'ECS', color: '#FF9900' },
      'aws_cloudwatch_log_group': { icon: 'CW', color: '#E7157B' },
      'aws_route_table': { icon: 'RT', color: '#7AA116' },
      'aws_internet_gateway': { icon: 'IGW', color: '#7AA116' },
      'aws_nat_gateway': { icon: 'NAT', color: '#7AA116' },
      'aws_eip': { icon: 'EIP', color: '#7AA116' },
      'aws_elb': { icon: 'ELB', color: '#8C4FFF' },
      'aws_alb': { icon: 'ALB', color: '#8C4FFF' },
      'aws_api_gateway_rest_api': { icon: 'API', color: '#FF4F8B' },
      'default': { icon: 'AWS', color: '#FF9900' }
    };
    return icons[type] || icons['default'];
  };

  // Category colors
  const getCategoryColor = (category) => {
    const colors = {
      'compute': '#FF9933',
      'storage': '#3FB950',
      'network': '#388BFD',
      'iam': '#A371F7',
      'database': '#F778BA',
      'monitoring': '#FDCB6E',
      'api': '#00D9FF',
      'other': '#8B949E'
    };
    return colors[category] || colors['other'];
  };

  // Check drift
  const handleCheckDrift = async () => {
    // Don't run drift detection if no credentials
    if (!profile.hasCredentials) {
      setViewMode('drift');
      setDriftData(null);
      return;
    }

    setDriftLoading(true);
    setViewMode('drift');
    setShowOnlyDrifted(true); // Auto-enable drift filter
    try {
      const response = await axios.post(`${API_BASE}/api/profiles/${profile.id}/drift/detect`);
      setDriftData(response.data.data);
      setDriftLoading(false);
    } catch (err) {
      setError('Failed to check drift: ' + err.message);
      setDriftLoading(false);
    }
  };

  // Validate AWS credentials
  const validateCredentials = async () => {
    if (!profile.hasCredentials) {
      // Clear any old drift data when no credentials
      setDriftData(null);
      setCredentialStatus({ valid: false, reason: 'No credentials configured' });
      return;
    }

    setCredentialChecking(true);
    try {
      const response = await axios.post(`${API_BASE}/api/profiles/${profile.id}/credentials/validate`);
      setCredentialStatus(response.data);
      setCredentialChecking(false);

      // Don't auto-trigger drift on initial load
      // User must manually switch to drift mode
    } catch (err) {
      console.error('Failed to validate credentials:', err);
      setCredentialChecking(false);
    }
  };

  // Load resources
  const loadResources = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE}/api/profiles/${profile.id}/graph`);
      const { data, meta } = response.data;

      // Store state metadata
      setStateMetadata({
        lastModified: meta.lastModified,
        source: meta.source,
        nodeCount: meta.nodeCount
      });

      const resourceList = data.nodes.map(node => ({
        id: node.data.id,
        name: node.data.label,
        type: node.data.type,
        category: node.data.category,
        color: node.data.color,
        provider: node.data.provider,
        attributes: node.data.attributes
      }));

      setResources(resourceList);

      // Group resources by type
      const grouped = resourceList.reduce((acc, resource) => {
        if (!acc[resource.type]) {
          acc[resource.type] = [];
        }
        acc[resource.type].push(resource);
        return acc;
      }, {});

      setGroupedResources(grouped);
      setLoading(false);

      // After loading resources, validate credentials and auto-check drift
      validateCredentials();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load resources');
      setLoading(false);
    }
  };

  // Calculate how old the state file is
  const getStateAge = () => {
    if (!stateMetadata || !stateMetadata.lastModified) return null;

    const lastModified = new Date(stateMetadata.lastModified);
    const now = new Date();
    const diffMs = now - lastModified;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return { value: diffDays, unit: 'day', isOld: diffDays > 1 };
    } else if (diffHours > 0) {
      return { value: diffHours, unit: 'hour', isOld: diffHours > 24 };
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return { value: diffMinutes, unit: 'minute', isOld: false };
    }
  };

  const stateAge = getStateAge();

  // Toggle resource type expansion
  const toggleType = (type) => {
    const newExpanded = new Set(expandedTypes);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedTypes(newExpanded);
  };

  // Get filtered types
  const getFilteredTypes = () => {
    let types = Object.keys(groupedResources);

    // Filter by category
    if (categoryFilter !== 'all') {
      types = types.filter(type => {
        const resource = groupedResources[type][0];
        return resource.category === categoryFilter;
      });
    }

    // Filter by search
    if (searchQuery) {
      types = types.filter(type => {
        const typeMatches = type.toLowerCase().includes(searchQuery.toLowerCase());
        const resourceMatches = groupedResources[type].some(r =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.id.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return typeMatches || resourceMatches;
      });
    }

    // Filter by drift status
    if (showOnlyDrifted && driftData) {
      types = types.filter(type => {
        return groupedResources[type].some(resource => {
          const drift = getDriftStatus(resource.id);
          return drift && (drift.driftStatus === 'drifted' || drift.driftStatus === 'deleted');
        });
      });
    }

    return types.sort();
  };

  // Get filtered resources for a type (used when rendering)
  const getFilteredResourcesForType = (type) => {
    let resources = groupedResources[type];

    // If showing only drifted, filter resources within the type
    if (showOnlyDrifted && driftData) {
      resources = resources.filter(resource => {
        const drift = getDriftStatus(resource.id);
        return drift && (drift.driftStatus === 'drifted' || drift.driftStatus === 'deleted');
      });
    }

    return resources;
  };

  // Switch to current infra view
  const handleCurrentInfra = () => {
    setViewMode('infra');
    setShowOnlyDrifted(false); // Reset drift filter when switching to infra view
    setDriftData(null); // Clear old drift data
  };

  // Get drift status for a resource
  const getDriftStatus = (resourceId) => {
    if (!driftData) return null;
    return driftData.resources.find(r => r.resourceId === resourceId);
  };

  useEffect(() => {
    loadResources();
  }, [profile.id]);

  const categories = [
    { id: 'all', label: 'All', color: '#8B949E' },
    { id: 'compute', label: 'Compute', color: '#FF9933' },
    { id: 'storage', label: 'Storage', color: '#3FB950' },
    { id: 'network', label: 'Network', color: '#388BFD' },
    { id: 'iam', label: 'IAM', color: '#A371F7' },
    { id: 'database', label: 'Database', color: '#F778BA' }
  ];

  const filteredTypes = getFilteredTypes();
  const totalResources = filteredTypes.reduce((sum, type) => sum + groupedResources[type].length, 0);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner"></div>
        <p>Loading infrastructure...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Infrastructure</h3>
        <p>{error}</p>
        <button onClick={onBack} className="btn btn-primary">
          Back to Profiles
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={onBack} className="btn">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="logo">
              <h1>{profile.name}</h1>
            </div>
          </div>
          <div className="header-actions">
            {/* State File Timestamp - Top Right */}
            {stateAge && (
              <div className={`state-timestamp ${stateAge.isOld ? 'state-timestamp-warning' : ''}`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" fill="none"/>
                  <path d="M6 3V6L8 7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
                <span>Statefile: {stateAge.value}{stateAge.unit.charAt(0)} ago</span>
              </div>
            )}
            <div className="search-container">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2"/>
                <line x1="11" y1="11" x2="14" y2="14" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <input
                type="text"
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>

            {/* View Mode Toggle Switch */}
            <div className="view-toggle">
              <button
                className={`toggle-option ${viewMode === 'infra' ? 'active' : ''}`}
                onClick={handleCurrentInfra}
                disabled={driftLoading || credentialChecking}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>Current Infra</span>
              </button>
              <button
                className={`toggle-option ${viewMode === 'drift' ? 'active' : ''}`}
                onClick={handleCheckDrift}
                disabled={driftLoading || credentialChecking}
              >
                {driftLoading || credentialChecking ? (
                  <>
                    <div className="small-spinner"></div>
                    <span>{credentialChecking ? 'Validating...' : 'Checking...'}</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2L11 5H9V9H7V5H5L8 2Z" fill="currentColor"/>
                      <path d="M8 14L5 11H7V7H9V11H11L8 14Z" fill="currentColor"/>
                    </svg>
                    <span>Drift Detection</span>
                  </>
                )}
              </button>
              <div className={`toggle-slider ${viewMode === 'drift' ? 'drift-active' : ''}`}></div>
            </div>

            {/* Credential Status Badge */}
            {credentialStatus && !credentialStatus.valid && (
              <div className="credential-warning">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="#FFA500" strokeWidth="2" fill="none"/>
                  <text x="8" y="11" textAnchor="middle" fontSize="10" fill="#FFA500" fontWeight="bold">!</text>
                </svg>
                <span>{credentialStatus.expired ? 'Credentials Expired' : 'Invalid Credentials'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Category Filters */}
        <div className="category-filters">
          {categories.map(cat => {
            const count = cat.id === 'all'
              ? totalResources
              : Object.keys(groupedResources).filter(type => groupedResources[type][0].category === cat.id).reduce((sum, type) => sum + groupedResources[type].length, 0);

            return (
              <button
                key={cat.id}
                className={`category-btn ${categoryFilter === cat.id ? 'active' : ''}`}
                style={{
                  '--category-color': cat.color
                }}
                onClick={() => setCategoryFilter(cat.id)}
              >
                <span className="category-label">{cat.label}</span>
                <span className="category-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* State Freshness Warning */}
        {stateAge && stateAge.isOld && (
          <div className="state-warning-banner">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#FFA500" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Potentially Stale Data</strong>
              <p>This state file was last modified {stateAge.value} {stateAge.unit}{stateAge.value !== 1 ? 's' : ''} ago.
              The infrastructure shown may not reflect current AWS state.
              {profile.hasCredentials ? ' Run drift detection to verify.' : ' Add AWS credentials to enable drift detection.'}</p>
            </div>
          </div>
        )}

        {/* No Credentials Warning */}
        {!profile.hasCredentials && viewMode === 'drift' && (
          <div className="state-warning-banner">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <div>
              <strong>Drift Detection Unavailable</strong>
              <p>AWS credentials are not configured for this profile. Drift detection requires valid AWS credentials to compare state file with live AWS resources.</p>
            </div>
          </div>
        )}

        {/* Drift Summary - Only show in drift mode */}
        {viewMode === 'drift' && driftData && (
          <div className="drift-summary">
            <div className="drift-summary-stats">
              <div className="drift-stat">
                <span className="drift-stat-icon" style={{ color: '#3FB950' }}>✓</span>
                <div>
                  <div className="drift-stat-value">{driftData.summary.totalInSync}</div>
                  <div className="drift-stat-label">In Sync</div>
                </div>
              </div>
              <div className="drift-stat">
                <span className="drift-stat-icon" style={{ color: '#F85149' }}>✕</span>
                <div>
                  <div className="drift-stat-value">{driftData.summary.totalDrifted}</div>
                  <div className="drift-stat-label">Drifted</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Drift Detection Loading Screen */}
      {viewMode === 'drift' && driftLoading && !driftData && (
        <div className="drift-loading-screen">
          <div className="drift-loading-content">
            <div className="drift-loading-spinner"></div>
            <h2>Detecting Infrastructure Drift</h2>
            <p>Comparing state file with live AWS resources...</p>
            <div className="drift-loading-steps">
              <div className="loading-step">
                <div className="step-icon">✓</div>
                <span>Reading Terraform state</span>
              </div>
              <div className="loading-step">
                <div className="step-icon active">
                  <div className="step-spinner"></div>
                </div>
                <span>Querying AWS resources</span>
              </div>
              <div className="loading-step pending">
                <div className="step-icon">⋯</div>
                <span>Analyzing differences</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!(viewMode === 'drift' && driftLoading && !driftData) && (
        <div className="main-container">
          {/* Hide resources in drift mode if no credentials */}
          {!(viewMode === 'drift' && !profile.hasCredentials) && (
          <div className="resource-types-list">
          {filteredTypes.map(type => {
            const typeResources = getFilteredResourcesForType(type);
            const isExpanded = expandedTypes.has(type);
            const iconData = getAWSIcon(type);

            return (
              <div key={type} className="resource-type-group">
                <div className="resource-type-header" onClick={() => toggleType(type)}>
                  <div className="type-header-left">
                    <div
                      className="aws-service-icon"
                      style={{ backgroundColor: iconData.color }}
                    >
                      {iconData.icon}
                    </div>
                    <div className="type-info">
                      <div className="type-name">{type}</div>
                      <div className="type-count">{typeResources.length} resource{typeResources.length !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="type-header-right">
                    <span
                      className="category-pill"
                      style={{ backgroundColor: getCategoryColor(typeResources[0].category) }}
                    >
                      {typeResources[0].category}
                    </span>
                    <svg
                      className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                    >
                      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div className="resource-list">
                    {typeResources.map(resource => {
                      const drift = viewMode === 'drift' ? getDriftStatus(resource.id) : null;
                      const hasDrift = drift && (drift.driftStatus === 'drifted' || drift.driftStatus === 'deleted');

                      return (
                        <div
                          key={resource.id}
                          className={`resource-item ${hasDrift ? 'has-drift' : ''}`}
                          onClick={() => setSelectedResource(resource)}
                        >
                          <div className="resource-item-left">
                            {viewMode === 'drift' && (
                              <div
                                className="resource-status-dot"
                                style={{
                                  backgroundColor: drift
                                    ? drift.driftStatus === 'in_sync'
                                      ? '#3FB950'
                                      : drift.driftStatus === 'drifted' || drift.driftStatus === 'deleted'
                                      ? '#F85149'
                                      : '#8B949E'
                                    : '#8B949E'
                                }}
                              />
                            )}
                            <div className="resource-item-info">
                              <div className="resource-item-name">{resource.name}</div>
                              <div className="resource-item-id">{resource.id}</div>
                            </div>
                          </div>
                          <div className="resource-item-right">
                            {viewMode === 'drift' && drift && (
                              <span className={`drift-badge drift-${drift.driftStatus}`}>
                                {drift.driftStatus === 'in_sync' && '✓ In Sync'}
                                {drift.driftStatus === 'drifted' && '⚠ Drifted'}
                                {drift.driftStatus === 'deleted' && '✕ Deleted'}
                                {drift.driftStatus === 'error' && '⚠ Error'}
                                {drift.driftStatus === 'unsupported' && '− Not Supported'}
                              </span>
                            )}
                            {resource.attributes?.id && (
                              <span className="resource-aws-id">{resource.attributes.id}</span>
                            )}
                            <svg className="chevron-right" width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}
      </div>
      )}

      {/* Resource Detail Modal */}
      {selectedResource && (
        <div className="modal-overlay" onClick={() => setSelectedResource(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <div
                  className="aws-service-icon large"
                  style={{ backgroundColor: getAWSIcon(selectedResource.type).color }}
                >
                  {getAWSIcon(selectedResource.type).icon}
                </div>
                <div>
                  <h2>{selectedResource.name}</h2>
                  <div className="modal-subtitle">{selectedResource.type}</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedResource(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {/* Drift Status - Only show in drift mode */}
              {viewMode === 'drift' && getDriftStatus(selectedResource.id) && (
                <div className="detail-section">
                  <h3>Drift Status</h3>
                  <div className={`drift-status-card drift-${getDriftStatus(selectedResource.id).driftStatus}`}>
                    <div className="drift-status-header">
                      <div className="drift-status-icon">
                        {getDriftStatus(selectedResource.id).driftStatus === 'in_sync' && '✓'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'drifted' && '⚠'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'deleted' && '✕'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'error' && '⚠'}
                      </div>
                      <div className="drift-status-text">
                        <h4>
                          {getDriftStatus(selectedResource.id).driftStatus === 'in_sync' && 'In Sync'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'drifted' && 'Configuration Drift Detected'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'deleted' && 'Resource Deleted'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'error' && 'Error Checking Drift'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'unsupported' && 'Not Supported'}
                        </h4>
                        <p>
                          Last checked: {new Date(getDriftStatus(selectedResource.id).checkedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {getDriftStatus(selectedResource.id).driftDetails?.differences && (
                      <div className="drift-differences">
                        <h5>Detected Changes</h5>
                        {getDriftStatus(selectedResource.id).driftDetails.differences.map((diff, idx) => (
                          <div key={idx} className="drift-diff">
                            <span className="diff-attribute">{diff.attribute}</span>
                            <div className="diff-values">
                              <div className="diff-value expected">
                                <span className="diff-label">Expected (State File)</span>
                                <code>{diff.expected}</code>
                              </div>
                              <span className="diff-arrow">→</span>
                              <div className="diff-value actual">
                                <span className="diff-label">Actual (AWS)</span>
                                <code>{diff.actual}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {getDriftStatus(selectedResource.id).driftDetails?.message && (
                      <div className="drift-message">
                        {getDriftStatus(selectedResource.id).driftDetails.message}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Resource Details */}
              <div className="detail-section">
                <h3>Resource Details</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">Resource ID</div>
                    <div className="detail-value code">{selectedResource.id}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Type</div>
                    <div className="detail-value">{selectedResource.type}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Category</div>
                    <div
                      className="detail-value badge"
                      style={{ backgroundColor: getCategoryColor(selectedResource.category) }}
                    >
                      {selectedResource.category}
                    </div>
                  </div>
                  {selectedResource.attributes?.id && (
                    <div className="detail-item">
                      <div className="detail-label">AWS ID</div>
                      <div className="detail-value code">{selectedResource.attributes.id}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Attributes */}
              <div className="detail-section">
                <h3>Attributes</h3>
                <pre className="code-block">
                  {JSON.stringify(selectedResource.attributes, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileDetail;
