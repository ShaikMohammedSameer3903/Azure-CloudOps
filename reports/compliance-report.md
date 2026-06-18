# Regulatory Compliance Report

This report assesses the landing zone's compliance against HIPAA regulatory standards.

---

## 📊 1. Regulatory Compliance Scorecard

* **Overall Compliance Score**: 100% (Passed all controls)
* **Target Security Framework**: HIPAA Security Rule & HITRUST CSF

---

## 🔍 2. Core Security Controls Assessment

| Control ID | Control Category | Implementation Details | Validation Status |
| :--- | :--- | :--- | :--- |
| **HIPAA-1** | **Transmission Security**| VNet routing blocks public internet inbound queries. Data transit is encrypted using TLS 1.3. | **COMPLIANT** |
| **HIPAA-2** | **Access Control** | PIM roles govern administrative tasks. FIDO2 MFA is required for role activation. | **COMPLIANT** |
| **HIPAA-3** | **Audit Controls** | Key Vault logs are streamed to Log Analytics Workspace with a 365-day retention period. | **COMPLIANT** |
| **HIPAA-4** | **Data Integrity** | `validate-backup.ps1` runs daily restore tests in a sandbox and verifies MD5 checksum hashes. | **COMPLIANT** |
| **HIPAA-5** | **Disaster Recovery** | Recovery Services Vault is configured with GRS and Cross-Region Restore. | **COMPLIANT** |
