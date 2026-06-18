# Budget & Cost Control Report

This report documents the budget limits and cost-alert thresholds configured to manage deployment spending.

---

## 💰 1. Monthly Budget Allocations

* **Primary Resource Group Scope**: `RG-Healthcare-Prod`
* **Monthly Budget Cap**: $1,500.00 USD
* **Currency**: USD ($)
* **Time Period**: Monthly (Resets on the 1st of each month)

---

## 🚨 2. Alert Threshold Triggers

Notifications are dispatched to the operations team when monthly spend reaches the following thresholds:

1. **80% Threshold ($1,200.00)**: Triggers an warning email to `ops-alerts@healthcorp.com` to review active compute resources.
2. **90% Threshold ($1,350.00)**: Triggers a P2 Jira ticket to investigate potential cost overruns.
3. **100% Threshold ($1,500.00)**: Sends a critical alert to the Financial Lead (`m.sameer@healthcorp.com`) to initiate cost-saving measures.

---

## 🔧 3. Cost-Alert Verification Command

```bash
# Verify budget and alert settings in Azure Cost Management
az consumption budget show `
  --name "Production-Base-Budget" `
  --resource-group "RG-Healthcare-Prod"
```
