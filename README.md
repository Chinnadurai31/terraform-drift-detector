# Terraform State Visualizer & Drift Detector

> **See your infrastructure. Catch what changed. Know what to do next.**

A DevOps-first tool that turns your Terraform state file into a live infrastructure dashboard — with drift detection against real AWS resources and a plan analyzer that cross-references your proposed changes with what AWS actually looks like right now.

---

## The Problem This Solves

Every DevOps engineer has been here:

```
You run terraform plan.
It shows changes you didn't make.
You stare at a 4000-line JSON state file trying to figure out what happened.
It's 11pm. Deployment is in 30 minutes.
```

Terraform state files are unreadable blobs. `terraform plan` tells you *what will change* but not *why it's different* or *who changed it in AWS directly*. You're flying blind.

**This tool gives you:**
- A visual dashboard of everything in your state file — grouped, searchable, categorized
- Live drift detection — queries AWS directly and shows you exactly what changed
- A plan analyzer — paste your `terraform plan -json` output and get a three-way comparison of what your `.tf` proposes, what AWS actually has, and what your state file thinks

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Browser (React)                     │
│                                                             │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│   │ Current Infra │  │    Drift      │  │  Plan Analyzer  │  │
│   │              │  │  Detection    │  │                 │  │
│   │ Visual view  │  │              │  │  Paste plan JSON │  │
│   │ of statefile │  │ State vs AWS │  │  See 3-way diff  │  │
│   └──────────────┘  └──────────────┘  └─────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────┐
│                   Backend (Node.js :5050)                    │
│                                                             │
│   Reads Terraform state  ──►  Parses resources              │
│   (local file or S3)         Calls AWS APIs                  │
│                              Compares attributes             │
│                              Returns drift results           │
└──────────────────────────┬──────────────────────────────────┘
              ┌────────────┴────────────┐
              │                         │
┌─────────────▼──────┐     ┌───────────▼──────────┐
│   MongoDB           │     │       AWS APIs        │
│                     │     │                       │
│  Stores profiles    │     │  EC2, RDS, EKS,       │
│  (state source +    │     │  Lambda, S3, IAM,     │
│   AWS credentials)  │     │  ECS, Route53 ...     │
└─────────────────────┘     └───────────────────────┘
```

---

## Features

### Current Infra View
Browse everything in your Terraform state file as a clean dashboard. Filter by category, search by resource name or ID, expand any resource type to see all instances with their attributes.

```
Categories: Compute │ Storage │ Network │ IAM │ Database │ Monitoring │ API
```

### Drift Detection
Queries AWS APIs directly and compares live resource attributes against what your state file says they should be. Highlights exactly what's different.

**Supported resources with full attribute comparison:**

| Category | Resources |
|---|---|
| Compute | `aws_instance`, `aws_ecs_cluster`, `aws_ecs_service`, `aws_lambda_function`, `aws_eks_cluster`, `aws_eks_node_group` |
| Storage | `aws_s3_bucket`, `aws_dynamodb_table`, `aws_ecr_repository` |
| Network | `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_route_table`, `aws_internet_gateway`, `aws_nat_gateway`, `aws_eip`, `aws_network_acl`, `aws_vpc_endpoint`, `aws_lb`, `aws_alb`, `aws_elb`, `aws_route53_zone` |
| Database | `aws_db_instance`, `aws_rds_cluster`, `aws_elasticache_cluster`, `aws_elasticache_replication_group`, `aws_opensearch_domain`, `aws_elasticsearch_domain` |
| Monitoring | `aws_cloudwatch_log_group` |
| IAM | `aws_iam_role`, `aws_iam_policy` |
| Other | `aws_sqs_queue`, `aws_sns_topic` |

**Drift statuses:**

| Status | Meaning |
|---|---|
| ✓ In Sync | State matches AWS exactly |
| ⚠ Drifted | Resource exists but attributes changed (e.g. instance type, tags) |
| ✕ Deleted | Resource is in state but no longer exists in AWS |
| − Unsupported | Resource type not yet covered by drift checks |

### Plan Analyzer
The most powerful feature. Run a Terraform plan, paste the JSON output, and get a three-column analysis:

```
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
# paste plan.json contents into the analyzer
```

| Column | Source | Shows |
|---|---|---|
| Your Plan Changes | `resource_changes` in plan JSON | What your `.tf` edit will apply — e.g. tag renamed |
| AWS Drift | `resource_drift` in plan JSON | What AWS changed without Terraform knowing |
| Drift Detector | Live AWS API call | What our tool independently verified in AWS |

Each row also shows a **suggestion** — whether it's safe to apply, whether you need to `terraform refresh` first, or whether you're walking into a three-way conflict.

---

## User Flow

```
1. Login
        │
        ▼
