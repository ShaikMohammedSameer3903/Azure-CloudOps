# Deployment Failure Root Cause Analysis (RCA)

**Incident ID**: RCA-DEPLOY-02  
**Resource Groups**: `RG-Healthcare-Prod`, `RG-Healthcare-Prod-EastUS`  
**Deployer Caller**: `2300031607@kluniversity.in`  
**Classification**: High Severity (Deployment Blocker)

---

## 🚨 1. Symptoms & Incident History
Deployments of the landing zone Bicep template failed during validation:
* **Validate Deployment**: Failed
* **'deny' Policy action**: Failed

---

## 🔍 2. Root Cause Analysis (RCA)

The failures in the Resource Groups `RG-Healthcare-Prod` (when it defaulted to Central India) and `RG-Healthcare-Prod-EastUS` were caused by the subscription-level policy **`sys.regionrestriction`** ("Allowed resource deployment regions"). 

The policy blocks the provisioning of resources like Key Vaults, Log Analytics Workspaces, and Recovery Services Vaults in regions outside its allowed list: `southeastasia`, `uaenorth`, `eastasia`, `koreacentral`, and `austriaeast`. Because the template initially targeted `centralindia` and `eastus`, the deployments were denied by the Azure Resource Manager.

---

## 🛠️ 3. Corrective & Preventive Actions

### Corrective Action (Immediate)
* Reconfigured Bicep parameter location targets to **`southeastasia`** (Southeast Asia, Singapore).
* Corrected the default values in `iac/parameters.json`.

### Preventive Action (Long-Term Template Tuning)
* Extracted Recovery Services Vault redundancy settings to a child resource (`Microsoft.RecoveryServices/vaults/backupstorageconfig`) to resolve Bicep compilation warnings.
* Removed unused parameters (`adminObjectIds`) from parameters and Bicep files to keep code clean.
* Validated updated files using `az deployment group validate`, returning `"provisioningState": "Succeeded"`.
