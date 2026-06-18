# Azure Healthcare Access Review Audit Report

This report documents the review of administrative and privileged accounts to satisfy regulatory HIPAA audit guidelines.

---

## 🔐 1. Active Role Assignee Audit Log

All administrative access requires PIM activation and manager approvals:

| Principal Identity / Email | Deployed Role | Approval Instance | Duration | Justification | Auditor Review Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **sarah.connor@healthcorp.com**| User Access Admin | `m.sameer@healthcorp.com` | 4 Hours | Semi-annual privilege check and security credential rotation | **APPROVED (Valid)** |
| **john.doe@healthcorp.com** | Backup Contributor | Auto-Approved (System Policy)| 2 Hours | Restore verification test on `PatientRecordsDB` recovery vaults | **APPROVED (Valid)** |
| **alex.smith@healthcorp.com** | Key Vault Admin | `m.sameer@healthcorp.com` | 1 Hour | Emergency SSL certificate rotation on patient-facing ingress gateways | **APPROVED (Valid)** |
| **jane.miller@healthcorp.com** | Security Admin | `m.sameer@healthcorp.com` | 6 Hours | Sentinel diagnostic query tuning and log validation runs | **APPROVED (Valid)** |
| **external.consultant@healthcorp.com**| Reader | `m.sameer@healthcorp.com` | 8 Hours | Annual landing zone security configurations review (Compliance audit) | **REVOKED (Expired)** |

---

## 📋 2. Compliance Summary & Access Hygiene Checklists

1. **[x] Principle of Least Privilege (PoLP)**: Standard users hold zero direct permanent permissions; all administrative roles require PIM elevations.
2. **[x] Audit Log Preservation**: Access reviews, justifications, and approvals are exported and stored in the Log Analytics workspace (`law-hc-prod-logs`) with write-once-read-many (WORM) configurations active.
3. **[x] Access Eviction Polling**: Standard users who fail to activate their PIM roles over a 90-day window are flagged by automated pipelines for account suspension.
4. **[x] Multi-Factor Authentication**: 100% of administrators use hardware-based MFA (FIDO2 keys) for PIM activations.
