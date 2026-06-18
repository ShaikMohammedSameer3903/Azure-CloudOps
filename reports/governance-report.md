# Governance & Policy Report

This report documents the governance framework, policy compliance checks, and resource lock configurations applied to the landing zone.

---

## 🛡️ 1. Resource Locks & Tagging Policies

To prevent accidental modifications, a `CanNotDelete` lock is applied at the Resource Group scope:

```powershell
# Apply resource lock
az lock create `
  --name "rg-delete-lock" `
  --lock-type CanNotDelete `
  --resource-group "RG-Healthcare-Prod"
```
This lock prevents deletion requests from all users, including Owners.

Production resources are required to carry the following tags:
* `Environment`: Must be set to `Production`.
* `HIPAA`: Must be set to `True`.
* `Project`: Must be set to `HealthcareReady`.

---

## 📋 2. Custom Azure Policy Compliance

* **VM Backup Policy (`backup-policy.json`)**: Audits virtual machines to ensure they are registered with a backup plan.
* **Resource Lock Policy (`lock-policy.json`)**: Audits resource groups to ensure a `CanNotDelete` lock is applied.

---

## ⚠️ 3. Documented Governance Exception

* **Exception Code**: EX-REG-01 (Regional Deployment Exception)
* **Description**: The landing zone was deployed in **`southeastasia`** (Southeast Asia) rather than `centralindia` (Central India) as originally requested.
* **Root Cause**: The Azure for Students subscription enforces policy `sys.regionrestriction`, blocking deployments outside of five allowed regions. UAE North and Southeast Asia are the only available regional endpoints, and Southeast Asia was selected as the closest allowed region.
* **Mitigation**: Deployed in Southeast Asia to satisfy local subscription policies. Approved by the Audit Lead.
