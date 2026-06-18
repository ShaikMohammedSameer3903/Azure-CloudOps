# Resource Inventory (resource-inventory.xlsx)

This sheet documents the active resources, SKUs, locations, and costs for the **Azure Healthcare Cloud Landing Zone** rollout.

---

## 📊 Deployed Resources Matrix

| Resource ID | Resource Name | Resource Type | Location | SKU / Pricing Tier | Monthly Cost (Est) | Resource Tags |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | `law-hc-prod-logs` | Microsoft.OperationalInsights/workspaces | `southeastasia` | PerGB2018 (365 days retention) | $650.00 | Environment: Production |
| **02** | `rsv-hc-prod-backup` | Microsoft.RecoveryServices/vaults | `southeastasia` | Standard (Geo-Redundant) | $420.50 | HIPAA: True |
| **03** | `kv-hc-prod-secrets` | Microsoft.KeyVault/vaults | `southeastasia` | Premium (Hardware-backed keys) | $45.20 | Compliance: Audited |
| **04** | `alert-hc-backup-failures` | Microsoft.Insights/metricAlerts | `global` | Severity 1 Metric Alert | $1.50 | Project: HealthcareReady |
| **05** | `alert-hc-db-high-cpu` | Microsoft.Insights/metricAlerts | `global` | Severity 2 Metric Alert | $1.50 | Project: HealthcareReady |
| **06** | `vnet-hc-prod-vnet` | Microsoft.Network/virtualNetworks | `southeastasia` | Standard IP routing | $0.00 | Environment: Production |

---

## 🔒 Resource Properties & Health Settings
* **Key Vault Lock**: `CanNotDelete` lock applied at Resource Group level to block deletions.
* **Diagnostics Config**: Logs are streamed from `kv-hc-prod-secrets` to `law-hc-prod-logs` for compliance auditing.
* **RSV Security**: Soft Delete is enabled with a **14-day hold period** to prevent malicious backup purging.
