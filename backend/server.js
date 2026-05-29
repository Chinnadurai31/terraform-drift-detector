require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const AWS = require('aws-sdk');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

// MongoDB connection
let db;
let profilesCollection;

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017';
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db('terraform-visualizer');
    profilesCollection = db.collection('profiles');
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    throw error;
  }
}

/**
 * Read Terraform state from local file
 */
async function readLocalState(statePath) {
  try {
    const data = await fs.readFile(statePath, 'utf8');
    const stats = await fs.stat(statePath);
    return {
      state: JSON.parse(data),
      lastModified: stats.mtime
    };
  } catch (error) {
    throw new Error(`Failed to read local state file: ${error.message}`);
  }
}

/**
 * Read Terraform state from S3
 */
async function readS3State(bucket, key, credentials) {
  try {
    const s3Config = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      region: credentials.region || 'us-east-1'
    };

    if (credentials.sessionToken) {
      s3Config.sessionToken = credentials.sessionToken;
    }

    const s3 = new AWS.S3(s3Config);

    const params = {
      Bucket: bucket,
      Key: key
    };

    const data = await s3.getObject(params).promise();
    return {
      state: JSON.parse(data.Body.toString('utf8')),
      lastModified: data.LastModified
    };
  } catch (error) {
    throw new Error(`Failed to read S3 state file: ${error.message}`);
  }
}

/**
 * Read Terraform state based on profile config
 */
async function readTerraformState(profile) {
  if (profile.stateSource === 's3') {
    return await readS3State(profile.stateBucket, profile.stateKey, profile.credentials);
  } else {
    return await readLocalState(profile.statePath);
  }
}

/**
 * Helper to convert string ID to ObjectId
 */
function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
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
      'aws_eks_cluster': 'compute',
      'aws_eks_node_group': 'compute',
      'aws_s3_bucket': 'storage',
      'aws_ebs_volume': 'storage',
      'aws_dynamodb_table': 'storage',
      'aws_ecr_repository': 'storage',
      'aws_vpc': 'network',
      'aws_subnet': 'network',
      'aws_security_group': 'network',
      'aws_route_table': 'network',
      'aws_internet_gateway': 'network',
      'aws_nat_gateway': 'network',
      'aws_eip': 'network',
      'aws_network_acl': 'network',
      'aws_route_table_association': 'network',
      'aws_vpc_endpoint': 'network',
      'aws_elb': 'network',
      'aws_alb': 'network',
      'aws_lb': 'network',
      'aws_route53_zone': 'network',
      'aws_route53_record': 'network',
      'aws_iam_role': 'iam',
      'aws_iam_policy': 'iam',
      'aws_iam_user': 'iam',
      'aws_db_instance': 'database',
      'aws_rds_cluster': 'database',
      'aws_elasticache_cluster': 'database',
      'aws_elasticache_replication_group': 'database',
      'aws_elasticsearch_domain': 'database',
      'aws_opensearch_domain': 'database',
      'aws_cloudwatch_log_group': 'monitoring',
      'aws_cloudwatch_metric_alarm': 'monitoring',
      'aws_api_gateway_rest_api': 'api',
      'aws_sqs_queue': 'other',
      'aws_sns_topic': 'other'
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
    });
  });

  return { nodes, edges };
}

/**
 * Extract region from resource ARN or attributes
 */
function getResourceRegion(resource, defaultRegion) {
  // Try to get region from ARN
  if (resource.attributes.arn) {
    const arnParts = resource.attributes.arn.split(':');
    if (arnParts.length >= 4 && arnParts[3]) {
      return arnParts[3];
    }
  }

  // Try availability_zone
  if (resource.attributes.availability_zone) {
    return resource.attributes.availability_zone.slice(0, -1);
  }

  return defaultRegion;
}

/**
 * Generic tag comparison helper
 */
function compareTags(expectedTags, actualTagsArray) {
  const differences = [];
  const actualTags = {};

  // Convert AWS tags array to object
  if (actualTagsArray && Array.isArray(actualTagsArray)) {
    actualTagsArray.forEach(tag => {
      actualTags[tag.Key] = tag.Value;
    });
  }

  const expected = expectedTags || {};

  // Check for differences in expected tags
  Object.keys(expected).forEach(key => {
    if (actualTags[key] !== expected[key]) {
      differences.push({
        attribute: `tags.${key}`,
        expected: expected[key],
        actual: actualTags[key] || 'null'
      });
    }
  });

  return differences;
}

