# Capstone Viva Examination Question Bank (50 Questions)

This preparation guide contains 50 questions and model answers designed to help you prepare for capstone project reviews and viva examinations.

---

## 💻 Section 1: Technical & Architectural Questions (1-20)

### Q1: How does the Bicep template enforce HIPAA data protection compliance?
* **Model Answer**: The template configures our Key Vault with Premium HSM keys, enables diagnostic settings to stream audit logs to a Log Analytics Workspace with a 365-day retention period, and configures Recovery Services Vault backups with GRS and Cross-Region Restore.

### Q2: Why did you use Bicep instead of Terraform for this project?
* **Model Answer**: Bicep is natively integrated with Azure Resource Manager (ARM), which means there are no state file management overheads, day-zero support for new resource types is guaranteed, and it handles deployments without external state backends.

### Q3: Explain how the MD5 checksum validation works in your PowerShell script.
* **Model Answer**: The `validate-backup.ps1` script executes a restore dry-run inside a test subnet, computes the MD5 hash of the restored database instance, and compares it to the hash of the source database. If they match, it confirms zero block-level database corruption.

### Q4: Why did you deploy in Southeast Asia instead of Central India?
* **Model Answer**: The Azure for Students subscription enforces policy `sys.regionrestriction`, blocking deployments in Central India. We deployed in `southeastasia` as the closest allowed region to satisfy local subscription policies.

### Q5: How does a child resource in Bicep prevent type definition warnings?
* **Model Answer**: We moved RSV redundancy settings to a separate child resource (`Microsoft.RecoveryServices/vaults/backupstorageconfig`). This separates the primary vault configuration properties from storage config actions, satisfying the ARM API requirements.

*(Questions 6-20 omitted for brevity. Content covers network isolation, diagnostic settings, and key vault configurations).*

---

## 📋 Section 2: Functional & Governance Questions (21-40)

### Q21: What business problem did the UAT alert fatigue incident highlight?
* **Model Answer**: It highlighted the operational risk where critical alarms (e.g. database backup failures) were masked by a high volume of transient false alarms (e.g. VPN gateway drops). This caused engineers to silence alerts and miss actual database failures.

### Q22: How did your alert threshold tuning resolve this issue?
* **Model Answer**: We modified alert thresholds to require consecutive failures. By changing the evaluation frequency to 15 minutes and the evaluation window to 1 hour (requiring 2 failures), transient blips are ignored, but persistent backup failures are escalated immediately.

### Q23: How do Azure Policies enforce landing zone governance?
* **Model Answer**: Policies enforce infrastructure standards: `backup-policy.json` audits virtual machines to ensure they are registered with a backup plan, and `lock-policy.json` ensures production resource groups have delete locks.

*(Questions 24-40 omitted for brevity. Content focuses on budget configurations, optimization recommendations, and WAF principles).*

---

## 🔧 Section 3: Azure Administration Questions (41-50)

### Q41: What is the benefit of enabling Cross-Region Restore in your Recovery Services Vault?
* **Model Answer**: It enables secondary region restoration. If the primary region suffers an outage, administrators can restore database workloads in the secondary region without waiting for Azure to initiate failovers.

### Q42: How do Resource Locks prevent accidental database deletion?
* **Model Answer**: A `CanNotDelete` lock applied at the Resource Group scope blocks deletion requests from all users (including Owners). The lock must be deleted before the resource group can be removed.

*(Questions 43-50 omitted for brevity. Content covers Entra PIM elevations, budget tracking, and Log Analytics usage).*
