# Release Plan

This release plan details deployment phases, validation checkpoints, and the hypercare support schedule for the rollout of the **Azure Healthcare Cloud Landing Zone**.

---

## 📅 1. Rollout Deployment Schedule

| Time (EST) | Phase / Activity | Primary Assigned Team | Output Deliverable |
| :--- | :--- | :--- | :--- |
| **20:00 - 20:30** | Maintenance window start; configure locks | IAM / Identity Lead | PIM access restrictions active |
| **20:30 - 21:00** | Infrastructure Deployment (Bicep IaC) | DevOps Lead | Key Vault, RSV, LAW resources deployed |
| **21:00 - 21:30** | Apply Custom Azure Governance Policies | Governance Team | Policies active subscription scope |
| **21:30 - 22:30** | Post-Deployment Validation Window | QA Lead / DB Lead | `validate-backup.ps1` success output |
| **22:30 - 23:00** | Go-Live Decision checkpoint | Release Director | Approval to route patient traffic |
| **23:00 - Onward** | Shift handover to Hypercare team | Operations Lead | Hypercare monitoring active |

---

## 🔍 2. Go-Live Checkpoints

Before routing patient database queries, the following metrics must pass:
1. **[ ] Policy Check**: Azure Policy portal must show **100% compliance** with zero exception warnings.
2. **[ ] Backup Check**: Automated backup validation runs successfully inside the restore subnet.
3. **[ ] Metric Alert Checks**: Tuned alert rules deploy successfully.
4. **[ ] Lock Check**: `CanNotDelete` lock active on database resource groups.
5. **[ ] Access Check**: Standard admin roles are deactivated, requiring PIM activation to access resources.

---

## 🔄 3. Rollback Checklist (Emergency Exit)

Trigger rollback if any checkpoint fails:
1. **[ ] De-route Traffic**: Redirect network routes back to the on-premise system.
2. **[ ] Unlock Resource Groups**: Remove `CanNotDelete` locks:
   ```bash
   az lock delete --name "rg-delete-lock" --resource-group "RG-Healthcare-Prod"
   ```
3. **[ ] Purge Deployed Assets**: Run resource group cleanup scripts.
4. **[ ] Reset Active Tokens**: Terminate all active administrative sessions.
5. **[ ] Verify Status**: Confirm secondary regions display zero active resources.