/**
 * Drift detector registry - easily extensible for new resource types
 */
const driftDetectors = {
  'aws_vpc': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');

    const ec2Config = {
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
    if (credentials.sessionToken) {
      ec2Config.sessionToken = credentials.sessionToken;
    }

    const ec2 = new AWS.EC2(ec2Config);

    const result = await ec2.describeVpcs({
      VpcIds: [resource.attributes.id]
    }).promise();

    if (!result.Vpcs || result.Vpcs.length === 0) {
      return { status: 'deleted', message: 'VPC not found in AWS' };
    }

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
    const tagDiffs = compareTags(resource.attributes.tags, actualVpc.Tags);
    differences.push(...tagDiffs);

    return differences.length > 0
      ? { status: 'drifted', differences }
      : { status: 'in_sync' };
  },

  'aws_subnet': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');

    const ec2Config = {
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
    if (credentials.sessionToken) {
      ec2Config.sessionToken = credentials.sessionToken;
    }

    const ec2 = new AWS.EC2(ec2Config);

    const result = await ec2.describeSubnets({
      SubnetIds: [resource.attributes.id]
    }).promise();

    if (!result.Subnets || result.Subnets.length === 0) {
      return { status: 'deleted', message: 'Subnet not found in AWS' };
    }

    const actualSubnet = result.Subnets[0];
    const differences = [];

    // Compare CIDR
    if (actualSubnet.CidrBlock !== resource.attributes.cidr_block) {
      differences.push({
        attribute: 'cidr_block',
        expected: resource.attributes.cidr_block,
        actual: actualSubnet.CidrBlock
      });
    }

    // Compare tags
    const tagDiffs = compareTags(resource.attributes.tags, actualSubnet.Tags);
    differences.push(...tagDiffs);

    return differences.length > 0
      ? { status: 'drifted', differences }
      : { status: 'in_sync' };
  },

  'aws_security_group': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');

    const ec2Config = {
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
    if (credentials.sessionToken) {
      ec2Config.sessionToken = credentials.sessionToken;
    }

    const ec2 = new AWS.EC2(ec2Config);

    const result = await ec2.describeSecurityGroups({
      GroupIds: [resource.attributes.id]
    }).promise();

    if (!result.SecurityGroups || result.SecurityGroups.length === 0) {
      return { status: 'deleted', message: 'Security group not found in AWS' };
    }

    const actualSg = result.SecurityGroups[0];
    const differences = [];

    // Compare name
    if (actualSg.GroupName !== resource.attributes.name) {
      differences.push({
        attribute: 'name',
        expected: resource.attributes.name,
        actual: actualSg.GroupName
      });
    }

    // Compare tags
    const tagDiffs = compareTags(resource.attributes.tags, actualSg.Tags);
    differences.push(...tagDiffs);

    return differences.length > 0
      ? { status: 'drifted', differences }
      : { status: 'in_sync' };
  },

  'aws_instance': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');

    const ec2Config = {
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
    if (credentials.sessionToken) {
      ec2Config.sessionToken = credentials.sessionToken;
    }

    const ec2 = new AWS.EC2(ec2Config);

    const result = await ec2.describeInstances({
      InstanceIds: [resource.attributes.id]
    }).promise();

    if (!result.Reservations || result.Reservations.length === 0 ||
        !result.Reservations[0].Instances || result.Reservations[0].Instances.length === 0) {
      return { status: 'deleted', message: 'Instance not found in AWS' };
    }

    const actualInstance = result.Reservations[0].Instances[0];
    const differences = [];

    // Compare instance type
    if (actualInstance.InstanceType !== resource.attributes.instance_type) {
      differences.push({
        attribute: 'instance_type',
        expected: resource.attributes.instance_type,
        actual: actualInstance.InstanceType
      });
    }

    // Compare state
    if (actualInstance.State.Name !== resource.attributes.instance_state) {
      differences.push({
        attribute: 'instance_state',
        expected: resource.attributes.instance_state,
        actual: actualInstance.State.Name
      });
    }

    // Compare tags
    const tagDiffs = compareTags(resource.attributes.tags, actualInstance.Tags);
    differences.push(...tagDiffs);

    return differences.length > 0
      ? { status: 'drifted', differences }
      : { status: 'in_sync' };
  },

  'aws_s3_bucket': async (resource, credentials) => {
    const s3Config = {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    };
    if (credentials.sessionToken) {
      s3Config.sessionToken = credentials.sessionToken;
    }

    const s3 = new AWS.S3(s3Config);

    try {
      await s3.headBucket({ Bucket: resource.attributes.id }).promise();
      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'NotFound' || error.code === 'NoSuchBucket') {
        return { status: 'deleted', message: 'Bucket not found in AWS' };
      }
      throw error;
    }
  },

  'aws_db_instance': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const rds = new AWS.RDS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await rds.describeDBInstances({
        DBInstanceIdentifier: resource.attributes.id
      }).promise();

      if (!result.DBInstances || result.DBInstances.length === 0) {
        return { status: 'deleted', message: 'DB instance not found in AWS' };
      }

      const actual = result.DBInstances[0];
      const differences = [];

      if (actual.DBInstanceClass !== resource.attributes.instance_class) {
        differences.push({ attribute: 'instance_class', expected: resource.attributes.instance_class, actual: actual.DBInstanceClass });
      }
      if (actual.Engine !== resource.attributes.engine) {
        differences.push({ attribute: 'engine', expected: resource.attributes.engine, actual: actual.Engine });
      }
      if (actual.EngineVersion !== resource.attributes.engine_version) {
        differences.push({ attribute: 'engine_version', expected: resource.attributes.engine_version, actual: actual.EngineVersion });
      }
      if (String(actual.MultiAZ) !== String(resource.attributes.multi_az)) {
        differences.push({ attribute: 'multi_az', expected: String(resource.attributes.multi_az), actual: String(actual.MultiAZ) });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'DBInstanceNotFound') {
        return { status: 'deleted', message: 'DB instance not found in AWS' };
      }
      throw error;
    }
  },

  'aws_rds_cluster': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const rds = new AWS.RDS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await rds.describeDBClusters({
        DBClusterIdentifier: resource.attributes.id
      }).promise();

      if (!result.DBClusters || result.DBClusters.length === 0) {
        return { status: 'deleted', message: 'RDS cluster not found in AWS' };
      }

      const actual = result.DBClusters[0];
      const differences = [];

      if (actual.Engine !== resource.attributes.engine) {
        differences.push({ attribute: 'engine', expected: resource.attributes.engine, actual: actual.Engine });
      }
      if (actual.EngineVersion !== resource.attributes.engine_version) {
        differences.push({ attribute: 'engine_version', expected: resource.attributes.engine_version, actual: actual.EngineVersion });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'DBClusterNotFoundFault') {
        return { status: 'deleted', message: 'RDS cluster not found in AWS' };
      }
      throw error;
    }
  },

  'aws_elasticache_cluster': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const elasticache = new AWS.ElastiCache({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await elasticache.describeCacheClusters({
        CacheClusterId: resource.attributes.id
      }).promise();

      if (!result.CacheClusters || result.CacheClusters.length === 0) {
        return { status: 'deleted', message: 'ElastiCache cluster not found in AWS' };
      }

      const actual = result.CacheClusters[0];
      const differences = [];

      if (actual.CacheNodeType !== resource.attributes.node_type) {
        differences.push({ attribute: 'node_type', expected: resource.attributes.node_type, actual: actual.CacheNodeType });
      }
      if (actual.Engine !== resource.attributes.engine) {
        differences.push({ attribute: 'engine', expected: resource.attributes.engine, actual: actual.Engine });
      }
      if (String(actual.NumCacheNodes) !== String(resource.attributes.num_cache_nodes)) {
        differences.push({ attribute: 'num_cache_nodes', expected: String(resource.attributes.num_cache_nodes), actual: String(actual.NumCacheNodes) });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'CacheClusterNotFound') {
        return { status: 'deleted', message: 'ElastiCache cluster not found in AWS' };
      }
      throw error;
    }
  },

  'aws_elasticache_replication_group': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const elasticache = new AWS.ElastiCache({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await elasticache.describeReplicationGroups({
        ReplicationGroupId: resource.attributes.id
      }).promise();

      if (!result.ReplicationGroups || result.ReplicationGroups.length === 0) {
        return { status: 'deleted', message: 'ElastiCache replication group not found in AWS' };
      }

      const actual = result.ReplicationGroups[0];
      const differences = [];

      if (String(actual.AutomaticFailover) === 'enabled' !== (resource.attributes.automatic_failover_enabled === true || resource.attributes.automatic_failover_enabled === 'true')) {
        differences.push({ attribute: 'automatic_failover_enabled', expected: String(resource.attributes.automatic_failover_enabled), actual: actual.AutomaticFailover });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ReplicationGroupNotFoundFault') {
        return { status: 'deleted', message: 'ElastiCache replication group not found in AWS' };
      }
      throw error;
    }
  },

  'aws_sqs_queue': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const sqs = new AWS.SQS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const url = resource.attributes.url || resource.attributes.id;
      await sqs.getQueueAttributes({ QueueUrl: url, AttributeNames: ['All'] }).promise();
      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'AWS.SimpleQueueService.NonExistentQueue') {
        return { status: 'deleted', message: 'SQS queue not found in AWS' };
      }
      throw error;
    }
  },

  'aws_sns_topic': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const sns = new AWS.SNS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      await sns.getTopicAttributes({ TopicArn: resource.attributes.arn || resource.attributes.id }).promise();
      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'NotFound' || error.code === 'InvalidParameter') {
        return { status: 'deleted', message: 'SNS topic not found in AWS' };
      }
      throw error;
    }
  },

  'aws_ecr_repository': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ecr = new AWS.ECR({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await ecr.describeRepositories({
        repositoryNames: [resource.attributes.name || resource.attributes.id]
      }).promise();

      if (!result.repositories || result.repositories.length === 0) {
        return { status: 'deleted', message: 'ECR repository not found in AWS' };
      }

      const actual = result.repositories[0];
      const differences = [];

      if (actual.imageTagMutability !== (resource.attributes.image_tag_mutability || 'MUTABLE')) {
        differences.push({ attribute: 'image_tag_mutability', expected: resource.attributes.image_tag_mutability || 'MUTABLE', actual: actual.imageTagMutability });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'RepositoryNotFoundException') {
        return { status: 'deleted', message: 'ECR repository not found in AWS' };
      }
      throw error;
    }
  },

  'aws_eks_cluster': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const eks = new AWS.EKS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await eks.describeCluster({
        name: resource.attributes.name || resource.attributes.id
      }).promise();

      if (!result.cluster) {
        return { status: 'deleted', message: 'EKS cluster not found in AWS' };
      }

      const actual = result.cluster;
      const differences = [];

      if (actual.version !== resource.attributes.version) {
        differences.push({ attribute: 'version', expected: resource.attributes.version, actual: actual.version });
      }
      if (actual.status !== 'ACTIVE') {
        differences.push({ attribute: 'status', expected: 'ACTIVE', actual: actual.status });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'EKS cluster not found in AWS' };
      }
      throw error;
    }
  },

  'aws_eks_node_group': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const eks = new AWS.EKS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await eks.describeNodegroup({
        clusterName: resource.attributes.cluster_name,
        nodegroupName: resource.attributes.node_group_name || resource.attributes.id
      }).promise();

      if (!result.nodegroup) {
        return { status: 'deleted', message: 'EKS node group not found in AWS' };
      }

      const actual = result.nodegroup;
      const differences = [];

      if (actual.scalingConfig && resource.attributes.scaling_config) {
        const expectedMin = Number(resource.attributes.scaling_config[0]?.min_size);
        const expectedMax = Number(resource.attributes.scaling_config[0]?.max_size);
        if (actual.scalingConfig.minSize !== expectedMin) {
          differences.push({ attribute: 'scaling_config.min_size', expected: String(expectedMin), actual: String(actual.scalingConfig.minSize) });
        }
        if (actual.scalingConfig.maxSize !== expectedMax) {
          differences.push({ attribute: 'scaling_config.max_size', expected: String(expectedMax), actual: String(actual.scalingConfig.maxSize) });
        }
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'EKS node group not found in AWS' };
      }
      throw error;
    }
  },

  'aws_lambda_function': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const lambda = new AWS.Lambda({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await lambda.getFunctionConfiguration({
        FunctionName: resource.attributes.function_name || resource.attributes.id
      }).promise();

      const differences = [];

      if (result.Runtime !== resource.attributes.runtime) {
        differences.push({ attribute: 'runtime', expected: resource.attributes.runtime, actual: result.Runtime });
      }
      if (String(result.MemorySize) !== String(resource.attributes.memory_size)) {
        differences.push({ attribute: 'memory_size', expected: String(resource.attributes.memory_size), actual: String(result.MemorySize) });
      }
      if (String(result.Timeout) !== String(resource.attributes.timeout)) {
        differences.push({ attribute: 'timeout', expected: String(resource.attributes.timeout), actual: String(result.Timeout) });
      }
      if (result.Handler !== resource.attributes.handler) {
        differences.push({ attribute: 'handler', expected: resource.attributes.handler, actual: result.Handler });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'Lambda function not found in AWS' };
      }
      throw error;
    }
  },

  'aws_dynamodb_table': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const dynamodb = new AWS.DynamoDB({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await dynamodb.describeTable({
        TableName: resource.attributes.name || resource.attributes.id
      }).promise();

      if (!result.Table) {
        return { status: 'deleted', message: 'DynamoDB table not found in AWS' };
      }

      const actual = result.Table;
      const differences = [];

      if (actual.BillingModeSummary) {
        const actualMode = actual.BillingModeSummary.BillingMode;
        const expectedMode = resource.attributes.billing_mode || 'PROVISIONED';
        if (actualMode !== expectedMode) {
          differences.push({ attribute: 'billing_mode', expected: expectedMode, actual: actualMode });
        }
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'DynamoDB table not found in AWS' };
      }
      throw error;
    }
  },

  'aws_ecs_cluster': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ecs = new AWS.ECS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    const result = await ecs.describeClusters({
      clusters: [resource.attributes.arn || resource.attributes.id]
    }).promise();

    const cluster = result.clusters && result.clusters[0];
    if (!cluster || cluster.status === 'INACTIVE') {
      return { status: 'deleted', message: 'ECS cluster not found or inactive' };
    }

    return { status: 'in_sync' };
  },

  'aws_ecs_service': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ecs = new AWS.ECS({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await ecs.describeServices({
        cluster: resource.attributes.cluster,
        services: [resource.attributes.name || resource.attributes.id]
      }).promise();

      const service = result.services && result.services[0];
      if (!service || service.status === 'INACTIVE') {
        return { status: 'deleted', message: 'ECS service not found or inactive' };
      }

      const differences = [];

      if (String(service.desiredCount) !== String(resource.attributes.desired_count)) {
        differences.push({ attribute: 'desired_count', expected: String(resource.attributes.desired_count), actual: String(service.desiredCount) });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ServiceNotFoundException') {
        return { status: 'deleted', message: 'ECS service not found' };
      }
      throw error;
    }
  },

  'aws_cloudwatch_log_group': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const cwl = new AWS.CloudWatchLogs({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    const result = await cwl.describeLogGroups({
      logGroupNamePrefix: resource.attributes.name || resource.attributes.id
    }).promise();

    const group = result.logGroups && result.logGroups.find(g => g.logGroupName === (resource.attributes.name || resource.attributes.id));
    if (!group) {
      return { status: 'deleted', message: 'CloudWatch log group not found in AWS' };
    }

    const differences = [];
    const expectedRetention = resource.attributes.retention_in_days;
    if (expectedRetention && String(group.retentionInDays) !== String(expectedRetention)) {
      differences.push({ attribute: 'retention_in_days', expected: String(expectedRetention), actual: String(group.retentionInDays || 'never expires') });
    }

    return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
  },

  'aws_lb': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const elbv2 = new AWS.ELBv2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await elbv2.describeLoadBalancers({
        LoadBalancerArns: [resource.attributes.arn || resource.attributes.id]
      }).promise();

      if (!result.LoadBalancers || result.LoadBalancers.length === 0) {
        return { status: 'deleted', message: 'Load balancer not found in AWS' };
      }

      const actual = result.LoadBalancers[0];
      const differences = [];

      const expectedScheme = resource.attributes.internal ? 'internal' : 'internet-facing';
      if (actual.Scheme !== expectedScheme) {
        differences.push({ attribute: 'scheme', expected: expectedScheme, actual: actual.Scheme });
      }
      if (actual.State.Code !== 'active') {
        differences.push({ attribute: 'state', expected: 'active', actual: actual.State.Code });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'LoadBalancerNotFound') {
        return { status: 'deleted', message: 'Load balancer not found in AWS' };
      }
      throw error;
    }
  },

  'aws_alb': async (resource, credentials) => {
    return driftDetectors['aws_lb'](resource, credentials);
  },

  'aws_elb': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const elb = new AWS.ELB({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await elb.describeLoadBalancers({
        LoadBalancerNames: [resource.attributes.name || resource.attributes.id]
      }).promise();

      if (!result.LoadBalancerDescriptions || result.LoadBalancerDescriptions.length === 0) {
        return { status: 'deleted', message: 'Classic ELB not found in AWS' };
      }

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'LoadBalancerNotFound') {
        return { status: 'deleted', message: 'Classic ELB not found in AWS' };
      }
      throw error;
    }
  },

  'aws_route53_zone': async (resource, credentials) => {
    const route53 = new AWS.Route53({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const zoneId = (resource.attributes.zone_id || resource.attributes.id || '').replace('/hostedzone/', '');
      const result = await route53.getHostedZone({ Id: zoneId }).promise();

      if (!result.HostedZone) {
        return { status: 'deleted', message: 'Route53 zone not found in AWS' };
      }

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'NoSuchHostedZone') {
        return { status: 'deleted', message: 'Route53 zone not found in AWS' };
      }
      throw error;
    }
  },

  'aws_internet_gateway': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    const result = await ec2.describeInternetGateways({
      InternetGatewayIds: [resource.attributes.id]
    }).promise();

    if (!result.InternetGateways || result.InternetGateways.length === 0) {
      return { status: 'deleted', message: 'Internet gateway not found in AWS' };
    }

    const differences = [];
    const tagDiffs = compareTags(resource.attributes.tags, result.InternetGateways[0].Tags);
    differences.push(...tagDiffs);

    return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
  },

  'aws_nat_gateway': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    const result = await ec2.describeNatGateways({
      NatGatewayIds: [resource.attributes.id]
    }).promise();

    const gw = result.NatGateways && result.NatGateways[0];
    if (!gw || gw.State === 'deleted') {
      return { status: 'deleted', message: 'NAT gateway not found or deleted' };
    }
    if (gw.State !== 'available') {
      return { status: 'drifted', differences: [{ attribute: 'state', expected: 'available', actual: gw.State }] };
    }

    return { status: 'in_sync' };
  },

  'aws_eip': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await ec2.describeAddresses({
        AllocationIds: [resource.attributes.allocation_id || resource.attributes.id]
      }).promise();

      if (!result.Addresses || result.Addresses.length === 0) {
        return { status: 'deleted', message: 'Elastic IP not found in AWS' };
      }

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'InvalidAllocationID.NotFound') {
        return { status: 'deleted', message: 'Elastic IP not found in AWS' };
      }
      throw error;
    }
  },

  'aws_network_acl': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await ec2.describeNetworkAcls({
        NetworkAclIds: [resource.attributes.id]
      }).promise();

      if (!result.NetworkAcls || result.NetworkAcls.length === 0) {
        return { status: 'deleted', message: 'Network ACL not found in AWS' };
      }

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'InvalidNetworkAclID.NotFound') {
        return { status: 'deleted', message: 'Network ACL not found in AWS' };
      }
      throw error;
    }
  },

  'aws_vpc_endpoint': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    const result = await ec2.describeVpcEndpoints({
      VpcEndpointIds: [resource.attributes.id]
    }).promise();

    const endpoint = result.VpcEndpoints && result.VpcEndpoints[0];
    if (!endpoint || endpoint.State === 'deleted') {
      return { status: 'deleted', message: 'VPC endpoint not found or deleted' };
    }

    return { status: 'in_sync' };
  },

  'aws_route_table': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const ec2 = new AWS.EC2({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await ec2.describeRouteTables({
        RouteTableIds: [resource.attributes.id]
      }).promise();

      if (!result.RouteTables || result.RouteTables.length === 0) {
        return { status: 'deleted', message: 'Route table not found in AWS' };
      }

      const differences = [];
      const tagDiffs = compareTags(resource.attributes.tags, result.RouteTables[0].Tags);
      differences.push(...tagDiffs);

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'InvalidRouteTableID.NotFound') {
        return { status: 'deleted', message: 'Route table not found in AWS' };
      }
      throw error;
    }
  },

  'aws_iam_role': async (resource, credentials) => {
    const iam = new AWS.IAM({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await iam.getRole({
        RoleName: resource.attributes.name || resource.attributes.id
      }).promise();

      if (!result.Role) {
        return { status: 'deleted', message: 'IAM role not found in AWS' };
      }

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'NoSuchEntity') {
        return { status: 'deleted', message: 'IAM role not found in AWS' };
      }
      throw error;
    }
  },

  'aws_iam_policy': async (resource, credentials) => {
    const iam = new AWS.IAM({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      await iam.getPolicy({
        PolicyArn: resource.attributes.arn || resource.attributes.id
      }).promise();

      return { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'NoSuchEntity') {
        return { status: 'deleted', message: 'IAM policy not found in AWS' };
      }
      throw error;
    }
  },

  'aws_opensearch_domain': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const opensearch = new AWS.OpenSearch({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await opensearch.describeDomain({
        DomainName: resource.attributes.domain_name || resource.attributes.id
      }).promise();

      if (!result.DomainStatus) {
        return { status: 'deleted', message: 'OpenSearch domain not found in AWS' };
      }

      const actual = result.DomainStatus;
      const differences = [];

      if (actual.EngineVersion !== resource.attributes.engine_version) {
        differences.push({ attribute: 'engine_version', expected: resource.attributes.engine_version, actual: actual.EngineVersion });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'OpenSearch domain not found in AWS' };
      }
      throw error;
    }
  },

  'aws_elasticsearch_domain': async (resource, credentials) => {
    const region = getResourceRegion(resource, credentials.region || 'us-east-1');
    const es = new AWS.ES({
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
    });

    try {
      const result = await es.describeElasticsearchDomain({
        DomainName: resource.attributes.domain_name || resource.attributes.id
      }).promise();

      if (!result.DomainStatus) {
        return { status: 'deleted', message: 'Elasticsearch domain not found in AWS' };
      }

      const actual = result.DomainStatus;
      const differences = [];

      if (actual.ElasticsearchVersion !== resource.attributes.elasticsearch_version) {
        differences.push({ attribute: 'elasticsearch_version', expected: resource.attributes.elasticsearch_version, actual: actual.ElasticsearchVersion });
      }

      return differences.length > 0 ? { status: 'drifted', differences } : { status: 'in_sync' };
    } catch (error) {
      if (error.code === 'ResourceNotFoundException') {
        return { status: 'deleted', message: 'Elasticsearch domain not found in AWS' };
      }
      throw error;
    }
  }
};

