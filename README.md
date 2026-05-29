<div align="center">

# 🔭 Terraform State Visualizer & Drift Detector

### *See your infrastructure. Catch what changed. Know what to do next.*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![AWS](https://img.shields.io/badge/AWS-SDK-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)](https://aws.amazon.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io)

<br/>

> A DevOps-first tool that turns your Terraform state file into a **live infrastructure dashboard** —
> with drift detection against real AWS resources and a plan analyzer that cross-references
> your proposed changes with what AWS actually looks like right now.

</div>

---

## 😤 The Problem

Every DevOps engineer has been here:

```
📄  You run terraform plan
❓  It shows changes you didn't make
😰  You stare at a 4000-line JSON state file trying to figure out what happened
🕙  It's 11pm. Deployment is in 30 minutes.
🤯  Someone changed something directly in AWS console and now nobody knows what's real
```

Terraform state files are **unreadable blobs**. `terraform plan` tells you *what will change*
but not *why it's different* or *who changed it in AWS directly*. You're flying blind.

---

## ✅ What This Tool Does

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   WITHOUT this tool                  WITH this tool                     │
│   ─────────────────                  ──────────────                     │
│                                                                         │
│   📄 Raw JSON state file             🖥️  Visual dashboard               │
│   😵 No idea what drifted            🎯  Exact attribute diffs          │
│   🤷 "Just run terraform plan"       ⚡ Live AWS API comparison         │
│   🔍 Manual state file reading       🔭 Three-way plan analysis         │
│   ⏳ 10 min to find one change       ⚡ Instant drift visibility         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**This tool gives you three superpowers:**

| 🗺️ Current Infra | 🚨 Drift Detection | 🔍 Plan Analyzer |
|---|---|---|
| Visual dashboard of everything in your state file | Queries AWS live and shows exactly what changed | Three-way diff: plan vs drift vs state |
| Filter by category, search by name/ID | Attribute-level diffs per resource | Actionable suggestion per resource |
| Works without AWS credentials | Requires AWS credentials | Works with or without prior drift check |

---

## 🏗️ Architecture

```
                        ╔═══════════════════════════════════════════════╗
                        ║           🌐  Your Browser (React)            ║
                        ║                                               ║
                        ║  ┌─────────────┐ ┌────────────┐ ┌─────────┐  ║
                        ║  │🗺️ Current   │ │🚨 Drift    │ │🔍 Plan  │  ║
                        ║  │   Infra     │ │  Detection │ │Analyzer │  ║
                        ║  │             │ │            │ │         │  ║
                        ║  │Visual view  │ │State vs    │ │Paste    │  ║
                        ║  │of statefile │ │live AWS    │ │plan JSON│  ║
                        ║  └─────────────┘ └────────────┘ └─────────┘  ║
                        ╚═══════════════════════╦═══════════════════════╝
                                                ║ REST API
                        ╔═══════════════════════╩═══════════════════════╗
                        ║        ⚙️  Backend  (Node.js :5050)           ║
                        ║                                               ║
                        ║  📂 Reads .tfstate  ──►  🔎 Parses resources  ║
                        ║  (local path or S3)       🌐 Calls AWS APIs   ║
                        ║                           🔁 Compares attrs   ║
                        ║                           📤 Returns diffs    ║
                        ╚══════════════╦════════════════╦═══════════════╝
                                       ║                ║
                     ╔═════════════════╩══╗    ╔════════╩════════════════╗
                     ║  🍃  MongoDB       ║    ║   ☁️   AWS APIs         ║
                     ║                    ║    ║                         ║
                     ║  Stores profiles   ║    ║  EC2  RDS  EKS  Lambda  ║
                     ║  (state source +   ║    ║  S3   IAM  ECS  Route53 ║
                     ║   AWS credentials) ║    ║  SQS  SNS  ElastiCache  ║
                     ╚════════════════════╝    ╚═════════════════════════╝
```

---

## 🚀 Features

### 🗺️ Current Infra View

Browse everything in your Terraform state file as a clean, dark-themed dashboard.
Filter by category, search by resource name or ID, expand any resource type to see all instances with full attributes.

```
╔══════════════════════════════════════════════════════════════════════╗
║  🟠 Compute  🟢 Storage  🔵 Network  🟣 IAM  🩷 Database  🟡 Monitoring ║
╚══════════════════════════════════════════════════════════════════════╝

  ▼  EC2  aws_instance                                    [ compute ]
     ├── web-server-1          i-0abc123def456789
     ├── web-server-2          i-0def456abc123789
     └── bastion               i-0789abc123def456

  ▶  RDS  aws_db_instance                                 [ database ]
  ▶  VPC  aws_vpc                                         [ network  ]
  ▶  IAM  aws_iam_role                                    [ iam      ]
```

