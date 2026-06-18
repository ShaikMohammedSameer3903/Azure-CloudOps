# Alert Catalogue (alert-catalogue.xlsx)

This sheet documents the alert rules, metric thresholds, action groups, and support escalation paths for production workloads.

---

## 📈 Alert Definitions Matrix

| Alert ID | Alert Name | Severity Level | Target Resource Scope | Metric Criteria | Window / Freq | Action Group | Primary Escalation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | `alert-hc-backup-failures` | 1 (Critical) | `rsv-hc-prod-backup` | `BackupFailureCount >= 2` | 1 Hour / 15 Mins | `ag-hc-ops-pager` | DB Lead > Ops Lead |
| **02** | `alert-hc-db-high-cpu` | 2 (Warning) | `sql-hc-prod-db01` | `CpuPercentage > 85%` | 15 Mins / 5 Mins | `ag-hc-ops-dbs` | DB Operations Lead |
| **03** | `alert-hc-kv-expiry` | 3 (Warning) | `kv-hc-prod-secrets` | `SecretNearExpiry <= 45` | 1 Day / 12 Hours | `ag-hc-sec-team` | Security Engineer |
| **04** | `alert-hc-vnet-ddos` | 1 (Critical) | `vnet-hc-prod-vnet` | DDoS Mitigation Activated | Instant (1 min) | `ag-hc-sec-soc` | SOC Lead > CISO |
| **05** | `alert-hc-er-status` | 1 (Critical) | ExpressRoute Gateway | ExpressRoute Offline | 1 Min / 1 Min | `ag-hc-ops-nets` | Network Ops Lead |

---

## ⚙️ Escalation Guidelines
- **Severity 1 (Critical)**: Triggers P1 incidents in ServiceNow and alerts the on-call engineer via PagerDuty (voice call/SMS).
- **Severity 2 (Warning)**: Dispatches email alerts and opens warning tasks in Jira.
- **Severity 3 (Warning/Info)**: Registers event logs in the Log Analytics Workspace.