// ========== PROFILE API ENDPOINTS ==========

/**
 * Get all profiles
 */
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await profilesCollection.find().toArray();

    // Don't send credentials to frontend
    const sanitizedProfiles = profiles.map(p => ({
      id: p._id.toString(),
      name: p.name,
      stateSource: p.stateSource,
      statePath: p.statePath,
      stateBucket: p.stateBucket,
      stateKey: p.stateKey,
      hasCredentials: !!(p.credentials && p.credentials.accessKeyId)
    }));

    res.json({
      success: true,
      data: sanitizedProfiles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get single profile (without credentials)
 */
app.get('/api/profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const profile = await profilesCollection.findOne({ _id: objectId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    // Don't send credentials
    res.json({
      success: true,
      data: {
        id: profile._id.toString(),
        name: profile.name,
        stateSource: profile.stateSource,
        statePath: profile.statePath,
        stateBucket: profile.stateBucket,
        stateKey: profile.stateKey,
        hasCredentials: !!(profile.credentials && profile.credentials.accessKeyId)
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
 * Create new profile
 */
app.post('/api/profiles', async (req, res) => {
  try {
    const { name, stateSource, statePath, stateBucket, stateKey, credentials } = req.body;

    if (!name || !stateSource) {
      return res.status(400).json({
        success: false,
        error: 'Profile name and state source are required'
      });
    }

    if (stateSource === 'local' && !statePath) {
      return res.status(400).json({
        success: false,
        error: 'State path is required for local source'
      });
    }

    if (stateSource === 's3' && (!stateBucket || !stateKey)) {
      return res.status(400).json({
        success: false,
        error: 'S3 bucket and key are required for S3 source'
      });
    }

    const profile = {
      name,
      stateSource,
      statePath: statePath || null,
      stateBucket: stateBucket || null,
      stateKey: stateKey || null,
      credentials: credentials || null,
      createdAt: new Date()
    };

    const result = await profilesCollection.insertOne(profile);

    res.json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        name: profile.name
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
 * Update profile
 */
app.put('/api/profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stateSource, statePath, stateBucket, stateKey, credentials } = req.body;

    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const updateFields = {
      updatedAt: new Date()
    };

    if (name !== undefined) updateFields.name = name;
    if (stateSource !== undefined) updateFields.stateSource = stateSource;
    if (statePath !== undefined) updateFields.statePath = statePath;
    if (stateBucket !== undefined) updateFields.stateBucket = stateBucket;
    if (stateKey !== undefined) updateFields.stateKey = stateKey;
    if (credentials !== undefined) updateFields.credentials = credentials;

    const result = await profilesCollection.updateOne(
      { _id: objectId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    const updatedProfile = await profilesCollection.findOne({ _id: objectId });

    res.json({
      success: true,
      data: {
        id: updatedProfile._id.toString(),
        name: updatedProfile.name
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
 * Delete profile
 */
app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const result = await profilesCollection.deleteOne({ _id: objectId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========== PROFILE-BASED INFRASTRUCTURE API ==========

/**
 * Get graph data for a profile
 */
app.get('/api/profiles/:id/graph', async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const profile = await profilesCollection.findOne({ _id: objectId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    const { state, lastModified } = await readTerraformState(profile);
    const graphData = parseStateToGraph(state);

    res.json({
      success: true,
      data: graphData,
      meta: {
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        lastModified: lastModified,
        source: profile.stateSource,
        profileName: profile.name
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
 * Detect drift for a profile
 */
app.post('/api/profiles/:id/drift/detect', async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const profile = await profilesCollection.findOne({ _id: objectId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    console.log(`Starting drift detection for profile: ${profile.name}`);

    const { state } = await readTerraformState(profile);
    const graphData = parseStateToGraph(state);

    const driftResults = [];
    let totalChecked = 0;
    let totalDrifted = 0;

    const hasCredentials = profile.credentials && profile.credentials.accessKeyId;

    for (const node of graphData.nodes) {
      const resource = node.data;
      totalChecked++;

      try {
        let driftStatus = 'checking';
        let driftDetails = null;

        if (!hasCredentials) {
          driftStatus = 'unsupported';
          driftDetails = { message: 'AWS credentials not configured for this profile' };
        } else if (!resource.attributes?.id) {
          driftStatus = 'unsupported';
          driftDetails = { message: 'No resource ID found in state' };
        } else if (driftDetectors[resource.type]) {
          try {
            const result = await driftDetectors[resource.type](resource, profile.credentials);
            driftStatus = result.status;

            if (result.differences) {
              driftDetails = { differences: result.differences };
              totalDrifted++;
            } else if (result.message) {
              driftDetails = { message: result.message };
              if (result.status === 'deleted' || result.status === 'drifted') {
                totalDrifted++;
              }
            }
          } catch (awsError) {
            const notFoundCodes = [
              'InvalidVpcID.NotFound',
              'InvalidSubnetID.NotFound',
              'InvalidGroup.NotFound',
              'InvalidInstanceID.NotFound'
            ];

            if (notFoundCodes.includes(awsError.code)) {
              driftStatus = 'deleted';
              driftDetails = { message: 'Resource not found in AWS' };
              totalDrifted++;
            } else {
              driftStatus = 'error';
              driftDetails = {
                error: awsError.message,
                code: awsError.code
              };
            }
          }
        } else {
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

/**
 * Validate AWS credentials
 */
app.post('/api/profiles/:id/credentials/validate', async (req, res) => {
  try {
    const { id } = req.params;
    const objectId = toObjectId(id);

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid profile ID'
      });
    }

    const profile = await profilesCollection.findOne({ _id: objectId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    if (!profile.credentials || !profile.credentials.accessKeyId) {
      return res.json({
        success: true,
        valid: false,
        reason: 'No credentials configured for this profile'
      });
    }

    // Test credentials by calling STS GetCallerIdentity (lightweight check)
    try {
      const stsConfig = {
        accessKeyId: profile.credentials.accessKeyId,
        secretAccessKey: profile.credentials.secretAccessKey,
        region: profile.credentials.region || 'us-east-1'
      };

      if (profile.credentials.sessionToken) {
        stsConfig.sessionToken = profile.credentials.sessionToken;
      }

      const sts = new AWS.STS(stsConfig);
      const identity = await sts.getCallerIdentity().promise();

      return res.json({
        success: true,
        valid: true,
        identity: {
          account: identity.Account,
          arn: identity.Arn,
          userId: identity.UserId
        }
      });
    } catch (error) {
      // Check if credentials are expired or invalid
      const isExpired = error.code === 'ExpiredToken' || error.code === 'ExpiredTokenException';
      const isInvalid = error.code === 'InvalidClientTokenId' ||
                        error.code === 'SignatureDoesNotMatch' ||
                        error.code === 'InvalidAccessKeyId';

      return res.json({
        success: true,
        valid: false,
        expired: isExpired,
        invalid: isInvalid,
        reason: error.message,
        code: error.code
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check
 */
app.get('/api/health', async (req, res) => {
  try {
    const profileCount = await profilesCollection.countDocuments();
    res.json({
      status: 'ok',
      database: 'connected',
      profiles: profileCount
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Terraform State Visualizer API running on port ${PORT}`);
  await connectDB();
  console.log(`✓ Server ready`);
});
