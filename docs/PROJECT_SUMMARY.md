# CloudOps Enterprise

![CloudOps Banner](https://img.shields.io/badge/Status-Production%20Ready-success?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Node.js%20%7C%20Azure%20%7C%20AWS-blue?style=for-the-badge)

CloudOps Enterprise is a high-performance, agentless Multi-Tenant SaaS platform designed to solve the fragmentation of modern multi-cloud infrastructure. It provides a "Single Pane of Glass" for Cloud Security Posture Management (CSPM), Financial Operations (FinOps), and Incident Response across Microsoft Azure, Amazon Web Services (AWS), and Google Cloud Platform (GCP).

## Features
- **Agentless Multi-Cloud Discovery**: Connects directly to Azure Resource Graph and AWS STS to map infrastructure without endpoint agents.
- **Unified Threat Engine**: Normalizes disjointed security alerts from Azure Defender and AWS GuardDuty into the standardized MITRE ATT&CK framework.
- **AI Remediation Assistant**: Context-aware AI automatically generates Infrastructure-as-Code (IaC) fixes and CLI commands to patch discovered vulnerabilities.
- **Real-Time SOC Dashboard**: Utilizes WebSockets (SSE) to push sub-second threat intelligence updates to the Executive Command Center.
- **Cost Optimization Engine**: Automatically flags orphaned IP addresses, unattached disks, and idle compute instances to drive down monthly cloud spend.

## Architecture
- **Frontend**: React 18, Vite, Zustand, Recharts, Framer Motion.
- **Backend**: Node.js, Express, RESTful APIs, SSE.
- **Database**: SQLite (Development) / PostgreSQL (Production) with strict Row-Level Security (RLS) for tenant isolation.
- **Integrations**: `@azure/arm-resources`, `@aws-sdk/client-sts`, OpenAI API.

## Design Patterns
The backend heavily utilizes the **ProviderFactory Pattern** to abstract cloud-specific SDK logic. This allows the core business logic (`DiscoveryEngine`, `ThreatEngine`) to remain entirely cloud-agnostic, making it trivial to plug in new cloud vendors.

## Getting Started
See the `docs/` folder for comprehensive architecture diagrams, deployment checklists, and security documentation.
