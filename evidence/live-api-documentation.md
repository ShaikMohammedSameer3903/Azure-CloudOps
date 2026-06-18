# Live Dashboard API Documentation

This guide describes the Express backend endpoints configured for the live **Azure Healthcare Operations Dashboard**. The backend listens on `http://localhost:3001` and bridges frontend queries to Azure Resource Manager.

---

## 🚀 Base URL
```
http://localhost:3001
```

---

## 📡 Endpoints

### 1. GET `/api/resources`
* **Description**: Lists all active resources provisioned inside the `RG-Healthcare-Prod` resource group.
* **Backend Command**: `az resource list --resource-group RG-Healthcare-Prod`
* **Response Status**: `200 OK`
* **Response Payload Example**:
```json
[
  {
    "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.RecoveryServices/vaults/rsv-hc-prod-backup",
    "name": "rsv-hc-prod-backup",
    "type": "Microsoft.RecoveryServices/vaults",
    "location": "southeastasia",
    "provisioningState": "Succeeded"
  },
  {
    "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.KeyVault/vaults/kv-hc-prod-secrets",
    "name": "kv-hc-prod-secrets",
    "type": "Microsoft.KeyVault/vaults",
    "location": "southeastasia",
    "provisioningState": "Succeeded"
  }
]
```

---

### 2. GET `/api/alerts`
* **Description**: Retrieves active Azure Monitor alert rules configured in the landing zone resource group.
* **Backend Command**: `az monitor metric-alerts list --resource-group RG-Healthcare-Prod`
* **Response Status**: `200 OK`
* **Response Payload Example**:
```json
[
  {
    "name": "alert-hc-kv-availability",
    "enabled": true,
    "severity": 1,
    "scopes": [
      "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.KeyVault/vaults/kv-hc-prod-secrets"
    ]
  }
]
```

---

### 3. GET `/api/backups`
* **Description**: Queries backup jobs history and status on the Recovery Services Vault.
* **Backend Command**: `az backup job list --g RG-Healthcare-Prod --v rsv-hc-prod-backup`
* **Response Status**: `200 OK`
* **Response Payload Example**:
```json
[
  {
    "entityFriendlyName": "PatientRecordsDB",
    "backupManagementType": "AzureWorkload",
    "operation": "Backup",
    "status": "Completed",
    "startTime": "2026-06-11T06:53:51Z"
  }
]
```

---

### 4. GET `/api/costs`
* **Description**: Formulates dynamic live cost breakdowns based on active resource classes and sizing.
* **Response Status**: `200 OK`
* **Response Payload Example**:
```json
[
  {
    "resourceName": "law-hc-prod-logs",
    "resourceGroup": "RG-Healthcare-Prod",
    "serviceType": "Log Analytics Workspace",
    "monthlyCost": 650.00,
    "budgetLimit": 800.00,
    "tags": {}
  }
]
```

---

### 5. GET `/api/policies`
* **Description**: Resolves custom policy assignments and overall compliance rates.
* **Backend Command**: `az policy assignment list --scope /subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod`
* **Response Status**: `200 OK`
* **Response Payload Example**:
```json
{
  "compliancePercentage": 100,
  "activeAssignments": [
    {
      "policyAssignmentName": "enforce-resource-locks",
      "displayName": "Enforce Resource Locks on Production Resource Groups",
      "scope": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod",
      "enforcementMode": "Default"
    }
  ]
}
```
