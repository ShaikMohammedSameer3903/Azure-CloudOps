# Monitoring Validation Report

This report documents the validation of our Azure Monitor configurations, metric alerts, and action groups.

---

## 📈 1. Tuned Metric Alert Config

The following alert rules are configured to track database resources:

* **alert-hc-backup-failures**: Critical severity alert rules scoped to the Recovery Services Vault. Tuned to require **2 consecutive failures** evaluated over a 1-hour window to suppress transient connection alarms.
* **alert-hc-db-high-cpu**: Warning alert scoped to the database. Tuned to trigger when **average CPU usage exceeds 85%** for 15 consecutive minutes (preventing false alarms from scheduled clinical query extraction workloads).

---

## 🛡️ 2. Action Groups & Notification Settings

Alert events are routed based on severity metrics:

1. **ag-hc-ops-pagerduty**: Routes critical Severity 1 alerts directly to on-call DBAs and opens high-priority ServiceNow P1 incident tickets.
2. **ag-hc-ops-db-team**: Routes Severity 2 warning alerts via email and opens Jira tasks for the database administrator group.

---

## 🔬 3. Verification Command

Verify metric alert rules using the Azure CLI:

```bash
# Verify alert rules deployed inside the Resource Group
az monitor metrics alert list --resource-group "RG-Healthcare-Prod" --query "[].{name:name, severity:severity, enabled:enabled}" -o table
```
