# API Reference

CloudOps Enterprise utilizes a RESTful JSON API. All endpoints (excluding `/api/auth`) require a valid JWT Bearer token representing the active tenant session.

## Core Endpoints

### Authentication
`POST /api/auth/login`
- **Body**: `{ "email": "...", "password": "..." }`
- **Response**: `{ "token": "jwt-token-string", "user": { ... } }`

### Cloud Accounts
`GET /api/cloud-accounts`
- **Description**: Returns all connected cloud accounts for the tenant.
- **Response**: Array of connected accounts (Azure, AWS, GCP).

`POST /api/cloud-accounts/azure`
- **Body**: `{ "subscriptionId": "...", "accountName": "...", "clientId": "...", "clientSecret": "..." }`
- **Description**: Validates and links an Azure subscription to the tenant.

### Resources & Discovery
`GET /api/resources`
- **Description**: Returns the unified list of all discovered resources across all connected clouds.

`POST /api/discovery/trigger`
- **Description**: Manually kicks off an out-of-band discovery sweep for a specific subscription ID.

### Executive Dashboards
`GET /api/monitoring/cost/unified`
- **Description**: Aggregates real-time FinOps data across Azure Cost Management and AWS Cost Explorer.

`GET /api/compliance/posture`
- **Description**: Returns the global security score and active MITRE ATT&CK mapping metrics.

### AI Assistant
`POST /api/ai/chat`
- **Body**: `{ "messages": [{ "role": "user", "content": "How do I fix the open SSH port on EC2?" }], "context": { "resourceId": "..." } }`
- **Description**: Streams back AI-generated remediation advice contextually aware of the specific resource.
