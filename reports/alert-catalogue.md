# Azure Healthcare Platform Alert Catalogue

This catalog documents all configured Azure Monitor alerts, thresholds, and support escalation paths for production workloads.

---

## 📈 Alert Catalog Matrix

| Alert Name | Severity Level | Metric / Condition | Action Group | Primary Escalation Path |
| :--- | :--- | :--- | :--- | :--- |
| **alert-hc-backup-failures** | 1 (Critical) | `BackupFailureCount >= 2` evaluated over a 1 Hour rolling window | `ag-hc-ops-pagerduty` | DBA Group > Infrastructure Architect > Director of Operations |
| **alert-hc-db-high-cpu** | 2 (Warning) | `CpuPercentage > 85%` for 15 consecutive minutes | `ag-hc-ops-db-team` | DBA Group > Database Operations Lead |
| **alert-hc-kv-expiry** | 3 (Warning) | Secrets expiring in less than 45 days | `ag-hc-sec-team` | Security Engineer > Security Administrator |
| **alert-hc-vnet-ddos** | 1 (Critical) | DDoS protection engine activity detected | `ag-hc-sec-soc` | SOC Team > Security Lead > CIS Director |
| **alert-hc-er-status** | 1 (Critical) | ExpressRoute hybrid circuit offline for >1 minute | `ag-hc-ops-net-team` | Network Lead > Telco Service Desk |
| **alert-hc-budget-breach** | 2 (Warning) | Monthly costs reach 80% of $2,500 budget cap | `ag-hc-mgmt-billing` | Financial Analyst > Project Lead |

---

## ⚙️ Threshold Tuning Rules

Alert rules are optimized using the following guidelines:
1. **consecutive Check Checks**: Any alert on transient metrics (e.g. CPU or network) must evaluate consecutive failure counts over a 15-minute sliding scale before firing.
2. **Action Group Routing**:
   - Severity 1 alerts trigger automated phone calls (PagerDuty) and generate ServiceNow P1 incident tickets.
   - Severity 2 alerts dispatch emails and open Jira warning tasks.
   - Severity 3 alerts register as informational logs in the Log Analytics workspace.
