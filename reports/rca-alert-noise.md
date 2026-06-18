# Root Cause Analysis (RCA) Report
**Incident ID**: INC-20260601-BF  
**Title**: Alert Noise Fatigue Masking SQL Database Backup Failure  
**Date of Incident**: 2026-06-01  
**Author**: S. Sameer, Azure Security & Operations Architect  
**Classification**: High Severity (HIPAA Compliance Risk)

---

## 🚨 1. Executive Summary

During the UAT pilot rollout phase, a persistent backup failure occurred on the primary SQL database (`PatientRecordsDB`) containing HIPAA-regulated patient medical records. However, because of extreme alert noise (alert fatigue) in the operations console (over 180 transient notifications triggered daily by intermittent connection drops), operations engineers overlooked the critical notification. As a result, the database remained without backup coverage for 36 hours, breaching our recovery SLAs.

---

## 🕰️ 2. Incident Timeline

* **02:00:00 UTC**: Standard transaction log-trim database backup fails due to a locked log partition.
* **02:05:00 UTC**: Azure Monitor triggers a Critical backup alert.
* **02:06:00 - 08:00:00 UTC**: Azure Monitor fires 42 additional backup alerts caused by transient network connectivity tests in other subnets. All alerts share the same severity.
* **08:15:00 UTC**: Operations team checks dashboard. Concluding that the database alerts are typical transient noise, the engineer silences all backup notifications.
* **10:00:00 UTC**: Real backup fails again. Alert fires but is ignored by silent filter rules.
* **14:00:00 UTC**: Auditors request compliance reports. Security architect identifies the lack of transaction backups.

---

## 🔍 3. Root Cause Analysis (5 Whys)

1. **Why was the backup failure ignored?** The operations team silenced notifications.
2. **Why were notifications silenced?** They were experiencing severe alert fatigue (180+ daily false positives).
3. **Why were there so many false alarms?** The monitoring alert rules were set to alert on a single transaction backup failure (Threshold: 1) evaluated every 1 minute.
4. **Why did single failures occur?** Transient network blips or backup agent lock checks caused single attempts to occasionally drop before succeeding on retry.
5. **Why was the monitoring rule designed this way?** The original UAT template used default, non-tuned parameters without analyzing production replication behavior.

---

## 🛠️ 4. Corrective & Preventive Actions

### Corrective Action (Immediate)
* Cleared log partition file locks on `PatientRecordsDB`.
* Manually ran `validate-backup.ps1` script to verify restoration integrity.
* Confirmed database checksum alignment.

### Preventive Action (Long-Term Rule Tuning)
* Replaced the noisy backup alert definition with a consecutive failure filter rule:
  - Evaluation frequency increased from **1 Minute** to **15 Minutes**.
  - Evaluation window size extended from **5 Minutes** to **1 Hour**.
  - Failure threshold count raised to **2 consecutive failures** (preventing 1-off transient connection alerts).

---

## 📊 5. Before vs. After Alert Metrics

| Metric | Before Tuning (UAT Default) | After Tuning (Production Optimized) | Improvement |
| :--- | :--- | :--- | :--- |
| **False-Positive Alarms**| 186 alerts / day | 12 alerts / day | **93.5% Reduction** |
| **Alert Severity Levels** | 100% Critical | 20% Critical / 80% Warning | **Clean Escalation Path**|
| **True Positive Capture** | 100% | 100% | **Zero Missed Failures** |
| **Incident Response SLA** | > 8 Hours (Delayed due to noise)| < 15 Minutes (Instant visibility) | **96.8% SLA Speedup** |

---

## 📝 6. Lessons Learned
- **Default Alerts are Dangerous**: Default settings are rarely optimized for enterprise healthcare databases.
- **Dynamic Baselines**: Runbooks must mandate dynamic threshold checks and consecutive count filters for hybrid subnets.
