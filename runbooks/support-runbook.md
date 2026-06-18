# Support Runbook

This document details operational procedures and troubleshooting steps for system administrators, DBAs, and security analysts.

---

## 💾 OP-01: Recovery Services Backup Failure
* **Severity**: P1 - High Risk (HIPAA compliance breach if unrecovered within 24 hours).
* **Assigned Role**: On-Call Database Administrator
* **SLA Resolution Time**: 2 Hours

### Action Sequence:
1. **Elevate Role Access**: Activate the `Backup Contributor` role in PIM with the justification: `P1 Incident remediation: SQL database backup failing`.
2. **Retrieve Failure Details**:
   ```powershell
   # Find failed backup jobs in the vault
   Get-AzRecoveryServicesBackupJob -Status Failed -VaultId $VaultId
   ```
3. **Execute Sandbox Restoration Verification**: Validate that the backup engine works by triggering a test restore:
   ```powershell
   .\scripts\validate-backup.ps1 -TargetDatabase PatientRecordsDB
   ```
4. **Identify Resource Blockers**: Verify database file states and purge transaction logs if partition space is exhausted:
   ```sql
   DBCC SQLPERF(logspace);
   ALTER DATABASE PatientRecordsDB SET RECOVERY SIMPLE;
   DBCC SHRINKFILE (PatientRecordsDB_Log, 1);
   ALTER DATABASE PatientRecordsDB SET RECOVERY FULL;
   ```
5. **Run Manual Backup**: Trigger an immediate backup to restore protection coverage:
   ```powershell
   Backup-AzRecoveryServicesBackupItem -Item $BackupItem
   ```

---

## 🔑 OP-02: PIM Access Policy Violations
* **Severity**: P1 - High Security Threat.
* **Assigned Role**: SOC Incident Responder / Security Admin
* **SLA Resolution Time**: 30 Minutes

### Action Sequence:
1. **Identify Compromised Account**: Run Log Analytics queries on Key Vault logs to isolate the client IP and caller identity:
   ```kusto
   AzureDiagnostics
   | where ResourceProvider == "MICROSOFT.KEYVAULT"
   | where OperationName == "SecretGet"
   | project TimeGenerated, CallerIPAddress, identity_claim_http_schemas_xmlsoap_org_ws_2005_05_identity_claims_upn_s, requestUri_s
   ```
2. **Revoke Active Tokens**: Block the compromised account and expire active sessions:
   ```powershell
   Revoke-AzureADUserAllRefreshToken -ObjectId $UserObjectId
   ```
3. **Rotate Secrets**: Rotate Key Vault keys and certificates immediately:
   ```powershell
   $NewSecret = ConvertTo-SecureString "NewSecurePassword123!" -AsPlainText -Force
   Set-AzKeyVaultSecret -VaultName kv-hc-prod-secrets -Name "db-connection-string" -SecretValue $NewSecret
   ```
