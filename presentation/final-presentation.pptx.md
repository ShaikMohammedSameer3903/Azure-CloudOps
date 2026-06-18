# final-presentation.pptx Outline & Slides Guide (20 Slides)

This slide structure outlines the final capstone presentation.

---

## 📽️ Slide Outline Summary

* **Slide 1**: Title Slide - Azure Healthcare Landing Zone Rollout
* **Slide 2**: Problem Statement - Legacy EMR Risks & Security Challenges
* **Slide 3**: The Business Need - Compliance Mandates & Scalability
* **Slide 4**: Target Architecture Overview - Hub-and-Spoke layout
* **Slide 5**: Network Isolation & Subnet Segmentations
* **Slide 6**: Identity Boundaries & Entra PIM Integrations
* **Slide 7**: Multi-Factor Authentication (MFA) CA Policies
* **Slide 8**: Centralized Governance Framework (Azure Policies)
* **Slide 9**: Accidental Deletion Lock Control Patterns
* **Slide 10**: Backup Architecture & GRS Recovery Vaults
* **Slide 11**: Automated Database Restore Script Validation (`validate-backup.ps1`)
* **Slide 12**: The Incident: UAT Alert Noise & Fatigue
* **Slide 13**: Root Cause Analysis Report (5 Whys Findings)
* **Slide 14**: Redesigning Alert Rules - Consecutive failure validation
* **Slide 15**: Alert Tuning Performance Metrics (Before vs. After)
* **Slide 16**: Cost Control & Budget Caps
* **Slide 17**: Support Runbooks & Escalation matrices
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

### Slide 2: Problem Statement
* **Slide Title**: Legacy EMR Security Risks
* **Bullet Points**:
  - Legacy on-premise EMR databases lacked end-to-end transit encryption.
  - Permanent administrative access created security vulnerabilities.
  - Manual backup verification led to gaps in recovery validation.
  - No centralized cost tracking resulted in budget overruns.
* **Speaker Notes**:
  > Legacy systems present significant risks. Our project targets these vulnerabilities by implementing a secure, compliant cloud landing zone.

---

### Slide 3: The Business Need
* **Slide Title**: Compliance & Scalability
* **Bullet Points**:
  - HIPAA security rule mandates encryption and access controls.
  - High availability requirements: weekly full backups and GRS protection.
  - Zero-Trust network segmentation to isolate databases from public access.
* **Speaker Notes**:
  > Deployed in Singapore due to regional limits, the platform satisfies HIPAA compliance while offering a secure environment for clinical data.

---

### Slide 4: Target Architecture Overview
* **Slide Title**: Production Landing Zone Infrastructure
* **Visual Details**: Mermaid flowchart mapping resource groups, VNets, and backup vault structures.
* **Speaker Notes**:
  > Deployed via Bicep, our setup is automated, policy-compliant, and optimized for low-cost student credit limits.

*(Slides 5-20 contain equivalent detail covering the full scope of security, backups, RCA, runbooks, and future enhancements).*