---

### 🚨 Drift Detection

Queries AWS APIs **live** and compares real resource attributes against your state file.
Shows you exactly which attribute changed, what it was, and what it is now.

```
  aws_instance.web-server                         ⚠️  DRIFTED
  ┌─────────────────────────────────────────────────────────────┐
  │  attribute        state file (expected)  →  AWS (actual)    │
  │  ─────────────    ────────────────────      ─────────────── │
  │  instance_type    t3.micro               →  t3.large   🔴   │
  │  tags.Env         production             →  prod        🔴   │
  └─────────────────────────────────────────────────────────────┘

  aws_s3_bucket.assets                            ✅  IN SYNC
  aws_iam_role.lambda-exec                        ✅  IN SYNC
  aws_vpc.main                                    ✕  DELETED 🔴
```

**Drift statuses:**

| Badge | Meaning |
|---|---|
| ✅ `In Sync` | State matches AWS exactly — you're good |
| ⚠️ `Drifted` | Resource exists but attributes changed (e.g. instance type, tags resized) |
| ✕ `Deleted` | Resource is in your state but no longer exists in AWS |
| `−` `Unsupported` | Resource type not yet covered by drift checks |

**34 resource types recognized. Full drift checks on:**

| 🟠 Compute | 🟢 Storage | 🔵 Network |
|---|---|---|
| `aws_instance` | `aws_s3_bucket` | `aws_vpc` |
| `aws_ecs_cluster` | `aws_dynamodb_table` | `aws_subnet` |
| `aws_ecs_service` | `aws_ecr_repository` | `aws_security_group` |
| `aws_lambda_function` | | `aws_route_table` |
| `aws_eks_cluster` | | `aws_internet_gateway` |
| `aws_eks_node_group` | | `aws_nat_gateway` |
| | | `aws_eip`, `aws_lb`, `aws_alb`, `aws_elb` |
| | | `aws_route53_zone`, `aws_vpc_endpoint` |

| 🟣 IAM | 🩷 Database | 🟡 Monitoring / Other |
|---|---|---|
| `aws_iam_role` | `aws_db_instance` | `aws_cloudwatch_log_group` |
| `aws_iam_policy` | `aws_rds_cluster` | `aws_sqs_queue` |
| | `aws_elasticache_cluster` | `aws_sns_topic` |
| | `aws_elasticache_replication_group` | |
| | `aws_opensearch_domain` | |
| | `aws_elasticsearch_domain` | |

---

### 🔍 Plan Analyzer

The most powerful feature. Generate a Terraform plan, paste the JSON, and get a **three-column analysis** crossing plan intent × AWS drift × live state.

```bash
terraform plan -out=tfplan
terraform show -json tfplan > plan.json
# paste plan.json into the Plan Analyzer modal
```

```
╔══════════╦══════════╦══════════════════════╦══════════════════╦═════════════════════════════════════╗
║ Resource ║  Action  ║   Your Plan Changes  ║    AWS Drift     ║  Suggestion                         ║
║          ║          ║  (state → proposed)  ║  (state → AWS)   ║                                     ║
╠══════════╬══════════╬══════════════════════╬══════════════════╬═════════════════════════════════════╣
║ web-srv  ║ ~ update ║ tags.Name:           ║ tags.Env:        ║ ⚠️ Three-way disagreement! Run:      ║
║          ║          ║  "old" → "new-name"  ║  "prod" → "test" ║  terraform refresh, then re-plan ☕  ║
╠══════════╬══════════╬══════════════════════╬══════════════════╬═════════════════════════════════════╣
║ my-s3    ║ + create ║ (new resource)       ║ no drift         ║ 🚀 Clean create. Go for it!          ║
╠══════════╬══════════╬══════════════════════╬══════════════════╬═════════════════════════════════════╣
║ old-vpc  ║ − destroy║ (removing from tf)   ║ no drift         ║ 💣 State matches AWS. Safe to apply. ║
╚══════════╩══════════╩══════════════════════╩══════════════════╩═════════════════════════════════════╝
```

Each suggestion knows the combination of what you're doing + what AWS already did:

| Scenario | Suggestion |
|---|---|
| Update + no drift | ✅ Clean update — safe to apply |
| Update + AWS drifted | ☕ Three-way conflict — run `terraform refresh` first |
| Create + AWS drifted | 👀 AWS already has this — run `terraform import` |
| Delete + already gone | 🪦 AWS beat you to it — run `terraform refresh` |
| Replace + drifted | 🎢 High risk — verify manually before applying |

---

## 🔄 User Flow

