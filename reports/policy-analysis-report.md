# Policy Analysis Report

This report documents the Azure Policy boundaries, assignments, and parameters governing deployments within the active Azure subscription scope.

---

## 🔎 1. Active Azure Policy Attributes

Our investigation of the deployment denials identified the following active Azure Policy assignment:

* **Policy Assignment Name**: `sys.regionrestriction`
* **Policy Display Name**: `Allowed resource deployment regions`
* **Policy Definition Name**: `Allowed locations` (Definition ID: `/providers/Microsoft.Authorization/policyDefinitions/b86dabb9-b578-4d7b-b842-3b45e95769a1`)
* **Policy Assignment ID**: `/subscriptions/d10be971-c619-4887-8737-b8054407194e/providers/Microsoft.Authorization/policyAssignments/sys.regionrestriction`
* **Policy Scope**: `/subscriptions/d10be971-c619-4887-8737-b8054407194e` (Subscription-level boundary)
* **Policy Enforcement Action**: `Deny` (Denies validation and deployment commands if conditions mismatch)

---

## 🛑 2. Denied Parameters & Values

* **Denied Locations**: Any location outside the allowed region array. This includes `centralindia` (Central India) and `eastus` (East US).
* **Denied Configuration**: Resources deployed with parent property parameters `location` referencing unauthorized regions.
* **Allowed Deployment Regions**:
  - `southeastasia` (Singapore)
  - `uaenorth` (UAE North)
  - `eastasia` (Hong Kong)
  - `koreacentral` (Korea Central)
  - `austriaeast` (Austria East)

---

## 🔧 3. Diagnostic Investigation Commands

Verify the active policy rules using the Azure CLI:

```bash
# 1. List active policy assignments at the Subscription scope
az policy assignment list --query "[?name=='sys.regionrestriction']" -o json

# 2. Check policy compliance states for deployed resource groups
az policy state list --resource-group "RG-Healthcare-Prod"
```
