# Technical Architecture Diagram & Layout

This document provides visual representations of the **Azure Healthcare Cloud Landing Zone** using Mermaid diagrams, detailing network isolation, diagnostic flows, and backup replication routing.

---

## 🌐 1. Landing Zone VNet Topology

The diagram below maps the private subnet partitions, application gateway ingress WAF, and database endpoints deployed in the `southeastasia` region:

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

## 📈 2. Centralized Diagnostic Log Stream

This diagram maps how resource logs, administrative actions, and audit reports stream into the Log Analytics Workspace:

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
