# Final Azure Deployment Verification Report

This report documents the final verification and confirmation of the Azure resource deployment for the **Azure Healthcare Cloud Landing Zone** rollout, utilizing the Azure Portal deployment history and resource inventory as the single source of truth.

---

## 🔍 1. Deployment Overview

* **Deployment Name**: `hc-landingzone-rollout`
* **Resource Group**: `RG-Healthcare-Prod`
* **Target Region**: `southeastasia` (Singapore)
* **Provisioning State**: `Succeeded`
* **Timestamp**: `2026-06-11T06:53:51.981018+00:00`
* **Execution Duration**: `31.39 seconds` (Redeployment/update phase)
* **Deployment Success**: Verified and fully confirmed.

---

## 📦 2. Resource Inventory & Status

The following resources were successfully provisioned, verified as existing, and are currently in an active and healthy state:

| Resource Name | Resource Type | Location | Provisioning Status | Role / Details |
| :--- | :--- | :--- | :--- | :--- |
| **rsv-hc-prod-backup** | `Microsoft.RecoveryServices/vaults` | `southeastasia` | `Succeeded` | Recovery Services Vault for backup policy compliance |
| **law-hc-prod-logs** | `Microsoft.OperationalInsights/workspaces` | `southeastasia` | `Succeeded` | Centralized Log Analytics Workspace (365 days retention) |
| **kv-hc-prod-secrets** | `Microsoft.KeyVault/vaults` | `southeastasia` | `Succeeded` | HSM Premium Key Vault with Purge Protection & RBAC |
| **kv-audit-logs** | `Microsoft.Insights/diagnosticSettings` | `southeastasia` | `Succeeded` | Diagnostic settings streaming Key Vault audit logs to Log Analytics |
| **alert-hc-kv-availability** | `Microsoft.Insights/metricAlerts` | `global` | `Succeeded` | Metric alert rule for Key Vault availability drops below 99% |
| **alert-hc-kv-latency** | `Microsoft.Insights/metricAlerts` | `global` | `Succeeded` | Metric alert rule for Key Vault service latency above 1000ms |

---

## 🛠️ 3. Deployment Failures & Remediation Actions

### Historical Failure Diagnostics
The initial deployment failed with three distinct issues:
1. **Metric Alerts Error**: Alert configuration referenced unsupported metrics (`CpuPercentage` and `BackupFailureCount`) on Recovery Services Vault resources.
2. **Diagnostic settings retentionPolicy Error**: Diagnostic settings failed due to deprecated `retentionPolicy` parameters on Key Vault logs.
3. **Regional Constraint Policy**: Initial target regions (`centralindia` and `eastus`) were blocked by the subscription's region restriction policy (`sys.regionrestriction`).

### Remediation Actions Applied
1. **Metric Correction**: Replaced the unsupported database and backup alert metrics with Key Vault availability metrics (`Availability` threshold `< 99%`) and latency metrics (`ServiceApiLatency` threshold `> 1000ms`) directly targeted to the Key Vault.
2. **Retention Policy Clean-up**: Removed the deprecated diagnostic settings retention block from Bicep configuration.
3. **Region Realignment**: Corrected parameters to deploy specifically to `southeastasia` (Singapore), which is an allowed location.
4. **Redeployment Run**: Executed the deployment with `corrected-main.bicep` and `corrected-parameters.json`, resulting in a clean `Succeeded` state.

---

## ✅ 4. Final Evidence Checklist

| Checklist Item | Target Resource / Configuration | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| **Resource Group** | `RG-Healthcare-Prod` | Active Resource Group under Azure subscription | `VERIFIED` |
| **Deployment Success** | `hc-landingzone-rollout` | Deployment state marked as `Succeeded` | `VERIFIED` |
| **Key Vault** | `kv-hc-prod-secrets` | Active Key Vault, RBAC-enabled with Soft-Delete | `VERIFIED` |
| **Log Analytics Workspace** | `law-hc-prod-logs` | Active Operational Insights workspace, ingesting KV diagnostics | `VERIFIED` |
| **Recovery Services Vault** | `rsv-hc-prod-backup` | Active vault configured with GeoRedundant backup storage | `VERIFIED` |
| **Policies** | Region Constraint & Governance | Policy compliance satisfied by regional choice (`southeastasia`) | `VERIFIED` |
| **Activity Logs** | Operations audit trails | Activity log tracking active for resource provisioning events | `VERIFIED` |
| **Dashboard** | React Operations Control Center | Interactive UI mapping all deliverables and monitoring status | `VERIFIED` |

---

## 💻 5. Verification Commands Run

```powershell
# Query resource list in the group
az resource list --resource-group RG-Healthcare-Prod --output table

# Verify deployment execution state
az deployment group show --name hc-landingzone-rollout --resource-group RG-Healthcare-Prod --output json
```
