# Test Suite cases (test-cases.xlsx)

This sheet documents the 50 test cases configured for landing zone validation.

---

## 📊 1. Functional Tests (TC-FN-01 to TC-FN-10)

| Test ID | Objective | Preconditions | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-FN-01** | Verify resource lock blocks deletion | delete Lock active | Delete resource group | blocked with `ScopeLocked` code |
| **TC-FN-02** | Verify backup policy VM registration | Policy assigned | Provision VM tagged `Production` | Auto-registered with backup vault |
| **TC-FN-03** | Verify Log Analytics Workspace creation | RG deployed | Query workspaces list | Workspace state is active |
| **TC-FN-04** | Verify Key Vault public block | Firewall rules active | Inbound query from public IP | Denied with 403 Forbidden |
| **TC-FN-05** | Verify diagnostic settings streaming | settings active | Read a Key Vault secret | Logs stream to Log Analytics |
| **TC-FN-06** | Verify recovery services vault state | RSV deployed | Query RSV properties | vault state is Succeeded |
| **TC-FN-07** | Verify private subnet separation | subnets deployed | Query VNet IP ranges | Correctly isolated subnets |
| **TC-FN-08** | Verify WAF routing to EMR VM | app gateway active | Send HTTPS request to WAF IP | Request routes to EMR VM |
| **TC-FN-09** | Verify tagging enforcement on resources | Policy assigned | Provision resource without tags | deployment denied by policy |
| **TC-FN-10** | Verify database backup state queries | RSV active | Query database backup status | Returns recent success |

---

## 🛑 2. Negative Tests (TC-NG-01 to TC-NG-10)

| Test ID | Objective | Preconditions | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-NG-01** | Verify direct database delete blocked | Lock active | Attempt to delete SQL database | blocked by delete Lock policy |
| **TC-NG-02** | Verify unauthorized secrets read | Standard Reader role | Attempt to read keyvault secrets | Access Denied (RBAC block) |
| **TC-NG-03** | Verify invalid checksum validation | Corrupt file | Run `validate-backup.ps1` | Logs checksum mismatch and exits |
| **TC-NG-04** | Verify disallowed region deployment | Policy active | Deploy to Central India region | Denied by region restriction policy |
| **TC-NG-05** | Verify unauthorized PIM activation | Non-approved user | Attempt to activate Backup Contributor | Denied (No PIM role assignment) |
| **TC-NG-06** | Verify storage account public access | Policy assigned | Set storage access to public | Denied by landing zone policy |
| **TC-NG-07** | Verify keyvault purge attempts | Purge protection on | Attempt to purge deleted keyvault | Denied by purge protection setting |
| **TC-NG-08** | Verify unsupported VM size deploy | Core quotas active | Deploy G-Series VM instance | Denied by subscription limits |
| **TC-NG-09** | Verify invalid MFA credentials login | MFA active | Attempt login without MFA | Session authentication blocked |
| **TC-NG-10** | Verify lock removal by contributor | standard Contributor | Attempt lock deletion | Denied (Owner permissions required) |

---

## 🔒 3. Security Tests (TC-SE-01 to TC-SE-10)

| Test ID | Objective | Preconditions | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-SE-01** | Verify MFA requirements | CA policy active | Login administrative portal | MFA challenge required |
| **TC-SE-02** | Verify PIM activation justification | PIM active | Elevate to User Access Admin | Justification text field required |
| **TC-SE-03** | Verify diagnostic audit logs retention | LAW deployed | Check LAW retention properties | retention set to 365 days |
| **TC-SE-04** | Verify Key Vault encryption CMK | Key Vault active | Query KV key properties | HSM backing key verified |
| **TC-SE-05** | Verify PIM role auto-revocation | PIM active | Wait for active role duration to pass | Session privileges expired |
| **TC-SE-06** | Verify storage secure transfer rules | Storage deployed | Send HTTP request to storage | Redirected to HTTPS (Secure transfer) |
| **TC-SE-07** | Verify NSG inbound ports lockdown | VNet active | Port scan EMR VM public ports | All port requests blocked |
| **TC-SE-08** | Verify RBAC least privilege mapping | Reader role | Attempt to provision a storage group | Blocked by RBAC permissions |
| **TC-SE-09** | Verify Sentinel alerting rules | Sentinel active | Simulate Key Vault credentials read | Sentinel security incident alert fired |
| **TC-SE-10** | Verify PIM administrator elevation log | PIM active | Audit Entra ID PIM history | Elevation event logged with details |

---

## 💾 4. Backup & Restore Tests (TC-BK-01 to TC-BK-10)

| Test ID | Objective | Preconditions | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-BK-01** | Verify weekly full backup schedule | policy active | Check SQL backup settings | Weekly schedule configured |
| **TC-BK-02** | Verify RSV GRS replication state | RSV deployed | Query RSV properties | Redundancy set to GeoRedundant |
| **TC-BK-03** | Verify Cross-Region Restore status | RSV active | Query RSV properties | Cross-Region Restore is enabled |
| **TC-BK-04** | Verify daily incremental logs backup | policy active | Check SQL backup log schedule | Incremental schedule configured |
| **TC-BK-05** | Verify soft delete retention period | RSV active | Query RSV delete properties | Soft delete retention set to 14 days |
| **TC-BK-06** | Verify automated restore validation | RSV active | Run `validate-backup.ps1` | Validation script output: Succeeded |
| **TC-BK-07** | Verify database restore subnet routing | VNet active | Check sandbox network configuration | Restore container network isolated |
| **TC-BK-08** | Verify backup logs compliance exports | RSV active | Perform restore validation test | audit JSON log exported |
| **TC-BK-09** | Verify SQL log-trim backup integrity | SQL active | Run consistency check on database | Database integrity check: Succeeded |
| **TC-BK-10** | Verify backup job error reporting | metric active | Force backup job failure | failure event logged in monitor |

---

## 📈 5. Monitoring & Cost Tests (TC-MN-01 to TC-MN-10)

| Test ID | Objective | Preconditions | Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-MN-01** | Verify backup failures alert tuning | alert active | Simulate single backup failure | Alarm skipped (No noise alert) |
| **TC-MN-02** | Verify high CPU usage alert warning | alert active | CPU spikes above 85% for 15 mins | Warning alert sent to DBA group |
| **TC-MN-03** | Verify 80% budget alert warning | budget active | Monthly spend reaches 80% cap | Cost management warning email sent |
| **TC-MN-04** | Verify 90% budget alert ticket | budget active | Monthly spend reaches 90% cap | Ticket created in ServiceNow |
| **TC-MN-05** | Verify alert severity mappings | alert active | Check alert action groups | Critical alerts route to PagerDuty |
| **TC-MN-06** | Verify disk space alert warning | alert active | Disk space utilization > 90% | Warning alert sent to storage team |
| **TC-MN-07** | Verify keyvault secret expiry warning | alert active | Secret within 45 days of expiry | Expiry warning email dispatched |
| **TC-MN-08** | Verify availability alerts firing | alert active | Simulate App Gateway VM offline | Critical availability alert fired |
| **TC-MN-09** | Verify Log Analytics Workspace caps | LAW active | Data ingestion reaches 0.5 GB | Data ingestion capped for day |
| **TC-MN-10** | Verify ExpressRoute circuit drop alert | alert active | Simulate connection gateway offline | Critical network gateway alert fired |
