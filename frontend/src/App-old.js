import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
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
  const [showDriftOnly, setShowDriftOnly] = useState(false);
  const [viewMode, setViewMode] = useState('infra'); // 'infra' or 'drift'

  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  // AWS Service Icons (using simple styled divs with text)
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

  // Load resources
  const loadResources = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE}/api/graph`);
      const { data } = response.data;

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
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load resources');
      setLoading(false);
    }
  };

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

    // Filter by drift
    if (showDriftOnly && driftData) {
      types = types.filter(type => {
        return groupedResources[type].some(resource => {
          const drift = getDriftStatus(resource.id);
          return drift && (drift.driftStatus === 'drifted' || drift.driftStatus === 'deleted');
        });
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

    return types.sort();
  };

  // Reload
  const handleReload = async () => {
    try {
      await axios.post(`${API_BASE}/api/reload`);
      await loadResources();
    } catch (err) {
      setError('Failed to reload: ' + err.message);
    }
  };

  // Check drift
  const handleCheckDrift = async () => {
    setDriftLoading(true);
    setViewMode('drift');
    try {
      const response = await axios.post(`${API_BASE}/api/drift/detect`);
      setDriftData(response.data.data);
      setDriftLoading(false);
    } catch (err) {
      setError('Failed to check drift: ' + err.message);
      setDriftLoading(false);
    }
  };

  // Switch to current infra view
  const handleCurrentInfra = () => {
    setViewMode('infra');
    setShowDriftOnly(false);
  };

  // Get drift status for a resource
  const getDriftStatus = (resourceId) => {
    if (!driftData) return null;
    return driftData.resources.find(r => r.resourceId === resourceId);
  };

  useEffect(() => {
    loadResources();
  }, []);

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

  return (
    <div className="App">
      {/* Header */}
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
            <div className="stats-badges">
              <div className="stat-badge">
                <span className="stat-value">{totalResources}</span>
                <span className="stat-label">Resources</span>
              </div>
              <div className="stat-badge">
                <span className="stat-value">{filteredTypes.length}</span>
                <span className="stat-label">Types</span>
              </div>
            </div>
          </div>
          <div className="header-actions">
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
            <button
              onClick={handleCurrentInfra}
              className={`btn ${viewMode === 'infra' ? 'btn-primary' : ''}`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <rect x="9" y="2" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <rect x="2" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                <rect x="9" y="9" width="5" height="5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              </svg>
              Current Infra
            </button>
            <button
              onClick={handleCheckDrift}
              className={`btn btn-drift ${viewMode === 'drift' ? 'btn-primary' : ''}`}
              disabled={driftLoading}
            >
              {driftLoading ? (
                <>
                  <div className="small-spinner"></div>
                  Checking...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2V8L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" fill="none"/>
                  </svg>
                  Check Drift
                </>
              )}
            </button>
          </div>
        </div>

        {/* Drift Summary */}
        {driftData && (
          <div className="drift-summary">
            <div className="drift-summary-stats">
              <div className="drift-stat">
                <span className="drift-stat-icon" style={{ color: '#3FB950' }}>✓</span>
                <span className="drift-stat-value">{driftData.summary.totalInSync}</span>
                <span className="drift-stat-label">In Sync</span>
              </div>
              <div className="drift-stat">
                <span className="drift-stat-icon" style={{ color: '#f85149' }}>⚠</span>
                <span className="drift-stat-value">{driftData.summary.totalDrifted}</span>
                <span className="drift-stat-label">Drifted</span>
              </div>
            </div>
            <button
              className={`btn-small ${showDriftOnly ? 'active' : ''}`}
              onClick={() => setShowDriftOnly(!showDriftOnly)}
            >
              {showDriftOnly ? 'Show All' : 'Show Drift Only'}
            </button>
          </div>
        )}

        {/* Category Filters */}
        <div className="category-filters">
          {categories.map(cat => {
            const count = cat.id === 'all'
              ? resources.length
              : resources.filter(r => r.category === cat.id).length;

            return (
              <button
                key={cat.id}
                className={`category-btn ${categoryFilter === cat.id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat.id)}
                style={{ '--category-color': cat.color }}
              >
                <span className="category-label">{cat.label}</span>
                <span className="category-count">{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-container">
        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading resources...</p>
          </div>
        )}

        {error && (
          <div className="error-state">
            <div className="error-icon">❌</div>
            <h3>Error Loading Resources</h3>
            <p>{error}</p>
            <button onClick={loadResources} className="btn btn-primary">
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="resource-types-list">
            {filteredTypes.map(type => {
              const typeResources = groupedResources[type];
              const isExpanded = expandedTypes.has(type);
              const awsIcon = getAWSIcon(type);
              const categoryColor = typeResources[0]?.color || '#8B949E';

              return (
                <div key={type} className="resource-type-group">
                  <div
                    className="resource-type-header"
                    onClick={() => toggleType(type)}
                  >
                    <div className="type-header-left">
                      <div className="aws-service-icon" style={{ backgroundColor: awsIcon.color }}>
                        {awsIcon.icon}
                      </div>
                      <div className="type-info">
                        <h3 className="type-name">{type}</h3>
                        <p className="type-count">{typeResources.length} {typeResources.length === 1 ? 'resource' : 'resources'}</p>
                      </div>
                    </div>
                    <div className="type-header-right">
                      <div className="category-pill" style={{ backgroundColor: categoryColor }}>
                        {typeResources[0]?.category}
                      </div>
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
                        const driftStatus = getDriftStatus(resource.id);
                        return (
                          <div
                            key={resource.id}
                            className={`resource-item ${driftStatus?.driftStatus === 'drifted' || driftStatus?.driftStatus === 'deleted' ? 'has-drift' : ''}`}
                            onClick={() => setSelectedResource(resource)}
                          >
                            <div className="resource-item-left">
                              <div className="resource-status-dot" style={{ backgroundColor: categoryColor }}></div>
                              <div className="resource-item-info">
                                <h4 className="resource-item-name">{resource.name}</h4>
                                <p className="resource-item-id">{resource.id}</p>
                              </div>
                            </div>
                            <div className="resource-item-right">
                              {driftStatus && (
                                <div className={`drift-badge drift-${driftStatus.driftStatus}`}>
                                  {driftStatus.driftStatus === 'in_sync' && '✓ In Sync'}
                                  {driftStatus.driftStatus === 'drifted' && '⚠ Drifted'}
                                  {driftStatus.driftStatus === 'deleted' && '✕ Deleted'}
                                  {driftStatus.driftStatus === 'error' && '! Error'}
                                  {driftStatus.driftStatus === 'unsupported' && '- N/A'}
                                </div>
                              )}
                              {resource.attributes?.id && (
                                <span className="resource-aws-id">{resource.attributes.id}</span>
                              )}
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="chevron-right">
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

            {filteredTypes.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>No resources found</h3>
                <p>Try adjusting your filters or search query</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Detail Modal */}
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
                  <p className="modal-subtitle">{selectedResource.type}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedResource(null)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {/* Drift Status Section */}
              {getDriftStatus(selectedResource.id) && (
                <div className="detail-section">
                  <h3>Drift Status</h3>
                  <div className={`drift-status-card drift-${getDriftStatus(selectedResource.id).driftStatus}`}>
                    <div className="drift-status-header">
                      <div className="drift-status-icon">
                        {getDriftStatus(selectedResource.id).driftStatus === 'in_sync' && '✓'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'drifted' && '⚠'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'deleted' && '✕'}
                        {getDriftStatus(selectedResource.id).driftStatus === 'error' && '!'}
                      </div>
                      <div className="drift-status-text">
                        <h4>
                          {getDriftStatus(selectedResource.id).driftStatus === 'in_sync' && 'Resource is in sync'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'drifted' && 'Resource has drifted'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'deleted' && 'Resource deleted from AWS'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'error' && 'Error checking drift'}
                          {getDriftStatus(selectedResource.id).driftStatus === 'unsupported' && 'Drift check not supported'}
                        </h4>
                        <p>Last checked: {new Date(getDriftStatus(selectedResource.id).checkedAt).toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Show differences if drifted */}
                    {getDriftStatus(selectedResource.id).driftStatus === 'drifted' &&
                      getDriftStatus(selectedResource.id).driftDetails?.differences && (
                      <div className="drift-differences">
                        <h5>Detected Changes:</h5>
                        {getDriftStatus(selectedResource.id).driftDetails.differences.map((diff, idx) => (
                          <div key={idx} className="drift-diff">
                            <span className="diff-attribute">{diff.attribute}</span>
                            <div className="diff-values">
                              <div className="diff-value expected">
                                <span className="diff-label">Expected:</span>
                                <code>{diff.expected || 'null'}</code>
                              </div>
                              <span className="diff-arrow">→</span>
                              <div className="diff-value actual">
                                <span className="diff-label">Actual:</span>
                                <code>{diff.actual || 'null'}</code>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Show message for deleted or error */}
                    {getDriftStatus(selectedResource.id).driftDetails?.message && (
                      <div className="drift-message">
                        {getDriftStatus(selectedResource.id).driftDetails.message}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <h3>Resource Information</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Terraform ID</span>
                    <span className="detail-value code">{selectedResource.id}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Resource Type</span>
                    <span className="detail-value">{selectedResource.type}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Category</span>
                    <span
                      className="detail-value badge"
                      style={{ backgroundColor: selectedResource.color }}
                    >
                      {selectedResource.category}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Provider</span>
                    <span className="detail-value">{selectedResource.provider}</span>
                  </div>
                  {selectedResource.attributes?.id && (
                    <div className="detail-item">
                      <span className="detail-label">AWS Resource ID</span>
                      <span className="detail-value code">{selectedResource.attributes.id}</span>
                    </div>
                  )}
                  {selectedResource.attributes?.region && (
                    <div className="detail-item">
                      <span className="detail-label">Region</span>
                      <span className="detail-value">{selectedResource.attributes.region}</span>
                    </div>
                  )}
                </div>
              </div>

              {selectedResource.attributes && Object.keys(selectedResource.attributes).length > 0 && (
                <div className="detail-section">
                  <h3>All Attributes</h3>
                  <pre className="code-block">
{JSON.stringify(selectedResource.attributes, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
