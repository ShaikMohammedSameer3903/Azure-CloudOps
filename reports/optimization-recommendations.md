# Cost Optimization Recommendations

This document outlines strategies to optimize deployment costs for the **Azure Healthcare Cloud Landing Zone**.

---

## 💡 Recommended Cost-Saving Actions

### 1. Azure Hybrid Benefit (AHUB)
Apply existing on-premises Windows Server and SQL Server licenses to Azure virtual machines and databases. This can save up to **40%** on compute costs by avoiding retail operating system charges.

### 2. Compute Reserved Instances (RI)
Commit to a 1-year or 3-year reservation plan for core database compute instances (e.g. `sql-hc-prod-db01`). This can reduce standard billing rates by **30% to 50%**.

### 3. Log Analytics Workspace Data Tiering
Instead of retaining diagnostics logs in the active Log Analytics Workspace for 365 days (priced at $2.30/GB/month), adjust configurations to:
1. Retain logs in Log Analytics for **90 days** (free tier limit).
2. Archive logs older than 90 days to **Azure Storage Archive pools** (priced at $0.002/GB/month) to satisfy long-term compliance audit requirements.

---

## ⚙️ Implementation Command

```bash
# Configure Log Analytics data ingestion daily cap to limit costs
az monitor log-analytics workspace update `
  --workspace-name law-hc-prod-logs `
  --resource-group RG-Healthcare-Prod `
  --data-limit 0.5
```
