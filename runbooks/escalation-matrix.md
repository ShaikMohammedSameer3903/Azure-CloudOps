# Support Escalation Matrix

This document defines the escalation channels, support tiers, contact groups, and target response SLA schedules.

---

## 📈 Support Tier Escalations

| Tier Level | Operations Focus Area | Assigned Team / Group | Target Response SLA | Communication Channel |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | Initial alert monitoring, triage, and ticket classification | Operations Center (NOC) | 15 Minutes | Slack / Teams Alerts |
| **Tier 2** | Database backups, compute health, and lock management | Database Administrators (DBA) | 1 Hour | PagerDuty voice / P1 ticket |
| **Tier 3** | Security boundaries, firewall rules, PIM elevations | Security Operations (SOC) | 30 Minutes | MS Defender Alerts / P1 Pager |
| **Tier 4** | Subnet routing, ExpressRoute drops, VPN tunnels | Network Engineers | 1 Hour | Telco escalation hotlines |

---

## ⚙️ Escalation Guidelines
- If a P1 alert is not resolved within 30 minutes by the Tier 2 team, it automatically escalates to the Infrastructure Architect.
- Weekly meetings review active tickets and update alert threshold rules.
