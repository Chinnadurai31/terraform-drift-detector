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

  // Plan Analyzer state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planInput, setPlanInput] = useState('');
  const [planParseError, setPlanParseError] = useState(null);
  const [planAnalysis, setPlanAnalysis] = useState(null);

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
      'aws_rds_cluster': { icon: 'RDS', color: '#4053D6' },
      'aws_ecs_cluster': { icon: 'ECS', color: '#FF9900' },
      'aws_ecs_service': { icon: 'ECS', color: '#FF9900' },
      'aws_eks_cluster': { icon: 'EKS', color: '#FF9900' },
      'aws_eks_node_group': { icon: 'EKS', color: '#FF9900' },
      'aws_ecr_repository': { icon: 'ECR', color: '#FF9900' },
      'aws_elasticache_cluster': { icon: 'EC', color: '#C7131F' },
      'aws_elasticache_replication_group': { icon: 'EC', color: '#C7131F' },
      'aws_elasticsearch_domain': { icon: 'ES', color: '#005EB8' },
      'aws_opensearch_domain': { icon: 'OS', color: '#005EB8' },
      'aws_sqs_queue': { icon: 'SQS', color: '#FF4F8B' },
      'aws_sns_topic': { icon: 'SNS', color: '#FF4F8B' },
      'aws_cloudwatch_log_group': { icon: 'CW', color: '#E7157B' },
      'aws_route_table': { icon: 'RT', color: '#7AA116' },
      'aws_internet_gateway': { icon: 'IGW', color: '#7AA116' },
      'aws_nat_gateway': { icon: 'NAT', color: '#7AA116' },
      'aws_eip': { icon: 'EIP', color: '#7AA116' },
      'aws_network_acl': { icon: 'ACL', color: '#7AA116' },
      'aws_vpc_endpoint': { icon: 'EPT', color: '#7AA116' },
      'aws_route53_zone': { icon: 'R53', color: '#8C4FFF' },
      'aws_route53_record': { icon: 'R53', color: '#8C4FFF' },
      'aws_elb': { icon: 'ELB', color: '#8C4FFF' },
      'aws_alb': { icon: 'ALB', color: '#8C4FFF' },
      'aws_lb': { icon: 'ALB', color: '#8C4FFF' },
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
    setShowOnlyDrifted(false);
    setDriftData(null);
    setShowPlanModal(false);
  };

  // Get drift status for a resource
  const getDriftStatus = (resourceId) => {
    if (!driftData) return null;
    return driftData.resources.find(r => r.resourceId === resourceId);
  };

  // Diff two flat/tag objects — returns [{attribute, before, after}]
  const getObjectDiffs = (before, after) => {
    const diffs = [];
    if (!before || !after) return diffs;

    const flattenTags = (obj, prefix = '') => {
      const out = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (k === 'tags' || k === 'tags_all') {
          for (const [tk, tv] of Object.entries(v || {})) {
            out[`${k}.${tk}`] = tv;
          }
        } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          // skip deep nested
        } else if (!Array.isArray(v)) {
          out[prefix + k] = v === null ? 'null' : String(v);
        }
      }
      return out;
    };

    const bFlat = flattenTags(before);
    const aFlat = flattenTags(after);
    const allKeys = new Set([...Object.keys(bFlat), ...Object.keys(aFlat)]);

    for (const key of allKeys) {
      if (bFlat[key] !== aFlat[key]) {
        diffs.push({
          attribute: key,
          before: bFlat[key] ?? '(none)',
          after: aFlat[key] ?? '(removed)',
        });
      }
    }
    return diffs;
  };

  // Parse terraform plan JSON and cross-reference with state + drift
  const analyzePlan = () => {
    setPlanParseError(null);
    let plan;
    try {
      plan = JSON.parse(planInput.trim());
    } catch (e) {
      setPlanParseError('Invalid JSON — paste the output of: terraform show -json tfplan');
      return;
    }

    const resourceChanges = plan.resource_changes || [];
    const resourceDrift = plan.resource_drift || [];

    // Only show managed resources with actual changes
    const actualChanges = resourceChanges.filter(rc =>
      rc.mode === 'managed' && rc.change?.actions && !rc.change.actions.every(a => a === 'no-op')
    );

    if (actualChanges.length === 0) {
      setPlanParseError('No changes in this plan — everything is already in sync. Nothing to analyze! 🎉');
      return;
    }

    // Build drift map from plan's own resource_drift section (AWS drift Terraform detected)
    const planDriftMap = {};
    resourceDrift.forEach(rd => { planDriftMap[rd.address] = rd; });

    const funny = {
      create_drifted: [
        "Terraform wants to create it, but AWS already has a surprise for you 👀 Run: terraform import {type}.{name} {id}",
        "Plot twist: AWS already built this behind your back. Run: terraform import {type}.{name} {id}",
      ],
      create_clean: [
        "Fresh resource incoming. Looks clean, go ahead and apply! 🚀",
        "Nothing in state, nothing in AWS — this is a clean create. Proceed!",
      ],
      delete_drifted: [
        "Terraform says delete it, but AWS already deleted it for you. Run: terraform refresh, then apply. 🪦",
        "AWS beat Terraform to the punch and YEET'd this already. Run: terraform refresh",
      ],
      delete_clean: [
        "Looks good to delete. Resource is in sync so this is a clean destroy. 💣",
        "State matches AWS. You can safely terraform apply this delete.",
      ],
      update_drifted: [
        "Triple threat! Plan wants to change it, AWS already changed it, and state is somewhere in between. Run: terraform refresh, then re-plan. 🤯",
        "Three-way disagreement: Plan says one thing, state says another, AWS said 'hold my beer'. Run: terraform refresh ☕",
      ],
      update_clean: [
        "Clean update — state matches AWS and your plan is a proper delta. Safe to apply! ✅",
        "No surprises. Plan change looks legit. Go for it.",
      ],
      replace_drifted: [
        "Terraform plans a destroy+recreate on a drifted resource. High risk! Run: terraform refresh first, then re-plan. 🎢",
        "Full replace on drifted infra. Verify manually before applying. This could hurt. ⚠️",
      ],
      replace_clean: [
        "Forced replace on a clean resource. No drift, should be fine — but double-check why it's being replaced.",
      ],
      no_op: [
        "Nothing to do here. Terraform and AWS agree. Rare sighting — screenshot this. 📸",
      ],
    };

    const pick = (key, rc) => {
      const options = funny[key] || ["Looks fine."];
      const msg = options[Math.floor(Math.random() * options.length)];
      return msg
        .replace('{type}', rc.type)
        .replace('{name}', rc.name)
        .replace('{id}', rc.change?.before?.id || '<resource-id>');
    };

    const results = actualChanges.map(rc => {
      const actions = rc.change?.actions || ['no-op'];
      const actionStr = actions.includes('create') && actions.includes('delete') ? 'replace' : actions[0];

      // Match against loaded state resources
      const stateResource = resources.find(r => r.type === rc.type && r.name === rc.name);
      const driftDetectorResult = stateResource ? getDriftStatus(stateResource.id) : null;
      let driftState = driftDetectorResult
        ? driftDetectorResult.driftStatus
        : (stateResource ? 'unchecked' : 'not_in_state');

      // Plan diffs: state → proposed (what your .tf change will do)
      const planDiffs = getObjectDiffs(rc.change?.before, rc.change?.after);

      // AWS drift: what Terraform itself detected AWS changed without it
      const planDriftEntry = planDriftMap[rc.address];
      const awsDriftDiffs = planDriftEntry
        ? getObjectDiffs(planDriftEntry.change?.before, planDriftEntry.change?.after)
        : [];

      // Override driftState if plan itself detected AWS drift
      if (awsDriftDiffs.length > 0 && driftState === 'unchecked') driftState = 'drifted';

      const hasDrift = driftState === 'drifted' || driftState === 'deleted' || awsDriftDiffs.length > 0;
      let suggestionKey = actionStr === 'no-op' ? 'no_op' : hasDrift ? `${actionStr}_drifted` : `${actionStr}_clean`;
      if (!funny[suggestionKey]) suggestionKey = 'no_op';

      return {
        address: rc.address,
        type: rc.type,
        name: rc.name,
        action: actionStr,
        driftState,
        planDiffs,
        awsDriftDiffs,
        driftDetectorDiffs: driftDetectorResult?.driftDetails?.differences || null,
        suggestion: pick(suggestionKey, rc),
      };
    });

    setPlanAnalysis(results);
    setShowPlanModal(false);
    setViewMode('plan');
  };

  const handleOpenPlanAnalyzer = () => {
    setShowPlanModal(true);
  };

  const handleSwitchToPlan = () => {
    if (planAnalysis) {
      setViewMode('plan');
    } else {
      setShowPlanModal(true);
    }
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
            <div className="view-toggle view-toggle-3">
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
              <button
                className={`toggle-option ${viewMode === 'plan' ? 'active' : ''}`}
                onClick={handleSwitchToPlan}
                disabled={driftLoading || credentialChecking}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3h10M3 6h7M3 9h9M3 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="13" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M12 11l.8.8 1.5-1.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Plan Analyzer</span>
              </button>
              <div className={`toggle-slider-3 toggle-slider-3--${viewMode}`}></div>
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
      {!(viewMode === 'drift' && driftLoading && !driftData) && viewMode !== 'plan' && (
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

      {/* Plan Paste Modal */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal-content plan-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <div className="aws-service-icon large" style={{ backgroundColor: '#8957e5' }}>📋</div>
                <div>
                  <h2>Paste Terraform Plan</h2>
                  <div className="modal-subtitle">Run: <code>terraform plan -out=tfplan && terraform show -json tfplan</code> and paste output below</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowPlanModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {planParseError && (
                <div className="plan-parse-error">
                  <span>⚠️ {planParseError}</span>
                </div>
              )}
              <textarea
                className="plan-textarea"
                placeholder='Paste your terraform show -json output here...'
                value={planInput}
                onChange={e => { setPlanInput(e.target.value); setPlanParseError(null); }}
                rows={14}
                spellCheck={false}
              />
              <div className="plan-modal-actions">
                <button className="btn" onClick={() => setShowPlanModal(false)}>Cancel</button>
                <button
                  className="btn btn-primary btn-plan-analyze"
                  onClick={analyzePlan}
                  disabled={!planInput.trim()}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2l6 4-6 4V2z" fill="currentColor"/>
                    <path d="M2 6h4M2 10h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Analyze Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Analysis View */}
      {viewMode === 'plan' && planAnalysis && (
        <div className="plan-analysis-container">
          <div className="plan-analysis-header">
            <div className="plan-analysis-title">
              <span className="plan-emoji">🔍</span>
              <div>
                <h2>Plan Analysis</h2>
                <p>{planAnalysis.length} resource change{planAnalysis.length !== 1 ? 's' : ''} — cross-referenced with state & drift</p>
              </div>
            </div>
            <button className="btn btn-plan-reload" onClick={() => setShowPlanModal(true)}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7a6 6 0 106-6H4M4 1L1 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              New Plan
            </button>
          </div>

          {!driftData && (
            <div className="plan-no-drift-notice">
              <span>💡 Tip: Run <strong>Drift Detection</strong> first for richer analysis — we'll cross-reference your plan against live AWS state too.</span>
            </div>
          )}

          <div className="plan-table-wrapper">
            <table className="plan-table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Action</th>
                  <th>Your Plan Changes<br/><span className="th-sub">state → proposed (.tf)</span></th>
                  <th>AWS Drift<br/><span className="th-sub">state → actual AWS</span></th>
                  <th>Drift Detector<br/><span className="th-sub">live AWS check</span></th>
                  <th>Suggestion</th>
                </tr>
              </thead>
              <tbody>
                {planAnalysis.map((row, idx) => (
                  <tr key={idx} className={`plan-row plan-row--${row.action} ${(row.driftState === 'drifted' || row.driftState === 'deleted') ? 'plan-row--has-drift' : ''}`}>
                    <td className="plan-cell-resource">
                      <div className="plan-resource-name">{row.name}</div>
                      <div className="plan-resource-type">{row.type}</div>
                      <div className="plan-resource-addr">{row.address}</div>
                    </td>
                    <td className="plan-cell-action">
                      <span className={`plan-action-badge plan-action--${row.action}`}>
                        {row.action === 'create' && '+ create'}
                        {row.action === 'delete' && '− destroy'}
                        {row.action === 'update' && '~ update'}
                        {row.action === 'replace' && '↺ replace'}
                        {row.action === 'no-op' && '= no-op'}
                      </span>
                    </td>

                    {/* Plan diffs: what your .tf change proposes */}
                    <td className="plan-cell-changes">
                      {row.planDiffs && row.planDiffs.length > 0 ? (
                        <div className="plan-diff-list">
                          {row.planDiffs.map((d, i) => (
                            <div key={i} className="plan-diff-item">
                              <code>{d.attribute}</code>
                              <div className="plan-diff-values">
                                <span className="plan-diff-before">{d.before}</span>
                                <span className="plan-diff-arrow">→</span>
                                <span className="plan-diff-after">{d.after}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <span className="plan-no-changes">no changes</span>}
                    </td>

                    {/* AWS drift: what Terraform itself detected changed in AWS */}
                    <td className="plan-cell-changes">
                      {row.awsDriftDiffs && row.awsDriftDiffs.length > 0 ? (
                        <div className="plan-diff-list">
                          {row.awsDriftDiffs.map((d, i) => (
                            <div key={i} className="plan-diff-item">
                              <code>{d.attribute}</code>
                              <div className="plan-diff-values">
                                <span className="plan-diff-before">{d.before}</span>
                                <span className="plan-diff-arrow">→</span>
                                <span className="plan-diff-after">{d.after}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : <span className="plan-no-changes">no drift</span>}
                    </td>

                    {/* Drift detector result from live AWS check */}
                    <td className="plan-cell-drift">
                      {row.driftState === 'in_sync' && <span className="plan-drift-badge drift-in-sync">✓ In Sync</span>}
                      {row.driftState === 'drifted' && (
                        <>
                          <span className="plan-drift-badge drift-drifted">⚠ Drifted</span>
                          {row.driftDetectorDiffs && row.driftDetectorDiffs.map((d, i) => (
                            <div key={i} className="plan-diff-item" style={{marginTop:'4px'}}>
                              <code>{d.attribute}</code>
                              <div className="plan-diff-values">
                                <span className="plan-diff-before">{d.expected}</span>
                                <span className="plan-diff-arrow">→</span>
                                <span className="plan-diff-after">{d.actual}</span>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {row.driftState === 'deleted' && <span className="plan-drift-badge drift-deleted">✕ Deleted in AWS</span>}
                      {row.driftState === 'unchecked' && <span className="plan-drift-badge drift-unchecked">− Run drift check</span>}
                      {row.driftState === 'not_in_state' && <span className="plan-drift-badge drift-unchecked">∅ Not in state</span>}
                      {row.driftState === 'unsupported' && <span className="plan-drift-badge drift-unchecked">− Unsupported</span>}
                    </td>

                    <td className="plan-cell-suggestion">
                      <div className="plan-suggestion-text">{row.suggestion}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
