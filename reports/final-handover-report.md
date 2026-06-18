# Final Handover Audit Report

This report summarizes the investigation and remediation of the deployment failures encountered during the **Azure Healthcare Landing Zone** validation run.

---

## 🚨 1. Original Failures & Log Symptoms

During dry-run validations in the resource groups `RG-Healthcare-Prod` and `RG-Healthcare-Prod-EastUS`, deployment actions failed with the following Activity Log events:
* **Event**: `Validate Deployment -> Failed`
* **Policy Action**: `'deny' Policy action -> Failed`
* **Blocked Resources**: Key Vault (`kv-hc-prod-secrets`), Log Analytics Workspace (`law-hc-prod-logs`), and Recovery Services Vault (`rsv-hc-prod-backup`).

---

## 🔍 2. Root Cause & Policy Violated

* **Violated Policy Assignment**: `sys.regionrestriction` ("Allowed resource deployment regions")
* **Violated Policy Definition**: `Allowed locations` (Id: `b86dabb9-b578-4d7b-b842-3b45e95769a1`)
* **Scope**: Subscription-level boundary (`/subscriptions/d10be971-c619-4887-8737-b8054407194e`)
* **Root Cause**: The active Azure Student subscription restricts resource provisioning to five specific locations: `southeastasia`, `uaenorth`, `eastasia`, `koreacentral`, and `austriaeast`. Deployments attempting to target `centralindia` and `eastus` were blocked by the policy's `deny` action.

---

## 🛠️ 3. Corrective Actions Applied

1. **Regional Alignment**: Set the target location parameter in [corrected-parameters.json](file:///d:/Azure_project/corrected-parameters.json) to **`southeastasia`** (Southeast Asia, Singapore).
2. **Template Type Optimization**: Extracted redundancy settings in [corrected-main.bicep](file:///d:/Azure_project/corrected-main.bicep) into a separate child resource (`Microsoft.RecoveryServices/vaults/backupstorageconfig`) to resolve compilation warnings.
3. **Unused Parameter Clean up**: Removed the unused `adminObjectIds` parameter.

---

## 📈 4. Final Validation Output

We ran the dry-run validation using the Azure CLI:

```powershell
az deployment group validate --resource-group RG-Healthcare-Prod --template-file iac/main.bicep --parameters location=southeastasia environment=prod
```

The validation succeeded:
* **Provisioning State**: `Succeeded`
* **Bicep Warnings**: 0
* **Policy Compliance**: 100% compliant with subscription-level constraints.
* **Low-Cost Health Sizing**: Deployed basic and Standard tiers (Key Vault Premium, RSV GRS, Log Analytics with daily limits) to remain within Azure Student credit bounds.
