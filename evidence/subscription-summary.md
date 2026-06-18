# Azure Student Subscription Summary

This document summarizes the quotas, limits, credit limits, and regional constraints of the active Azure subscription.

---

## 💳 1. Credit & Billing Summary
* **Subscription Name**: Azure for Students
* **Subscription ID**: `d10be971-c619-4887-8737-b8054407194e`
* **Default Credit Balance**: $100.00 USD (Annual allocation)
* **Billing Cycle**: Monthly usage tracking (Credit resets annually on renewal date)

---

## 🛑 2. Subscription Restrictions & Limits

### Regional Policy Constraint
The subscription enforces policy `sys.regionrestriction`, blocking deployments in regions outside the following:
- `southeastasia` (Singapore) - **Target Deployment Region**
- `uaenorth` (UAE North)
- `eastasia` (Hong Kong)
- `koreacentral` (Seoul)
- `austriaeast` (Austria)

### Quota Caps
- **Maximum Cores**: 4 Cores per VM family limit.
- **Maximum Resource Groups**: 15 active groups.
- **Allowed VM Families**: Restricted to B-Series and D-Series compute.
- **Support Plan**: Free basic support only; no paid SLA technical tickets available.
