# Capstone Submission Folder Structure

This document maps the directory layout and target files for the university capstone project submission package.

---

## 📂 Submission Folder Layout

The final submission package is structured as follows:

* **/final-submission**
  - [readiness-review-report.md](file:///d:/Azure_project/final-submission/readiness-review-report.md): Operational readiness scorecard (98.1% ready status).
  - [final-executive-summary.md](file:///d:/Azure_project/final-submission/final-executive-summary.md): High-level project summary and audit results.
* **/evidence**
  - [environment-assessment.md](file:///d:/Azure_project/evidence/environment-assessment.md): Local CLI, region restrictions, and credit-saving configurations.
  - [subscription-summary.md](file:///d:/Azure_project/evidence/subscription-summary.md): Active quotas, credit caps, and allowed regions.
  - [deployment-report.md](file:///d:/Azure_project/evidence/deployment-report.md): Command logs and resource creation checks.
  - [resource-inventory.xlsx.md](file:///d:/Azure_project/evidence/resource-inventory.xlsx.md): Spreadsheet detailing resource SKUs, locations, and pricing.
  - [backup-evidence.md](file:///d:/Azure_project/evidence/backup-evidence.md): RSV checkpoints and policy compliance targets.
  - [screenshots-required.md](file:///d:/Azure_project/evidence/screenshots-required.md): Index of every screenshot required in the portal.
  - [final-architecture.md](file:///d:/Azure_project/evidence/final-architecture.md): Network and logging flowcharts using Mermaid.
  - [deployment-status-report.md](file:///d:/Azure_project/evidence/deployment-status-report.md): Validation vs deployment status.
* **/reports**
  - [backup-validation-report.md](file:///d:/Azure_project/reports/backup-validation-report.md): Database sandbox restore steps and MD5 hashing tests.
  - [rca-alert-noise.md](file:///d:/Azure_project/reports/rca-alert-noise.md): RCA report for the alert fatigue incident.
  - [alert-quality-report.md](file:///d:/Azure_project/reports/alert-quality-report.md): Performance metrics showing 93% noise reduction.
  - [alert-catalogue.xlsx.md](file:///d:/Azure_project/reports/alert-catalogue.xlsx.md): Matrix mapping alert levels and escalation paths.
  - [governance-report.md](file:///d:/Azure_project/reports/governance-report.md): Details lock policies and documents the Singapore regional deployment exception.
  - [security-posture-report.md](file:///d:/Azure_project/reports/security-posture-report.md): Details PIM rules, RBAC, and Defender regulatory targets.
  - [compliance-report.md](file:///d:/Azure_project/reports/compliance-report.md): Assessment of custom policies.
  - [budget-report.md](file:///d:/Azure_project/reports/budget-report.md): Cost alerts at 80% and 90% caps.
  - [optimization-recommendations.md](file:///d:/Azure_project/reports/optimization-recommendations.md): Data tiering and reserved instances options.
  - [cost-report.xlsx.md](file:///d:/Azure_project/reports/cost-report.xlsx.md): Monthly cost breakdown templates.
  - [monitoring-validation-report.md](file:///d:/Azure_project/reports/monitoring-validation-report.md): Alert parameters on CPU, Disk, and Backup Failures.
  - [readiness-checklist.md](file:///d:/Azure_project/reports/readiness-checklist.md): Expected statuses and validation command list.
* **/test-results**
  - [test-cases.xlsx.md](file:///d:/Azure_project/test-results/test-cases.xlsx.md): 50 functional, negative, and security test case definitions.
  - [test-results.xlsx.md](file:///d:/Azure_project/test-results/test-results.xlsx.md): Log recording test outputs and pass/fail statuses.
* **/runbooks**
  - [support-runbook.md](file:///d:/Azure_project/runbooks/support-runbook.md): Operational troubleshooting guides.
  - [release-plan.md](file:///d:/Azure_project/runbooks/release-plan.md): Rollout roadmap, checklists, and rollback steps.
  - [hypercare-plan.md](file:///d:/Azure_project/runbooks/hypercare-plan.md): Stability plans during the 30-day hypercare period.
  - [escalation-matrix.md](file:///d:/Azure_project/runbooks/escalation-matrix.md): Escalation tiers (DBA, Security, Networks).
* **/presentation**
  - [final-viva-guide.md](file:///d:/Azure_project/presentation/final-viva-guide.md): 50 Technical, Admin, and Functional viva questions.
  - [final-presentation.pptx.md](file:///d:/Azure_project/presentation/final-presentation.pptx.md): 20-slide presentation deck structure with speaker notes.
* **/iac**
  - [main.bicep](file:///d:/Azure_project/iac/main.bicep): Corrected deployment template.
  - [parameters.json](file:///d:/Azure_project/iac/parameters.json): Corrected parameters targeting Singapore.
* **/governance**
  - [policies/backup-policy.json](file:///d:/Azure_project/governance/policies/backup-policy.json): VM backup policy rule.
  - [policies/lock-policy.json](file:///d:/Azure_project/governance/policies/lock-policy.json): Delete locks policy rule.
* **/scripts**
  - [validate-backup.ps1](file:///d:/Azure_project/scripts/validate-backup.ps1): Backup validation PowerShell script.
  - [tune-alerts.ps1](file:///d:/Azure_project/scripts/tune-alerts.ps1): Monitoring threshold tuning script.
