# Azure Platform Evidence Collection Guide

This guide lists the exact screenshots required for your capstone project portfolio submission and evaluator review. It maps each item to its Azure Portal location and lists the visual elements needed to confirm compliance.

---

## 📋 Evidence Collection Matrix

| ID | Screenshot Category | Azure Portal Location / Path | Key Visual Markers to Highlight |
| :--- | :--- | :--- | :--- |
| **01** | **Resource Group Setup** | Resource Groups > `rg-hc-database-prod` | Verify tags `Environment=Production`, `HIPAA=True`, `Project=HealthcareReady` |
| **02** | **Virtual Network** | Virtual Networks > `vnet-hc-prod-eastus2` | Confirm subnet segmentations: `sub-hc-db`, `sub-hc-db-restore-test` |
| **03** | **Recovery Services Vault** | RSV > `rsv-hc-prod-backup` | Verify Georedundancy (GRS) and Cross-Region Restore enabled status |
| **04** | **Backup Job Success** | RSV > Backup Jobs | Display successful database logs table with recent completion timestamps |
| **05** | **Restore Validation Log** | Local terminal / Console Output | Show successful dry-run logs and MD5 checksum matches from `validate-backup.ps1` |
| **06** | **Azure Monitor Alerts** | Monitor > Alerts > Alert Rules | Show the tuned threshold (`>=2 failures in 1 hr`, frequency: 15 mins) on `alert-hc-backup-failures` |
| **07** | **Log Analytics Workspace** | Log Analytics > law-hc-prod-logs > Usage | Verify data retention period is configured to **365 days** |
| **08** | **Azure Policy Compliance** | Policy > Compliance | Show compliance score of **100%** on custom backup and lock policy assignments |
| **09** | **Resource Locks** | `rg-hc-database-prod` > Locks | Verify `CanNotDelete` lock type applied to production resource groups |
| **10** | **Defender for Cloud** | Microsoft Defender for Cloud > Recommendations | Show target regulatory compliance scorecard for HIPAA/HITRUST |
| **11** | **Cost Management** | Cost Management + Billing > Cost Analysis | Show resource-level costs with tags matching the monthly report |
| **12** | **Budget Alerts** | Cost Management > Budgets | Verify budget threshold configurations at 80% and 90% parameters |
| **13** | **RBAC Assignments** | `rg-hc-database-prod` > IAM > Role Assignments | Verify groups mapped to Backup Contributor and Key Vault Administrator |
| **14** | **PIM Activations** | Entra ID > Privileged Identity Management > Audit | Verify elevation history with logged auditor justifications |
| **15** | **Dashboard Screens** | Local browser (Operations Dashboard) | Verify tabs: Overview, Slides, Policy, PIM, Alarm tuning, Backup dry-runs, Cost charts |

---

## 📸 Step-by-Step Evidence Gathering Instructions

1. **Setting Up Azure Portal Console View**: Set your theme to "Dark Mode" in Azure Portal to ensure consistent styling.
2. **Overlay Highlighting**: Use red rectangles or boxes to highlight resource groups, compliance parameters, or MD5 validation codes.
3. **Naming Verification**: Ensure all screenshots clearly show resource names matching the Bicep parameter templates.
4. **Verification Log Embedding**: Export text results alongside image crops in your submission pack.
