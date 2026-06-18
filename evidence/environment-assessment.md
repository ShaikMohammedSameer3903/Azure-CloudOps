# Azure Environment Assessment Report

This assessment verifies the deployment environment configurations and CLI login states for the **Azure Healthcare Landing Zone** rollout.

---

## 🔍 1. Azure CLI Environment Verification

We ran system queries to verify the local administration setup:

```powershell
# Verify CLI Version and dependencies
az --version
# Output: azure-cli 2.61.0, bicep 0.28.2

# Verify Active Login State
az account show --query "{user:user.name, state:state}"
# Output: {"user": "2300031607@kluniversity.in", "state": "Enabled"}
```

---

## 📊 2. Subscription Identity Details

* **Active Tenant Domain**: `kluniversity.in`
* **Tenant GUID**: `808cc83e-a546-47e7-a03f-73a1ebba24f3`
* **Subscription Name**: `Azure for Students`
* **Subscription GUID**: `d10be971-c619-4887-8737-b8054407194e`

---

## 💡 3. Low-Cost Deployment Recommendations

To protect the **$100.00 Azure Student Credit** allocation from premature exhaustion:
1. **Compute Sizing**: Deploy virtual machines under the B-Series family (`Standard_B2s` - 2 vCores, 4GB RAM) which costs approximately **$0.016/hour** ($11.50/month).
2. **Database Scale**: Configure Azure SQL database under the Basic tier (5 DTUs, 2GB size) costing **$4.90/month**, rather than deploying high-performance vCore options.
3. **Log Analytics Workloads**: Enforce daily data caps of 0.5 GB inside Log Analytics settings to block billing overages:
   ```bash
   az monitor log-analytics workspace update `
     --workspace-name law-hc-prod-logs `
     --resource-group RG-Healthcare-Prod `
     --data-limit 0.5
   ```
4. **Disposal Schedules**: Automatically de-provision development subnets and VMs during non-working hours using automated runbooks.
