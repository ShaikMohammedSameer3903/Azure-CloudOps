# Azure Healthcare Viva Presentation & Exam Guide

This preparation guide contains questions and model answers designed to help you prepare for capstone project reviews and viva examinations.

---

## 💻 Section 1: Technical Architecture Questions (1-30)

### Q1: How does the Bicep template enforce HIPAA data protection compliance?
* **Model Answer**: The template configures our Key Vault with Premium HSM keys, enables diagnostic settings to stream audit logs to a Log Analytics Workspace with a 365-day retention period, and configures Recovery Services Vault backups with GRS and Cross-Region Restore.

### Q2: Why did you use Bicep instead of Terraform for this project?
* **Model Answer**: Bicep is natively integrated with Azure Resource Manager (ARM), which means there are no state file management overheads, day-zero support for new resource types is guaranteed, and it handles deployments without external state backends.

### Q3: Explain how the MD5 checksum validation works in your PowerShell script.
* **Model Answer**: The `validate-backup.ps1` script executes a restore dry-run inside a test subnet, computes the MD5 hash of the restored database instance, and compares it to the hash of the source database. If they match, it confirms zero block-level database corruption.

### Q4: How are network security group rules configured in your Bicep files?
* **Model Answer**: Rules are scoped to block all public internet inbound traffic. Inbound access is restricted to hybrid on-premise subnets using ExpressRoute gateways, and SQL ports are isolated to the application subnet.

### Q5: How is Log Analytics structured to retain audit data for 1 year?
* **Model Answer**: In the Bicep workspace resource declaration, we set the `retentionInDays` property to `365`. This ensures all diagnostic settings, Key Vault access audits, and activity logs are stored for 1 year to comply with HIPAA guidelines.

*(Questions 6-30 omitted for brevity. Content follows similar professional cloud architecture validation rules).*

---

## 📋 Section 2: Functional & Governance Questions (31-60)

### Q31: What business problem did the UAT alert fatigue incident highlight?
* **Model Answer**: It highlighted the operational risk where critical alarms (e.g. database backup failures) were masked by a high volume of transient false alarms (e.g. VPN gateway drops). This caused engineers to silence alerts and miss actual database failures.

### Q32: How did your alert threshold tuning resolve this issue?
* **Model Answer**: We modified alert thresholds to require consecutive failures. By changing the evaluation frequency to 15 minutes and the evaluation window to 1 hour (requiring 2 failures), transient blips are ignored, but persistent backup failures are escalated immediately.

### Q33: How do Azure Policies enforce landing zone governance?
* **Model Answer**: Policies enforce infrastructure standards: `backup-policy.json` audits virtual machines to ensure they are registered with a backup plan, and `lock-policy.json` ensures production resource groups have delete locks.

*(Questions 34-60 omitted for brevity. Content focuses on Well-Architected Framework operational excellence).*

---

## 🔧 Section 3: Azure Administration Questions (61-80)

### Q61: What is the benefit of enabling Cross-Region Restore in your Recovery Services Vault?
* **Model Answer**: It enables secondary region restoration. If the primary East US 2 region suffers an outage, administrators can restore database workloads in the West US 2 region without waiting for Azure to initiate failovers.

### Q62: How do Resource Locks prevent accidental database deletion?
* **Model Answer**: A `CanNotDelete` lock applied at the Resource Group scope blocks deletion requests from all users (including Owners). The lock must be deleted before the resource group can be removed.

*(Questions 63-80 omitted for brevity. Content covers PIM elevations, budget configurations, and log querying).*
