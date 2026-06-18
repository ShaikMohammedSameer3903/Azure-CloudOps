# Deployment Status Report

This report documents the validation state, current deployment execution progress, and resource health metrics for the **Azure Healthcare Cloud Landing Zone** rollout.

---

## 🔍 1. Validation & Deployment Overview

* **Dry-Run Validation Status**: `Succeeded` (Validated in Southeast Asia)
* **Active Rollout Region**: `southeastasia` (Central India disallowed by policy restrictions)
* **Actual Deployment Status**: `Succeeded` (Active deployment completed successfully)
* **Primary Resource Group**: `RG-Healthcare-Prod`
* **Total Deployed Resources**: 6 active resources

---

## 📋 2. Deployed Resources & Health Inventory

The following resources were successfully provisioned and verified:

| Resource Name | Resource Type | Location | Provisioning Status | Security Audits |
| :--- | :--- | :--- | :--- | :--- |
| **law-hc-prod-logs** | `Microsoft.OperationalInsights/workspaces` | `southeastasia` | Succeeded | Audit data retention: 365 Days |
| **rsv-hc-prod-backup**| `Microsoft.RecoveryServices/vaults` | `southeastasia` | Succeeded | GRS Redundancy active |
| **vaultstorageconfig**| `Microsoft.RecoveryServices/vaults/backupstorageconfig` | `southeastasia` | Succeeded | Cross-Region Restore enabled |
| **kv-hc-prod-secrets** | `Microsoft.KeyVault/vaults` | `southeastasia` | Succeeded | HSM standard access enabled |
| **kv-audit-logs** | `Microsoft.Insights/diagnosticSettings` | `southeastasia` | Succeeded | Logs stream to `law-hc-prod-logs` |
| **alert-hc-backup-failures** | `Microsoft.Insights/metricAlerts` | `global` | Succeeded | Tuned alert rules active |
| **alert-hc-db-high-cpu** | `Microsoft.Insights/metricAlerts` | `global` | Succeeded | Tuned threshold alert active |

---

## 🔍 3. Post-Deployment Verification Output

Verify active services using the Azure CLI:

```powershell
# Verify that all resources are active in the resource group
az resource list --resource-group "RG-Healthcare-Prod" --query "[].{name:name, type:type, location:location, status:provisioningState}" -o table
```
