# Azure Healthcare Platform Cost & Budget Report

This cost report maps out billing models, resource limits, and cost-control thresholds for the **Azure Healthcare Cloud Landing Zone**.

---

## 📋 1. Resource Inventory & Monthly Cost Estimates

Costs are based on Azure retail pricing guidelines for the East US 2 region:

| Resource Name | Service Type | Tier / Size | Estimated Monthly Cost | Budget Cap Limit | Cost Tags |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **sql-hc-prod-db01** | Azure SQL Database | BC_Gen5_4 (4 vCores) | $736.80 | $800.00 | Environment: Production |
| **law-hc-prod-logs** | Log Analytics | PerGB2018 (365 days retention) | $650.00 | $800.00 | DataRetention: 365Days |
| **rsv-hc-prod-backup** | Recovery Services Vault| Standard (Geo-Redundant) | $420.50 | $500.00 | HIPAA: True |
| **agw-hc-prod-ingress**| Application Gateway | WAF V2 Medium | $312.44 | $350.00 | Tier: DMZ |
| **vm-hc-prod-emr01** | Virtual Machine | D4s_v5 (4 vCores, 16GB) | $282.12 | $300.00 | Service: EMR |
| **kv-hc-prod-secrets** | Key Vault | Premium (HSM Key support) | $45.20 | $50.00 | Compliance: Audited |
| **Total Combined** | - | - | **$2,447.06** | **$2,800.00** | - |

---

## 📈 2. Budget Alert Thresholds

A monthly budget cap is set at **$2,500.00** for the primary resource group.

* **Threshold 1 (80% / $2,000.00)**: Triggers warning emails to DevOps team (`ops-alerts@healthcorp.com`) to check for runaway log queries.
* **Threshold 2 (90% / $2,250.00)**: Triggers P1 tickets in ServiceNow to start de-provisioning idle sandbox subnets.
* **Threshold 3 (100% / $2,500.00)**: Dispatches critical notifications to the Financial Lead (`m.sameer@healthcorp.com`) and suspends non-essential development subscription pools.

---

## 💡 3. Cost Optimization Recommendations

To lower platform costs, we recommend:
1. **Azure Hybrid Benefit (AHUB)**: Apply existing on-premise Windows Server/SQL licenses to VMs to save up to 40% on compute rates.
2. **Reserved Instances**: Commit to 3-year reservation plans for VM and database compute instances to cut standard pricing in half.
3. **Log Analytics Data Tiering**: Move archival diagnostics logs older than 90 days to Azure Storage Archive pools (priced at $0.002/GB/month) rather than retaining them in the active workspace.
