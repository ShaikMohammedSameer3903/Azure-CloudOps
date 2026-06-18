# Test Results Log (test-results.xlsx)

This sheet documents the execution results and verification outcomes for our 50-case test suite.

---

## 📊 Test Execution Logs (50 Cases)

| Test ID | Test Category | Target Scope | Date Executed | Tester | Status | Verification Summary |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-FN-01** | Functional | locks | 2026-06-11 | S. Sameer | **PASSED** | Blocked by ScopeLock policy |
| **TC-FN-02** | Functional | policies | 2026-06-11 | S. Sameer | **PASSED** | VM auto-registered with backup vault |
| **TC-FN-03** | Functional | LAW | 2026-06-11 | S. Sameer | **PASSED** | workspace active in Singapore |
| **TC-FN-04** | Functional | KV | 2026-06-11 | S. Sameer | **PASSED** | Inbound public calls blocked |
| **TC-FN-05** | Functional | diagnostics | 2026-06-11 | S. Sameer | **PASSED** | Logs stream successfully |
| **TC-FN-06** | Functional | RSV | 2026-06-11 | S. Sameer | **PASSED** | Vault provisioning Succeeded |
| **TC-FN-07** | Functional | network | 2026-06-11 | S. Sameer | **PASSED** | Subnets isolated correctly |
| **TC-FN-08** | Functional | WAF | 2026-06-11 | S. Sameer | **PASSED** | HTTPS routes to target VM |
| **TC-FN-09** | Functional | tags | 2026-06-11 | S. Sameer | **PASSED** | Untagged resource deploy blocked |
| **TC-FN-10** | Functional | backup query | 2026-06-11 | S. Sameer | **PASSED** | backup status returned: Success |
| **TC-NG-01** | Negative | SQL lock | 2026-06-11 | S. Sameer | **PASSED** | Delete SQL database blocked |
| **TC-NG-02** | Negative | secrets | 2026-06-11 | S. Sameer | **PASSED** | SecretGet query returned 403 |
| **TC-NG-03** | Negative | checksums | 2026-06-11 | S. Sameer | **PASSED** | Script logged MD5 mismatch |
| **TC-NG-04** | Negative | region policy | 2026-06-11 | S. Sameer | **PASSED** | Central India deploy denied |
| **TC-NG-05** | Negative | PIM check | 2026-06-11 | S. Sameer | **PASSED** | Unauthorized PIM action denied |
| **TC-NG-06** | Negative | storage public | 2026-06-11 | S. Sameer | **PASSED** | Public storage block enforced |
| **TC-NG-07** | Negative | purge protect | 2026-06-11 | S. Sameer | **PASSED** | Purge keyvault attempt denied |
| **TC-NG-08** | Negative | core quotas | 2026-06-11 | S. Sameer | **PASSED** | G-Series VM deploy blocked |
| **TC-NG-09** | Negative | MFA check | 2026-06-11 | S. Sameer | **PASSED** | Access denied without MFA token |
| **TC-NG-10** | Negative | lock removal | 2026-06-11 | S. Sameer | **PASSED** | Non-owner lock delete blocked |
| **TC-SE-01** | Security | MFA | 2026-06-11 | S. Sameer | **PASSED** | CA policy required MFA |
| **TC-SE-02** | Security | PIM | 2026-06-11 | S. Sameer | **PASSED** | Justification required active |
| **TC-SE-03** | Security | retention | 2026-06-11 | S. Sameer | **PASSED** | retention verified: 365 Days |
| **TC-SE-04** | Security | KV CMK | 2026-06-11 | S. Sameer | **PASSED** | HSM keys active in Singapore |
| **TC-SE-05** | Security | role expiry | 2026-06-11 | S. Sameer | **PASSED** | PIM role automatically expired |
| **TC-SE-06** | Security | secure transfer | 2026-06-11 | S. Sameer | **PASSED** | HTTP calls redirected to HTTPS |
| **TC-SE-07** | Security | NSG blocks | 2026-06-11 | S. Sameer | **PASSED** | Public inbound scan blocked |
| **TC-SE-08** | Security | least privilege | 2026-06-11 | S. Sameer | **PASSED** | Reader role storage creation blocked |
| **TC-SE-09** | Security | Sentinel | 2026-06-11 | S. Sameer | **PASSED** | Sentinel KV access incident fired |
| **TC-SE-10** | Security | PIM audit | 2026-06-11 | S. Sameer | **PASSED** | Elevation history event logged |
| **TC-BK-01** | Backup | weekly backup | 2026-06-11 | S. Sameer | **PASSED** | Weekly schedule set to Sundays |
| **TC-BK-02** | Backup | RSV GRS | 2026-06-11 | S. Sameer | **PASSED** | vault properties set to GRS |
| **TC-BK-03** | Backup | CRR check | 2026-06-11 | S. Sameer | **PASSED** | Cross-Region Restore enabled |
| **TC-BK-04** | Backup | daily logs | 2026-06-11 | S. Sameer | **PASSED** | Daily incremental backup active |
| **TC-BK-05** | Backup | soft delete | 2026-06-11 | S. Sameer | **PASSED** | RSV soft delete hold set to 14 days |
| **TC-BK-06** | Backup | script dryrun | 2026-06-11 | S. Sameer | **PASSED** | validate-backup.ps1 success |
| **TC-BK-07** | Backup | isolated subnet | 2026-06-11 | S. Sameer | **PASSED** | Sandbox subnet isolated from WAN |
| **TC-BK-08** | Backup | audit exports | 2026-06-11 | S. Sameer | **PASSED** | JSON logs exported successfully |
| **TC-BK-09** | Backup | SQL check | 2026-06-11 | S. Sameer | **PASSED** | consistency check returned zero errors |
| **TC-BK-10** | Backup | error logging | 2026-06-11 | S. Sameer | **PASSED** | Failure events logged in Monitor |
| **TC-MN-01** | Monitoring | tuned alerts | 2026-06-11 | S. Sameer | **PASSED** | Single network drop ignored |
| **TC-MN-02** | Monitoring | high CPU | 2026-06-11 | S. Sameer | **PASSED** | Warning sent to DBA group on spike |
| **TC-MN-03** | Monitoring | 80% budget | 2026-06-11 | S. Sameer | **PASSED** | Warning cost email sent |
| **TC-MN-04** | Monitoring | 90% budget | 2026-06-11 | S. Sameer | **PASSED** | ServiceNow P2 ticket created |
| **TC-MN-05** | Monitoring | severity route | 2026-06-11 | S. Sameer | **PASSED** | PagerDuty voice calls verified |
| **TC-MN-06** | Monitoring | disk space | 2026-06-11 | S. Sameer | **PASSED** | Warning sent on disk space >90% |
| **TC-MN-07** | Monitoring | KV near expiry | 2026-06-11 | S. Sameer | **PASSED** | Certificate expiry warning sent |
| **TC-MN-08** | Monitoring | availability | 2026-06-11 | S. Sameer | **PASSED** | VM offline simulation alert fired |
| **TC-MN-09** | Monitoring | daily caps | 2026-06-11 | S. Sameer | **PASSED** | Workspace ingestion capped at 0.5 GB |
| **TC-MN-10** | Monitoring | gateway drops | 2026-06-11 | S. Sameer | **PASSED** | Gateway drop alert fired instantly |

---

## 📝 Verification Metrics
- **Tests Configured**: 50  
- **Passed**: 50  
- **Failed**: 0  
- **Pass Rate**: 100%
