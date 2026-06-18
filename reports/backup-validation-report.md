# Backup Validation & Restore Report

This report documents the validation of our disaster recovery processes and the verification of database integrity.

---

## 💾 1. Backup Policies & Protected Scopes

Workloads containing HIPAA-regulated patient records are governed by the following schedule:
* **Scope**: Primary production SQL databases (`PatientRecordsDB`) and VMs.
* **Frequency**: Full weekly backups (Sundays at 00:00 UTC) + daily incremental backups (02:00 UTC).
* **Retention Window**: 52 weeks of weekly recovery points; 60 months of monthly backups.
* **Redundancy**: Geo-Redundant Storage (GRS) with Cross-Region Restore (CRR) active.

---

## 🔬 2. Restore Test Sandbox Procedures

To prevent data corruption, recovery points are validated using a daily sandbox restore pipeline:
1. **Provision Container**: Build an isolated testing subnet (`sub-hc-db-restore-test`).
2. **Retrieve Log Slices**: Pull transaction log slices from the Recovery Services Vault.
3. **Execute Restore**: Restore the database instance to the container.
4. **Integrity Check**: Run database consistency checks (DBCC CHECKDB equivalents).
5. **MD5 Hashing Verification**: Compare the MD5 hash of the restored database instance with the source backup.

---

## 📋 3. Automated Validation Results

```text
==========================================================
  AZURE BACKUP AND RESTORE AUDIT VALIDATION RUNNER        
==========================================================
Vault Name: rsv-hc-prod-backup
Target: PatientRecordsDB
----------------------------------------------------------
[*] Authenticating Azure Management API... [SUCCESS]
[*] Retrieving Recovery Services Vault metadata...
    - Location: Southeast Asia
    - Backup redundancy: Geo-Redundant (GRS)
    - Cross-Region Restore: ENABLED
[*] Querying protection items for DB: PatientRecordsDB...
    - Last Backup Status: Completed
[*] Initializing automated backup verification restore dry-run...
    - Target sandbox: vnet-hc-prod-vnet/sub-hc-db-restore-test
    - Restoring database instance... [DONE]
[*] Executing Database Integrity Checks...
    - Database consistency check: 0 errors detected. [VALID]
    - Source Backup MD5 Hash  : 8f3e2b10a9cf47de8b7c0123ef65bb01
    - Restored Database Hash  : 8f3e2b10a9cf47de8b7c0123ef65bb01
    - Integrity validation matched successfully. [SUCCESS]
----------------------------------------------------------
[SUCCESS] Backup verification successfully completed!
```
