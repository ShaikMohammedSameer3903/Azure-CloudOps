# Azure Healthcare Rollout Presentation Deck

This slide structure outlines the final capstone presentation.

---

## 📽️ Slide Outline Summary

* **Slide 1**: Title Slide - Azure Healthcare Landing Zone Rollout
* **Slide 2**: The Business Challenge - EHR Cloud Migration Requirements
* **Slide 3**: Technical Architecture Overview (Mermaid Diagrams)
* **Slide 4**: Core Network Topography (Hub & Spoke Model)
* **Slide 5**: Regulatory Security Standards (HIPAA / HITRUST alignment)
* **Slide 6**: Centralized Governance Framework (Azure Policies)
* **Slide 7**: Accidental Deletion Lock Control Patterns
* **Slide 8**: Identity Access Hygiene & PIM Roles
* **Slide 9**: Multi-Factor Authentication (MFA) Enforcements
* **Slide 10**: Backup Architecture & GRS Recovery Vaults
* **Slide 11**: Automated Database Restore Script Validation (`validate-backup.ps1`)
* **Slide 12**: The Incident: UAT Alert Fatigue (The Problem)
* **Slide 13**: Root Cause Analysis Report (5 Whys Findings)
* **Slide 14**: Redesigning Alert Rules (The Solution)
* **Slide 15**: Alert Tuning Performance Metrics (Before vs. After)
* **Slide 16**: Cost Control & Budget Caps
* **Slide 17**: Support Runbooks & Operations Handover
* **Slide 18**: Hypercare Support & Release Schedules
* **Slide 19**: Capstone Project Evaluation & Scorecard
* **Slide 20**: Future Work & Architectural Enhancements

---

## 📝 Slides Details & Speaker Notes

### Slide 1: Title Slide
* **Slide Title**: Azure Healthcare Platform Landing Zone
* **Subtitle**: Operational Readiness & Governance Review
* **Presenter**: S. Sameer, Lead Infrastructure Architect
* **Visual Notes**: High-contrast corporate dark theme with deep clinical blue and teal highlight borders.
* **Speaker Notes**:
  > Welcome, evaluators, to the readiness review for the Azure Healthcare Cloud Landing Zone. Today, we present our production-style implementation, covering governance policies, security baselines, tuned monitoring, and automated backup validation.

---

### Slide 2: The Business Challenge
* **Slide Title**: EHR Cloud Migration Requirements
* **Bullet Points**:
  - Migrating patient Electronic Health Records (EHR) to Azure East US 2.
  - Required HIPAA compliance: encryption at rest, encryption in transit, and auditing.
  - Zero-Trust network segmentation to isolate SQL databases from public scopes.
  - High availability: weekly full backups and daily incremental GRS protection.
* **Speaker Notes**:
  > Healthcare workloads process regulated patient data, which requires a Zero-Trust architecture. We must ensure that access is restricted, audited, and compliant.

---

### Slide 3: Technical Architecture Overview
* **Slide Title**: Production Landing Zone Infrastructure
* **Mermaid Flowchart**:
  ```mermaid
  graph TD
    subgraph Primary East US 2
      VNET[vnet-hc-prod] --> subApp[sub-hc-emr-app]
      VNET --> subDB[sub-hc-db]
      subDB --> SQL[(sql-hc-prod-db01)]
      SQL --> RSV[rsv-hc-prod-backup]
    end
    subgraph Secondary West US 2
      RSV -->|GeoReplicated| RSV_SEC[rsv-hc-prod-backup-sec]
    end
  ```
* **Speaker Notes**:
  > This flowchart shows our primary region hub-and-spoke setup. Critical database workloads replicate to our Recovery Services Vault, which supports Cross-Region Restore to our secondary West US 2 region.

---

### Slide 12: UAT Alert Fatigue Incident
* **Slide Title**: The Incident: Alert Noise Fatigue
* **Key Visuals**: Before vs. After comparison chart.
* **Bullet Points**:
  - Default alerts triggered warning emails on single transient drops.
  - 186 daily alerts caused operations engineers to silence alerts.
  - Silent rules masked a real transaction log database failure for 36 hours.
* **Speaker Notes**:
  > During UAT, we hit a critical alert fatigue issue. A high volume of false alarms caused engineers to silence alerts, masking a real database failure. Today, we show how we tuned these alert rules to prevent alert fatigue.