2. Create a Profile
   ├── Name your profile (e.g. "prod-us-east", "staging")
   ├── Choose state source: Local file path or S3 bucket
   └── Add AWS credentials (Access Key + Secret + optional Session Token)
        │
        ▼
3. Open Profile → Current Infra
   └── See all resources from your state file, grouped by type
        │
        ▼
4. Click "Drift Detection"
   ├── Tool validates your AWS credentials
   ├── Queries each supported resource against live AWS
   └── Highlights drifted/deleted resources in red
        │
        ▼
5. Click "Plan Analyzer"
   ├── Paste output of: terraform show -json tfplan
   ├── Tool parses resource_changes + resource_drift
   └── Shows three-way comparison + actionable suggestion per resource
```

---

## Getting Started

### Option 1 — Docker Compose (recommended)

```bash
git clone <repo>
cd terraform-state-visualizer

# start everything
docker compose up -d

# visit http://localhost:3000
```

### Option 2 — Local Dev

```bash
# 1. start mongodb
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7

# 2. start backend
cd backend
cp .env.example .env   # edit MONGODB_URI if needed
npm install
npm start              # runs on :5050

# 3. start frontend (new terminal)
cd frontend
npm install
npm start              # runs on :3000
```

### Option 3 — Kubernetes

```bash
kubectl apply -f kubernetes/deployment.yaml
```

Deploys to the `terraform-visualizer` namespace with backend ClusterIP + frontend LoadBalancer + nginx Ingress at `terraform-visualizer.local`.

---

## Configuration

### Backend `.env`

```env
MONGODB_URI=mongodb://admin:password@localhost:27017
PORT=5050
```

### Profile Setup

| Field | Required | Description |
|---|---|---|
| Profile Name | Yes | Label for this environment (e.g. prod, staging) |
| State Source | Yes | `local` (file path) or `s3` (bucket + key) |
| State Path | If local | Absolute path to your `.tfstate` file |
| S3 Bucket | If s3 | Bucket name where state is stored |
| S3 Key | If s3 | Object key (path) to the state file |
| AWS Access Key ID | For drift | IAM access key |
| AWS Secret Access Key | For drift | IAM secret |
| AWS Session Token | Optional | For temporary/assumed-role credentials |
| AWS Region | For drift | Default region for API calls |

### Minimum IAM Permissions for Drift Detection

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:Describe*",
      "rds:Describe*",
      "elasticache:Describe*",
      "lambda:GetFunctionConfiguration",
      "dynamodb:DescribeTable",
      "ecs:Describe*",
      "eks:DescribeCluster", "eks:DescribeNodegroup",
      "ecr:DescribeRepositories",
      "s3:HeadBucket",
      "sqs:GetQueueAttributes",
      "sns:GetTopicAttributes",
      "iam:GetRole", "iam:GetPolicy",
      "logs:DescribeLogGroups",
      "elasticloadbalancing:DescribeLoadBalancers",
      "route53:GetHostedZone",
      "es:DescribeElasticsearchDomain",
      "opensearch:DescribeDomain",
      "sts:GetCallerIdentity"
    ],
    "Resource": "*"
  }]
}
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Axios |
| Backend | Node.js, Express |
| Database | MongoDB (profile + credential storage) |
| AWS SDK | aws-sdk v2 (EC2, RDS, EKS, Lambda, S3, IAM...) |
| Container | Docker, Docker Compose |
| Orchestration | Kubernetes |

---

## Project Structure

```
terraform-state-visualizer/
├── backend/
│   ├── server.js          # API + drift detection logic
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   └── components/
│   │       ├── LoginPage.js
│   │       ├── ProfileList.js
│   │       ├── ProfileDetail.js   # main view: infra / drift / plan analyzer
│   │       └── AddProfile.js
│   └── Dockerfile
├── kubernetes/
│   └── deployment.yaml
├── docker-compose.yml
└── .env.example
```

---

## Built By

Chinnadurai — DevOps Engineer  
Built to solve a real problem: making Terraform drift visible, understandable, and actionable without running a full `terraform plan` every time.
