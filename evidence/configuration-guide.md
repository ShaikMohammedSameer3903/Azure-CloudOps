# Azure Healthcare Platform Configuration Guide

This guide details the configurations applied to the **Azure Healthcare Cloud Landing Zone** to maintain HIPAA audit readiness and high-availability operations.

---

## 🔐 1. RBAC & MFA Configuration

To enforce access hygiene, all administrative roles are governed by Microsoft Entra ID Privileged Identity Management (PIM) and require Multi-Factor Authentication (MFA).

### Role Assignment Matrix
| Role Name | Entra Group Name | Scope | PIM Duration | MFA Required |
| :--- | :--- | :--- | :--- | :--- |
| **Backup Contributor** | `sg-hc-ops-backup-admin` | RSV Scope | Max 4 Hours | **YES (FIDO2)** |
| **User Access Administrator**| `sg-hc-sec-access-admin` | Sub Resource Group | Max 2 Hours | **YES (MFA + Justify)** |
| **Key Vault Administrator** | `sg-hc-sec-kv-admin` | KV Scope | Max 1 Hour | **YES (FIDO2)** |
| **Security Admin** | `sg-hc-sec-soc-analyst` | Log Analytics / Sentinel | Max 8 Hours | **YES (Standard MFA)**|

---

## 🛡️ 2. Azure Policy & Resource Locks

### Active Custom Policies
* **Backup Enforcement**: Configured via `backup-policy.json`. Mandates that any Virtual Machine deployed within a production-tagged Resource Group is automatically registered with a Recovery Services backup policy.
* **Accidental Deletion Lock**: Enforced via resource locks. Any production database group must have a `CanNotDelete` lock applied.

```powershell
# Assign the backup policy to the Production Subscription
$Scope = "/subscriptions/sub-hc-prod-01"
az policy assignment create `
  --name "enforce-vm-backup" `
  --policy "enforce-backup-for-vms" `
  --scope $Scope `
  --params "{'backupPolicyId': {'value': '/subscriptions/sub-hc-prod-01/resourceGroups/rg-hc-database/providers/Microsoft.RecoveryServices/vaults/vault-prod-backups/backupPolicies/default'}}"
```

---

## 💾 3. Backup Configuration

Critical medical data workloads require high retention schedules to support disaster recovery scenarios:

| Parameter | Configuration Setting | Rationale |
| :--- | :--- | :--- |
| **Backup Type** | Full Backup (Weekly) + Incremental (Daily) | Optimizes performance and replication costs |
| **Cross-Region Restore**| Enabled (Secondary Region: West US 2) | HIPAA disaster recovery standards |
| **Retention Policy** | Weekly: 52 weeks, Monthly: 60 months | Complies with legal records auditing retention |
| **Soft Delete State** | Enabled (14-day hold period) | Prevents insider threats or accidental purge |

---

## 📈 4. Tuned Monitor & Alerts Configuration

To resolve alert fatigue, Metric Alerts are configured with dynamic window sizes and evaluation thresholds:

```yaml
AlertRuleName: alert-hc-backup-failures
MetricScope: Recovery Services Vault (rsv-hc-prod-backup)
MetricName: BackupFailureCount
Severity: 1 (Critical)
EvaluationFrequency: PT15M (Every 15 minutes)
WindowSize: PT1H (1-hour sliding scale)
Threshold: 2 (Alert triggers only on >=2 consecutive failures)
ActionGroup: ag-hc-ops-pagerduty
```

---

## 💰 5. Cost Management & Budgets

```json
{
  "budgetName": "Production-Base-Budget",
  "amount": 2500.00,
  "timeGrain": "Monthly",
  "thresholds": [
    { "percentage": 80.0, "contactEmails": ["ops-alerts@healthcorp.com"], "action": "Email Alert" },
    { "percentage": 90.0, "contactEmails": ["m.sameer@healthcorp.com"], "action": "P1 Incident Ticket Trigger" }
  ]
}
```
