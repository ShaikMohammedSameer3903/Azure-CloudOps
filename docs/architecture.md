# CloudOps Enterprise - Architecture Overview

CloudOps Enterprise is a unified, multi-tenant Cloud Security Posture Management (CSPM) and Financial Operations (FinOps) platform. It provides a single pane of glass across Azure, AWS, and GCP.

## Core Tenets
- **Agentless Discovery:** Integrates directly with native Cloud APIs (Azure Resource Graph, AWS STS) without requiring agents installed on endpoints.
- **Multi-Tenant SaaS:** Logical isolation at the database layer ensuring enterprise environments are strictly partitioned.
- **Real-Time Intelligence:** Utilizing WebSockets (SSE) for live synchronization of Threat Events and Resource state changes.
- **AI-Powered Operations:** Deep integration with Large Language Models to provide contextual remediation scripts and executive summarization.

## High-Level Architecture

```mermaid
graph TD
    %% Frontend Layer
    subgraph Frontend [Presentation Layer - React + Vite]
        UI[Executive Dashboard]
        AuthUI[Authentication UI]
        SOC[SOC Response Center]
        AI[AI Assistant]
    end

    %% API Gateway Layer
    subgraph API [API Layer - Node.js + Express]
        Router[Express Router]
        AuthMiddleware[JWT / RBAC Middleware]
        RateLimit[Rate Limiter]
    end

    %% Services Layer
    subgraph Services [Business Logic Services]
        DiscoveryEngine[Discovery Engine]
        ThreatEngine[Unified Threat Engine]
        CostEngine[Cost Optimization Engine]
        ComplianceEngine[Compliance Engine]
        ProviderFactory[Provider Factory]
    end

    %% Data Layer
    subgraph Data [Data Persistence Layer]
        SQLite[(SQLite / PostgreSQL)]
        Cache[(Redis Cache)]
    end

    %% External Cloud Providers
    subgraph Clouds [Cloud Service Providers]
        Azure[Microsoft Azure]
        AWS[Amazon Web Services]
        GCP[Google Cloud Platform]
    end

    %% Connections
    UI -->|HTTPS/WSS| Router
    AuthUI -->|HTTPS| Router
    SOC -->|HTTPS/WSS| Router
    AI -->|HTTPS| Router

    Router --> AuthMiddleware
    AuthMiddleware --> RateLimit
    RateLimit --> Services

    ProviderFactory --> DiscoveryEngine
    ProviderFactory --> ThreatEngine

    DiscoveryEngine --> Azure
    DiscoveryEngine --> AWS
    DiscoveryEngine --> GCP

    Services --> SQLite
    Services --> Cache
```

## Platform Extensibility
The platform utilizes a `ProviderFactory` pattern. Adding a new Cloud Provider requires implementing the standard interface contracts (Discovery, Costs, Threats) without modifying the core routing logic or frontend visualizations.
