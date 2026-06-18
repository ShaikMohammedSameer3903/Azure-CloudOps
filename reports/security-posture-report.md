# Security Posture Report

This report outlines the identity boundaries, access hygiene, and threat protection settings for the healthcare platform.

---

## 🔐 1. Privileged Identity Management (PIM) & RBAC Matrix

To enforce least privilege access, all administrative roles are governed by PIM. Direct permanent admin access is disabled, and activations require manager approval.

| Role Name | Scope | PIM Limit | MFA Method | Justification Requirement |
| :--- | :--- | :--- | :--- | :--- |
| **User Access Administrator**| RG Scope | 2 Hours | FIDO2 Key | Mandatory justification and manager approval |
| **Backup Contributor** | RSV Scope | 4 Hours | FIDO2 Key | Mandatory justification; automatic auditing |
| **Key Vault Administrator** | KV Scope | 1 Hour | FIDO2 Key | Mandatory justification and manager approval |
| **Security Administrator** | Workspace Scope| 8 Hours | standard MFA| Mandatory justification; security logs |

---

## 🛡️ 2. Microsoft Defender for Cloud Regulatory Tracking

The platform is monitored by Microsoft Defender for Cloud to assess compliance against the **HIPAA / HITRUST Regulatory Security Standard**:

1. **Identity & Access**: 100% of administrative accounts require MFA.
2. **Data Encryption**: Key Vault Premium enforces double encryption at rest using Customer-Managed Keys (CMK) with purge protection enabled.
3. **Network Isolation**: Key Vault firewalls block all public network access, restricting access to virtual network service endpoints.
4. **Diagnostic Auditing**: Audit logs are streamed to a Log Analytics Workspace with a 365-day retention period.
