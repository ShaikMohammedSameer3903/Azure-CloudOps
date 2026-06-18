# Azure Healthcare Platform Test Suite & Results

This test suite covers functional verification, negative validations, security boundary checks, backup recoveries, alert configurations, and budget compliance metrics.

---

## 🛠️ 1. Functional Test Cases

### Test ID: TC-FN-01 (Lock Policy Enforcement)
* **Objective**: Verify that resource locks prevent resource group removal.
* **Preconditions**: Policy `enforce-resource-locks` applied; `CanNotDelete` lock active on `rg-hc-database`.
* **Steps**:
  1. Login with Contributor privileges.
  2. Run command: `az group delete --name rg-hc-database --yes`
* **Expected Result**: Command fails with `ScopeLocked` error code. Resource group remains intact.
* **Actual Result**: `Deployment failed. Action delete is blocked by ScopeLock.`
* **Status**: **PASSED**

---

### Test ID: TC-FN-02 (Backup Policy Assignment)
* **Objective**: Verify that newly provisioned VMs automatically register with backup policy.
* **Preconditions**: Azure Policy `enforce-backup-for-vms` assigned.
* **Steps**:
  1. Deploy a new VM named `vm-hc-prod-emr02` inside target production resource group.
  2. Wait 15 minutes for policy evaluation.
  3. Query backup status: `az backup protection check-vm --vm-id $vmId`
* **Expected Result**: VM automatically registers with the Recovery Services vault backup list.
* **Actual Result**: VM registered. Backup protection is active.
* **Status**: **PASSED**

---

## 🛑 2. Negative Test Cases

### Test ID: TC-NG-01 (Unauthorized Access Verification)
* **Objective**: Verify that non-PIM approved users cannot read Key Vault secrets.
* **Preconditions**: User holds standard `Reader` role without PIM elevation.
* **Steps**:
  1. Login as standard reader.
  2. Run command: `az keyvault secret show --vault-name kv-hc-prod-secrets --name db-connection-string`
* **Expected Result**: Access denied with status `403 Forbidden` due to network rules and lack of Key Vault Admin role.
* **Actual Result**: Fails. Access denied by Key Vault firewall and RBAC authorization block.
* **Status**: **PASSED**

---

### Test ID: TC-NG-02 (Invalid Backup Restore Checksum)
* **Objective**: Verify that validate-backup script errors out when database checksum hash mismatches.
* **Preconditions**: Edit database verification step to simulate a corrupt file.
* **Steps**:
  1. Run `.\scripts\validate-backup.ps1 -TargetDatabase PatientRecordsDB` with manually altered MD5 hash.
* **Expected Result**: PowerShell console logs error and terminates restoration sequence with code `1`.
* **Actual Result**: Log prints: `[ERROR] Integrity mismatch detected!` script terminates.
* **Status**: **PASSED**

---

## 🔒 3. Security Test Cases

### Test ID: TC-SE-01 (MFA Enforced Conditional Access)
* **Objective**: Confirm login blocks if MFA credential challenges are not solved.
* **Preconditions**: Conditional Access policy active requiring MFA for administration.
* **Steps**:
  1. Login from unrecognized browser without token challenge confirmation.
* **Expected Result**: Azure portal prevents navigation, showing MFA enrollment warning screen.
* **Actual Result**: Portal login blocked. Awaiting MFA confirmation screen.
* **Status**: **PASSED**

---

### Test ID: TC-SE-02 (PIM Elevation Expiry)
* **Objective**: Confirm PIM elevations automatically expire after set duration.
* **Preconditions**: Active elevation of `User Access Administrator` set for 2 hours.
* **Steps**:
  1. Activate PIM role.
  2. Validate access after 2 hours and 5 minutes.
* **Expected Result**: Role access automatically revoked; subsequent admin actions fail.
* **Actual Result**: Access checks return `RoleNotAuthorized`. Role successfully revoked.
* **Status**: **PASSED**

---

## 💾 4. Backup & Restore Test Cases

### Test ID: TC-BK-01 (Automated Restore Dry Run)
* **Objective**: Verify database restoration test process.
* **Preconditions**: Backup file available on RSV.
* **Steps**:
  1. Run `.\scripts\validate-backup.ps1 -VaultName rsv-hc-prod-backup -TargetDatabase PatientRecordsDB`
* **Expected Result**: Script logs successful authentication, parses backup items, provisions sandbox container, performs dry-run restore, and exports verification logs.
* **Actual Result**: Logs successfully generated. Exit code `0`.
* **Status**: **PASSED**

---

## 📈 5. Monitoring & Alert Validation

### Test ID: TC-MN-01 (Tuned Alert Suppression)
* **Objective**: Verify that transient drops do not trigger backup alerts under tuned settings.
* **Preconditions**: Alert rule `alert-hc-backup-failures` tuned to threshold 2.
* **Steps**:
  1. Simulate single transient network drop.
  2. Verify if PagerDuty incident gets created.
* **Expected Result**: Metric count does not reach threshold of 2. Incident does not trigger.
* **Actual Result**: Warning skipped, zero noisy alerts generated.
* **Status**: **PASSED**

---

### Test ID: TC-MN-02 (Critical Alert Activation)
* **Objective**: Verify that persistent backup failures trigger alert.
* **Preconditions**: Alert rule tuned; 2 consecutive backup jobs failed.
* **Steps**:
  1. Force failure on 2 consecutive backup runs.
* **Expected Result**: Metric reaches threshold 2. Action group fires, sending incident alerts.
* **Actual Result**: Alert fires within 15 minutes. High priority P1 ticket generated.
* **Status**: **PASSED**

---

## 💰 6. Cost Governance Tests

### Test ID: TC-CG-01 (Budget Limit Triggers)
* **Objective**: Confirm cost alert email alerts when forecasted spend reaches 80%.
* **Preconditions**: Monthly budget set to $2,500.00.
* **Steps**:
  1. Load mock cost telemetry showing spend at $2,005.00 (80.2%).
* **Expected Result**: Azure cost management automatically sends notifications.
* **Actual Result**: Email notification dispatched: "Warning: Budget threshold 80% reached."
* **Status**: **PASSED**
