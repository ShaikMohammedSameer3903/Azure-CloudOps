# Dashboard Trace Matrix

This matrix maps each dashboard value and widget through its complete execution chain.

| Dashboard Value / Widget | Cloud Provider API | Official SDK | Backend Service | Database Persistence | Authenticated REST API | Frontend Component | Rendered UI | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Azure Subscriptions Count** | Azure Resource Manager | `@azure/arm-resources` | `azureCredentialManager.js` | `azure_subscriptions` table | `GET /api/cloud-accounts` | `DashboardHome.tsx` | `{azureStats.accounts}` | **VERIFIED** |
| **AWS Cloud Accounts Count** | AWS STS (Caller Identity) | `@aws-sdk/client-sts` | `auth.js` (AWS Login handler) | `cloud_accounts` table | `GET /api/cloud-accounts` | `DashboardHome.tsx` | `{awsStats.accounts}` | **VERIFIED** |
| **Azure Discovered Resources** | Resource Groups / ARM | `@azure/arm-resources` | `discoveryEngine.js` | `resources` table (`provider = 'azure'`) | `GET /api/resources` | `AzureResources.tsx` | Resource table rows | **VERIFIED** |
| **AWS Discovered Resources** | AWS Resource Groups Tagging API | `@aws-sdk/client-resource-groups-tagging-api` | `discoveryEngine.js` | `resources` table (`provider = 'aws'`) | `GET /api/resources` | `AwsDashboard.tsx` | Resource table rows | **VERIFIED** |
| **Unified Cost Spend** | Consumption / Cost Explorer | `@azure/arm-consumption` & `@aws-sdk/client-cost-explorer` | `monitoringService.js` (Azure) & `awsCostService.js` (AWS) | In-memory cache (`cacheService.js`) or direct telemetry | `GET /api/monitoring/cost/unified` | `DashboardHome.tsx` / `CostDashboard.tsx` | `{azureStats.spend}` / `{awsStats.spend}` | **VERIFIED** |
| **Defender Secure Score** | Azure Defender (Secure Scores) | `@azure/arm-security` | `defenderService.js` | Direct token verification + cache | `GET /api/monitoring/security/unified` | `AzureSecurity.tsx` | `GaugeMeter` (secure score %) | **VERIFIED** |
| **Risk Safety Score** | CloudOps Security Risk Policies | Custom Engine | `riskEngine.js` | `resources` table (`risk_score` metadata) | `GET /api/monitoring/risk` | `AzureSecurity.tsx` | `GaugeMeter` (risk safety %) | **VERIFIED** |
| **Active Alerts count** | Defender Alerts / CloudWatch Alarms | `@azure/arm-security` & `@aws-sdk/client-cloudwatch` | `defenderService.js` & `monitoringService.js` | SQLite audit logs + provider query | `GET /api/monitoring/security/unified` | `DashboardHome.tsx` | `{azureStats.alerts}` / `{awsStats.alerts}` | **VERIFIED** |

## Zero Fabrication Policy Enforcement

If any connection fails or credentials are not configured, the application returns a clear HTTP status error (e.g., `503 Service Unavailable` with `AZURE_NOT_CONFIGURED` or `awsError` details). The frontend component gracefully handles this, displays a clear error state (e.g., "Azure Discovery Restricted" or "Not Configured"), and does not display fabricated fallback numbers.
