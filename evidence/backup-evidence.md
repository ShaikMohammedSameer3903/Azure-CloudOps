# Backup Validation Evidence (backup-evidence.md)

This document maps out the required logs and verification outputs to demonstrate backup compliance for evaluators.

---

## 📋 Backup Verification Checkpoints

| Checkpoint Name | Validation Method / Command | Expected Verification Output |
| :--- | :--- | :--- |
| **01: RSV Status** | `az backup vault show -n rsv-hc-prod-backup -g RG-Healthcare-Prod` | Confirm `provisioningState == "Succeeded"` |
| **02: GRS Config** | `az backup vault show -n rsv-hc-prod-backup -g RG-Healthcare-Prod --query "properties.redundancySettings"` | Confirm `type == "GeoRedundant"` and `crossRegionRestoreFlag == true` |
| **03: Backup Job Success** | `az backup job list -v rsv-hc-prod-backup -g RG-Healthcare-Prod -o table` | Verify recent jobs show status as `Completed` |
| **04: Policy Compliance** | `az policy state list --policy-assignment "enforce-vm-backup"` | Confirm compliance state is `Compliant` |

---

## 🔬 2. Dry-Run Verification Command
Run the PowerShell dry-run script inside the terminal to export the audit log:
```powershell
# Run the validation script
.\scripts\validate-backup.ps1 -VaultName rsv-hc-prod-backup -TargetDatabase PatientRecordsDB
```
The script will output `backup-validation-audit.json` in the `/scripts` directory. Keep this JSON log file as auditable evidence.