```
  👤 Open the app
       │
       ▼
  🔐 Login
       │
       ▼
  ➕ Create a Profile
  │   ├── 📝 Name  (e.g. "prod-us-east", "staging-ap")
  │   ├── 📂 State source  →  local file path  OR  S3 bucket + key
  │   └── 🔑 AWS credentials  (Access Key + Secret + optional Session Token)
       │
       ▼
  🗺️  Current Infra Tab
  │   └── All resources from your .tfstate, grouped by type + category
  │       Search, filter, click any resource to see full attributes
       │
       ▼
  🚨 Drift Detection Tab
  │   ├── Validates your AWS credentials via STS
  │   ├── Queries each supported resource against live AWS APIs
  │   └── Highlights ⚠️ drifted / ✕ deleted / ✅ in-sync per resource
       │
       ▼
  🔍 Plan Analyzer Tab
      ├── Paste output of: terraform show -json tfplan
      ├── Parses resource_changes + resource_drift from plan
      └── Three-way comparison table + actionable suggestion per resource
```

---

## 🛠️ Getting Started

### 🐳 Option 1 — Docker Compose *(recommended)*

```bash
git clone <repo>
cd terraform-state-visualizer

# 🚀 start everything (mongo + backend + frontend)
docker compose up -d

# ✅ open http://localhost:3000
```

### 💻 Option 2 — Local Dev

```bash
# 1️⃣  start mongodb
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7

# 2️⃣  start backend
cd backend
cp .env.example .env   # edit MONGODB_URI if needed
npm install
npm start              # ⚙️  runs on :5050

# 3️⃣  start frontend  (new terminal)
cd frontend
npm install
npm start              # 🌐  runs on :3000
```

### ☸️ Option 3 — Kubernetes

```bash
kubectl apply -f kubernetes/deployment.yaml
```

Deploys to the `terraform-visualizer` namespace:

```
  🌐 frontend (2 replicas)  →  LoadBalancer
  ⚙️  backend  (1 replica)   →  ClusterIP
  🍃 mongodb   (external)    →  Secret reference
  🔀 ingress                 →  terraform-visualizer.local
```

---

## ⚙️ Configuration

### Backend `.env`

```env
MONGODB_URI=mongodb://admin:password@localhost:27017
PORT=5050
```

### 📋 Profile Fields

| Field | Required | Description |
|---|---|---|
| Profile Name | ✅ | Label for this environment (e.g. `prod`, `staging`) |
| State Source | ✅ | `local` (file path) or `s3` (bucket + key) |
| State Path | If local | Absolute path to your `.tfstate` file |
| S3 Bucket | If s3 | Bucket name where state is stored |
| S3 Key | If s3 | Object key / path to the state file |
| AWS Access Key ID | For drift | IAM access key |
| AWS Secret Access Key | For drift | IAM secret |
| AWS Session Token | Optional | For temporary / assumed-role credentials |
| AWS Region | For drift | Default region for API calls |

### 🔐 Minimum IAM Permissions

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
      "eks:DescribeCluster",
      "eks:DescribeNodegroup",
      "ecr:DescribeRepositories",
      "s3:HeadBucket",
      "sqs:GetQueueAttributes",
      "sns:GetTopicAttributes",
      "iam:GetRole",
      "iam:GetPolicy",
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

## 🧰 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| 🌐 Frontend | React 18, Axios | Dashboard UI |
| ⚙️ Backend | Node.js, Express | API + drift logic |
| 🍃 Database | MongoDB | Profile + credential storage |
| ☁️ AWS SDK | aws-sdk v2 | EC2, RDS, EKS, Lambda, S3, IAM... |
| 🐳 Container | Docker, Docker Compose | Local + prod deployment |
| ☸️ Orchestration | Kubernetes | Multi-replica production setup |

---

## 📁 Project Structure

```
terraform-state-visualizer/
│
├── 🐳 docker-compose.yml
├── 📄 .env.example
│
├── ⚙️  backend/
│   ├── server.js            ← API routes + all drift detection logic
│   ├── Dockerfile
│   └── package.json
│
├── 🌐 frontend/
│   ├── Dockerfile
│   └── src/
│       ├── App.js
│       ├── App.css
│       └── components/
│           ├── LoginPage.js
│           ├── ProfileList.js
│           ├── ProfileDetail.js    ← main view: infra / drift / plan analyzer
│           └── AddProfile.js
│
└── ☸️  kubernetes/
    └── deployment.yaml
```

---

<div align="center">

## 👨‍💻 Built By

**Chinnadurai** — DevOps Engineer

*Built to solve a real problem: making Terraform drift visible, understandable,*
*and actionable — without digging through JSON at 11pm before a deployment.*

<br/>

⭐ If this helped you catch drift before it caught you, give it a star!

</div>
