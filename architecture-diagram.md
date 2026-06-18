# Azure Healthcare Platform - Architecture & Data Flow Diagram

This document presents the visual architecture layouts, transaction sequences, authentication boundaries, and data flow structures of the **Azure Healthcare Platform Dashboard**.

---

## 1. Deployed Landing Zone Network Topology

The production workload is designed with a hub-and-spoke VNet configuration to isolate database resources, application VMs, and ingress components within separate subnet boundaries in the `southeastasia` region.

```mermaid
graph TD
  subgraph Production VNet [vnet-hc-prod-vnet / 10.0.0.0/16]
    subgraph Ingress Subnet [sub-hc-ingress / 10.0.1.0/24]
      WAF[App Gateway WAF V2]
    end
    subgraph Application Subnet [sub-hc-emr-app / 10.0.2.0/24]
      VM1[vm-hc-prod-emr01]
    end
    subgraph Database Subnet [sub-hc-db / 10.0.3.0/24]
      SQL[(sql-hc-prod-db01)]
    end
    subgraph Restore Sandbox Subnet [sub-hc-db-restore-test / 10.0.4.0/24]
      Container[Restored DB Instance]
    end
  end

  PublicUser[Public Client] -->|HTTPS / Port 443| WAF
  WAF -->|Traffic Routing| VM1
  VM1 -->|SQL Inbound / Port 1433| SQL
  SQL -->|Recovery Services Backup| RSV[rsv-hc-prod-backup]
  RSV -->|Powershell Restore Dry-Run| Container
```

---

## 2. Telemetry and Logging Architecture

This diagram maps how infrastructure diagnostics, Key Vault access events, and backup job statuses stream into Azure Monitor and Log Analytics to establish our compliance baseline:

```mermaid
graph LR
  subgraph Audited Workload Resources
    KV[kv-hc-prod-secrets]
    SQL_DB[(sql-hc-prod-db01)]
    RSV_V[rsv-hc-prod-backup]
  end

  subgraph Central Monitoring Hub
    LAW[(law-hc-prod-logs)]
    AM[Azure Monitor Alerts]
    Sent[Microsoft Sentinel]
  end

  KV -->|Audit Events / Metric Telemetry| LAW
  SQL_DB -->|Audit Transaction Logs| LAW
  RSV_V -->|Job States / Failures| LAW

  LAW -->|Telemetry Parsing| AM
  LAW -->|Security Logs Correlation| Sent
```

---

## 3. Integration Dashboard Architecture (Current State)

This diagram shows how the React dashboard communicates with the local Node.js backend server and retrieves live resources from Microsoft Azure:

```mermaid
graph TD
    %% Frontend Layer
    subgraph UI ["Frontend User Interface (Vite + React)"]
        Dashboard["Operations Control Center (App.tsx)"]
        Refresher["Auto-Refresh Hook (Every 60s)"]
    end

    %% Backend Layer
    subgraph BE ["Backend Integration Service (Node.js + Express)"]
        ExpressServer["Express API Server (Port 3001)"]
        ChildProcess["Child Process Executor (exec)"]
    end

    %% Cloud Auth & API Layer
    subgraph Azure ["Microsoft Azure Cloud Platform"]
        AzureCLI["Azure CLI Context (Active Login)"]
        ARM["Azure Resource Manager APIs"]
        RG["Resource Group: RG-Healthcare-Prod"]
        RSV["Recovery Services Vault"]
        KV["Key Vault Premium"]
        AL["Azure Monitor Alert Rules"]
    end

    %% Mappings & Flow
    Refresher -->|Periodic Polling| Dashboard
    Dashboard -->|API Requests (GET /api/...)| ExpressServer
    ExpressServer -->|Executes AZ Commands| ChildProcess
    ChildProcess -->|Token Handshake| AzureCLI
    AzureCLI -->|REST Authentication| ARM
    ARM -->|Queries Resources| RG
    ARM -->|Checks Backup Status| RSV
    ARM -->|Audits Key Vault| KV
    ARM -->|Validates Alert State| AL
```

---

## 4. End-to-End Request Sequence

This diagram maps the sequence of an operator opening the dashboard and viewing live resources:

```mermaid
sequenceDiagram
    autonumber
    actor Operator as System Administrator
    participant React as React Web Dashboard
    participant Node as Express API Server
    participant CLI as Azure CLI Session
    participant Azure as Azure Resource Manager

    Operator->>React: Launches dashboard / Opens browser
    React->>Node: GET /api/resources
    Node->>CLI: Executes 'az resource list'
    CLI->>Azure: Secure HTTPS GET /subscriptions/.../resources
    Azure-->>CLI: JSON Response (Status Succeeded)
    CLI-->>Node: Output Stream (UTF-8 JSON)
    Node-->>React: Response Payload (List of Deployed Resources)
    React-->>Operator: Displays active resources live on screen
```
