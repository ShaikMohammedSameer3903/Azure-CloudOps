# Production Readiness Checklist

This document details the checklist parameters to confirm operational readiness before routing live patient traffic.

---

## 📋 Operational Readiness Checklist

| Section | Checkpoint Item | Target Status | Validation Command / Method |
| :--- | :--- | :--- | :--- |
| **Backup** | RSV Geo-Redundancy GRS active | **PASSED** | Verify properties redundancy configurations |
| **Backup** | `validate-backup.ps1` returns success | **PASSED** | Check local terminal audit logs output |
| **Security** | PIM active for all administrators | **PASSED** | Query active Entra PIM role elevations |
| **Security** | FIDO2 hardware MFA required | **PASSED** | Review active Conditional Access rules |
| **Security** | Diagnostics logs set to 365 days | **PASSED** | Check workspaces retention parameters |
| **Governance**| Azure policies return 100% compliance | **PASSED** | Query active subscription policy states |
| **Governance**| delete locks active on DB group | **PASSED** | Verify locks are applied |
| **Cost** | Cost budget limits active at $1,500 | **PASSED** | Verify active consumption budgets |
| **Operations**| Support runbooks deployed | **PASSED** | Verify runbook files are present |
| **Operations**| Viva exam prep completed | **PASSED** | Review viva prep question bank |
