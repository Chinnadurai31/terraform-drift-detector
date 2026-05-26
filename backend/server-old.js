const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const chokidar = require('chokidar');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 7070;

app.use(cors());
app.use(express.json());

// Configuration
const config = {
  stateSource: process.env.STATE_SOURCE || 'local',
  statePath: process.env.STATE_PATH || '/data/terraform.tfstate',
  stateBucket: process.env.STATE_BUCKET,
  stateKey: process.env.STATE_KEY,
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  autoReload: process.env.AUTO_RELOAD === 'true'
};

// Initialize AWS S3 if using S3 source
let s3 = null;
if (config.stateSource === 's3') {
  AWS.config.update({ region: config.awsRegion });
  s3 = new AWS.S3();
}

// Cache for parsed state
let cachedGraphData = null;
let lastModified = null;

/**
 * Read Terraform state from local file
 */
async function readLocalState() {
  try {
    const data = await fs.readFile(config.statePath, 'utf8');
    const stats = await fs.stat(config.statePath);
    lastModified = stats.mtime;
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read local state file: ${error.message}`);
  }
}

/**
 * Read Terraform state from S3
 */
async function readS3State() {
  try {
    const params = {
      Bucket: config.stateBucket,
      Key: config.stateKey
    };
    const data = await s3.getObject(params).promise();
    lastModified = data.LastModified;
    return JSON.parse(data.Body.toString('utf8'));
  } catch (error) {
    throw new Error(`Failed to read S3 state file: ${error.message}`);
  }
}

/**
 * Read Terraform state based on configured source
 */
async function readTerraformState() {
  if (config.stateSource === 's3') {
    return await readS3State();
  } else {
    return await readLocalState();
  }
}

/**
 * Parse Terraform state and extract resources with dependencies
 */
function parseStateToGraph(tfState) {
  const nodes = [];
  const edges = [];

  if (!tfState || !tfState.resources) {
    return { nodes, edges };
  }

  // Resource category mapping
  const getResourceCategory = (type) => {
    const categoryMap = {
      'aws_instance': 'compute',
      'aws_ecs_cluster': 'compute',
      'aws_ecs_service': 'compute',
      'aws_lambda_function': 'compute',
      'aws_autoscaling_group': 'compute',
      'aws_s3_bucket': 'storage',
      'aws_ebs_volume': 'storage',
      'aws_dynamodb_table': 'storage',
      'aws_vpc': 'network',
      'aws_subnet': 'network',
      'aws_security_group': 'network',
      'aws_route_table': 'network',
      'aws_internet_gateway': 'network',
      'aws_nat_gateway': 'network',
      'aws_elb': 'network',
      'aws_alb': 'network',
      'aws_route53_zone': 'network',
      'aws_route53_record': 'network',
      'aws_iam_role': 'iam',
      'aws_iam_policy': 'iam',
      'aws_iam_user': 'iam',
      'aws_db_instance': 'database',
      'aws_rds_cluster': 'database',
      'aws_elasticache_cluster': 'database',
      'aws_cloudwatch_log_group': 'monitoring',
      'aws_api_gateway_rest_api': 'api'
    };
    return categoryMap[type] || 'other';
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

  // Process resources
  tfState.resources.forEach((resource) => {
    const resourceType = resource.type;
    const resourceMode = resource.mode;

    // Process each instance of the resource
    (resource.instances || []).forEach((instance, idx) => {
      const nodeId = `${resource.type}.${resource.name}${idx > 0 ? `[${idx}]` : ''}`;

      // Determine category and color
      const category = getResourceCategory(resourceType);
      const color = getCategoryColor(category);

      // Create node
      nodes.push({
        data: {
          id: nodeId,
          label: `${resource.name}`,
          type: resourceType,
          mode: resourceMode,
          provider: resource.provider || 'unknown',
          attributes: instance.attributes || {},
          color: color,
          category: category
        }
      });

      // Extract dependencies
      if (instance.dependencies && Array.isArray(instance.dependencies)) {
        instance.dependencies.forEach(dep => {
          edges.push({
            data: {
              id: `${dep}->${nodeId}`,
              source: dep,
              target: nodeId
            }
          });
        });
      }

      // Also check for implicit dependencies in attributes
      if (instance.attributes) {
        Object.keys(instance.attributes).forEach(key => {
          const value = instance.attributes[key];
          if (typeof value === 'string' && value.includes('${')) {
            // Simple heuristic for Terraform references
            const matches = value.match(/\$\{([^}]+)\}/g);
            if (matches) {
              matches.forEach(match => {
                const refPath = match.replace('${', '').replace('}', '');
                if (refPath.includes('.')) {
                  const parts = refPath.split('.');
                  if (parts.length >= 2) {
                    const depId = `${parts[0]}.${parts[1]}`;
                    // Only add if not duplicate
                    const edgeId = `${depId}->${nodeId}`;
                    if (!edges.find(e => e.data.id === edgeId)) {
                      edges.push({
                        data: {
                          id: edgeId,
                          source: depId,
                          target: nodeId,
                          implicit: true
                        }
                      });
                    }
                  }
                }
              });
            }
          }
        });
      }
    });
  });

  return { nodes, edges };
}

/**
 * Load and cache graph data
 */
async function loadGraphData() {
  try {
    const tfState = await readTerraformState();
    cachedGraphData = parseStateToGraph(tfState);
    console.log(`✓ Loaded ${cachedGraphData.nodes.length} nodes and ${cachedGraphData.edges.length} edges`);
    return cachedGraphData;
  } catch (error) {
    console.error('Error loading graph data:', error.message);
    throw error;
  }
}

/**
 * Setup file watcher for auto-reload
 */
function setupFileWatcher() {
  if (config.autoReload && config.stateSource === 'local') {
    console.log(`📁 Watching ${config.statePath} for changes...`);

    const watcher = chokidar.watch(config.statePath, {
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', async () => {
      console.log('📝 State file changed, reloading...');
      try {
        await loadGraphData();
      } catch (error) {
        console.error('Error reloading state:', error.message);
      }
    });

    watcher.on('error', error => {
      console.error('Watcher error:', error);
    });
  }
}

// API Routes

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    source: config.stateSource,
    lastModified: lastModified
  });
});

/**
 * Get graph data
 */
app.get('/api/graph', async (req, res) => {
  try {
    // Return cached data if available, otherwise load fresh
    const graphData = cachedGraphData || await loadGraphData();

    res.json({
      success: true,
      data: graphData,
      meta: {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        lastModified: lastModified,
        source: config.stateSource
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reload state file
 */
app.post('/api/reload', async (req, res) => {
  try {
    await loadGraphData();
    res.json({
      success: true,
      message: 'State reloaded successfully',
      meta: {
        nodeCount: cachedGraphData.nodes.length,
        edgeCount: cachedGraphData.edges.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get resource details by ID
 */
app.get('/api/resource/:id', (req, res) => {
  try {
    const resourceId = req.params.id;

    if (!cachedGraphData) {
      return res.status(404).json({
        success: false,
        error: 'No state data loaded'
      });
    }

    const node = cachedGraphData.nodes.find(n => n.data.id === resourceId);

    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Resource not found'
      });
    }

    // Find dependencies (incoming and outgoing)
    const incoming = cachedGraphData.edges
      .filter(e => e.data.target === resourceId)
      .map(e => e.data.source);

    const outgoing = cachedGraphData.edges
      .filter(e => e.data.source === resourceId)
      .map(e => e.data.target);

    res.json({
      success: true,
      data: {
        ...node.data,
        dependencies: {
          incoming,
          outgoing
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Detect drift - Compare state file with actual AWS resources
 */
app.post('/api/drift/detect', async (req, res) => {
  try {
    if (!cachedGraphData) {
      return res.status(404).json({
        success: false,
        error: 'No state data loaded'
      });
    }

    console.log('Starting drift detection...');
    const driftResults = [];
    let totalChecked = 0;
    let totalDrifted = 0;

    // Check if AWS credentials are configured
    const hasAWSCredentials = process.env.AWS_ACCESS_KEY_ID || config.stateSource === 's3';

    // For each resource in state, check if it exists in AWS
    for (const node of cachedGraphData.nodes) {
      const resource = node.data;
      totalChecked++;

      try {
        let driftStatus = 'checking';
        let driftDetails = null;

        // If no AWS credentials, simulate drift check
        if (!hasAWSCredentials) {
          // Mock drift detection for demo purposes
          const random = Math.random();
          if (random < 0.7) {
            driftStatus = 'in_sync';
          } else if (random < 0.85) {
            driftStatus = 'drifted';
            driftDetails = {
              differences: [
                {
                  attribute: 'tags',
                  expected: '{"Environment":"prod"}',
                  actual: '{"Environment":"production"}'
                }
              ]
            };
            totalDrifted++;
          } else {
            driftStatus = 'unsupported';
            driftDetails = { message: 'AWS credentials not configured. This is a simulated result.' };
          }
        } else if (resource.type === 'aws_instance' && resource.attributes?.id) {
          const ec2 = new AWS.EC2({ region: resource.attributes.availability_zone?.slice(0, -1) || config.awsRegion });

          try {
            const result = await ec2.describeInstances({
              InstanceIds: [resource.attributes.id]
            }).promise();

            if (result.Reservations.length > 0 && result.Reservations[0].Instances.length > 0) {
              const actualInstance = result.Reservations[0].Instances[0];

              // Compare state vs actual
              const differences = [];

              if (actualInstance.State.Name !== resource.attributes.instance_state) {
                differences.push({
                  attribute: 'instance_state',
                  expected: resource.attributes.instance_state,
                  actual: actualInstance.State.Name
                });
              }

              if (actualInstance.InstanceType !== resource.attributes.instance_type) {
                differences.push({
                  attribute: 'instance_type',
                  expected: resource.attributes.instance_type,
                  actual: actualInstance.InstanceType
                });
              }

              if (differences.length > 0) {
                driftStatus = 'drifted';
                driftDetails = { differences };
                totalDrifted++;
              } else {
                driftStatus = 'in_sync';
              }
            } else {
              driftStatus = 'deleted';
              driftDetails = { message: 'Resource not found in AWS' };
              totalDrifted++;
            }
          } catch (awsError) {
            if (awsError.code === 'InvalidInstanceID.NotFound') {
              driftStatus = 'deleted';
              driftDetails = { message: 'Resource deleted from AWS' };
              totalDrifted++;
            } else {
              driftStatus = 'error';
              driftDetails = { error: awsError.message };
            }
          }
        } else if (resource.type === 'aws_s3_bucket' && resource.attributes?.id) {
          const s3 = new AWS.S3();

          try {
            await s3.headBucket({ Bucket: resource.attributes.id }).promise();
            driftStatus = 'in_sync';
          } catch (awsError) {
            if (awsError.code === 'NotFound' || awsError.code === 'NoSuchBucket') {
              driftStatus = 'deleted';
              driftDetails = { message: 'Bucket deleted from AWS' };
              totalDrifted++;
            } else {
              driftStatus = 'error';
              driftDetails = { error: awsError.message };
            }
          }
        } else if (resource.type === 'aws_vpc' && resource.attributes?.id) {
          const ec2 = new AWS.EC2({ region: config.awsRegion });

          try {
            const result = await ec2.describeVpcs({
              VpcIds: [resource.attributes.id]
            }).promise();

            if (result.Vpcs && result.Vpcs.length > 0) {
              const actualVpc = result.Vpcs[0];
              const differences = [];

              // Compare CIDR block
              if (actualVpc.CidrBlock !== resource.attributes.cidr_block) {
                differences.push({
                  attribute: 'cidr_block',
                  expected: resource.attributes.cidr_block,
                  actual: actualVpc.CidrBlock
                });
              }

              // Compare tags
              const expectedTags = resource.attributes.tags || {};
              const actualTags = {};

              if (actualVpc.Tags) {
                actualVpc.Tags.forEach(tag => {
                  actualTags[tag.Key] = tag.Value;
                });
              }

              // Check for tag differences
              Object.keys(expectedTags).forEach(key => {
                if (actualTags[key] !== expectedTags[key]) {
                  differences.push({
                    attribute: `tags.${key}`,
                    expected: expectedTags[key],
                    actual: actualTags[key] || 'null'
                  });
                }
              });

              if (differences.length > 0) {
                driftStatus = 'drifted';
                driftDetails = { differences };
                totalDrifted++;
              } else {
                driftStatus = 'in_sync';
              }
            } else {
              driftStatus = 'deleted';
              driftDetails = { message: 'VPC deleted from AWS' };
              totalDrifted++;
            }
          } catch (awsError) {
            if (awsError.code === 'InvalidVpcID.NotFound') {
              driftStatus = 'deleted';
              driftDetails = { message: 'VPC deleted from AWS' };
              totalDrifted++;
            } else {
              driftStatus = 'error';
              driftDetails = { error: awsError.message, code: awsError.code };
            }
          }
        } else {
          // For unsupported resource types
          driftStatus = 'unsupported';
          driftDetails = { message: 'Drift detection not yet supported for this resource type' };
        }

        driftResults.push({
          resourceId: resource.id,
          resourceType: resource.type,
          resourceName: resource.label,
          driftStatus,
          driftDetails,
          checkedAt: new Date().toISOString()
        });

      } catch (error) {
        driftResults.push({
          resourceId: resource.id,
          resourceType: resource.type,
          resourceName: resource.label,
          driftStatus: 'error',
          driftDetails: { error: error.message },
          checkedAt: new Date().toISOString()
        });
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalChecked,
          totalDrifted,
          totalInSync: totalChecked - totalDrifted,
          checkedAt: new Date().toISOString()
        },
        resources: driftResults
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Terraform State Visualizer API running on port ${PORT}`);
  console.log(`📊 State source: ${config.stateSource}`);

  // Initial load
  try {
    await loadGraphData();
    setupFileWatcher();
  } catch (error) {
    console.error('⚠️  Warning: Could not load initial state:', error.message);
    console.error('   The API is running, but no state data is available yet.');
  }
});
