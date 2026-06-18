# Azure Healthcare Platform - Live Data Verification Report

This report presents verification evidence proving that the **Azure Healthcare Platform Dashboard** is successfully integrated with Microsoft Azure in real-time, based on a live resource lifecycle test.

---

## 1. Test Objective
To verify that the dashboard's backend integration server dynamically fetches live Azure resources in real-time, by performing the following operations:
1. Programmatically deploying an ephemeral resource (`temp-audit-ip`) inside the resource group `RG-Healthcare-Prod` via the active subscription.
2. Querying the backend API (`GET /api/resources`) to check if the new resource is returned in the JSON payload immediately.
3. Verifying that the resource details match the live cloud configuration.
4. Cleaning up the subscription by deleting the temporary resource.

---

## 2. Test Execution Details & Logs

### Step 1: Deploying Temporary Resource
We issued a CLI deployment command to provision a Standard Public IP address named `temp-audit-ip` in the `southeastasia` region.

* **Deployment Command**:
  ```powershell
  az network public-ip create --resource-group RG-Healthcare-Prod --name temp-audit-ip --location southeastasia --sku Standard --tier Regional --output json
  ```
* **Azure Provisioning Log Output**:
  ```json
  {
    "publicIp": {
      "ddosSettings": {
        "protectionMode": "VirtualNetworkInherited"
      },
      "etag": "W/\"4d32e4d3-4305-4ee6-960c-f794fe787000\"",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Network/publicIPAddresses/temp-audit-ip",
      "idleTimeoutInMinutes": 4,
      "ipAddress": "20.205.184.199",
      "ipTags": [],
      "location": "southeastasia",
      "name": "temp-audit-ip",
      "provisioningState": "Succeeded",
      "publicIPAddressVersion": "IPv4",
      "publicIPAllocationMethod": "Static",
      "resourceGroup": "RG-Healthcare-Prod",
      "sku": {
        "name": "Standard",
        "tier": "Regional"
      },
      "type": "Microsoft.Network/publicIPAddresses"
    }
  }
  ```

---

### Step 2: Querying the Backend API
Immediately following the provisioning success, we triggered a query to the backend integration API server running on port 3001.

* **API Query Command**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3001/api/resources" -ErrorAction Stop
  ```
* **API Response Payload**:
  ```json
  [
    {
      "changedTime": "2026-06-11T07:01:06.554380+00:00",
      "createdTime": "2026-06-11T06:50:02.873947+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.RecoveryServices/vaults/rsv-hc-prod-backup",
      "location": "southeastasia",
      "name": "rsv-hc-prod-backup",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "sku": { "name": "RS0", "tier": "Standard" },
      "type": "Microsoft.RecoveryServices/vaults"
    },
    {
      "changedTime": "2026-06-11T07:03:47.975485+00:00",
      "createdTime": "2026-06-11T06:50:05.145199+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.OperationalInsights/workspaces/law-hc-prod-logs",
      "location": "southeastasia",
      "name": "law-hc-prod-logs",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "type": "Microsoft.OperationalInsights/workspaces"
    },
    {
      "changedTime": "2026-06-11T07:00:05.670129+00:00",
      "createdTime": "2026-06-11T06:50:05.653948+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.KeyVault/vaults/kv-hc-prod-secrets",
      "location": "southeastasia",
      "name": "kv-hc-prod-secrets",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "type": "Microsoft.KeyVault/vaults"
    },
    {
      "changedTime": "2026-06-11T07:03:27.796095+00:00",
      "createdTime": "2026-06-11T06:53:24.315873+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Insights/metricalerts/alert-hc-kv-latency",
      "location": "global",
      "name": "alert-hc-kv-latency",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "type": "Microsoft.Insights/metricalerts"
    },
    {
      "changedTime": "2026-06-11T07:03:26.577322+00:00",
      "createdTime": "2026-06-11T06:53:24.318881+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Insights/metricalerts/alert-hc-kv-availability",
      "location": "global",
      "name": "alert-hc-kv-availability",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "type": "Microsoft.Insights/metricalerts"
    },
    {
      "changedTime": "2026-06-11T07:41:08.066210+00:00",
      "createdTime": "2026-06-11T07:41:05.478136+00:00",
      "id": "/subscriptions/d10be971-c619-4887-8737-b8054407194e/resourceGroups/RG-Healthcare-Prod/providers/Microsoft.Network/publicIPAddresses/temp-audit-ip",
      "location": "southeastasia",
      "name": "temp-audit-ip",
      "provisioningState": "Succeeded",
      "resourceGroup": "RG-Healthcare-Prod",
      "sku": { "name": "Standard" },
      "type": "Microsoft.Network/publicIPAddresses"
    }
  ]
  ```

---

### Step 3: Deletion & Cleanup
To avoid persistent charges and resource group clutter, the ephemeral public IP was immediately deleted.

* **Cleanup Command**:
  ```powershell
  az network public-ip delete --resource-group RG-Healthcare-Prod --name temp-audit-ip
  ```
* **Result**: Successfully deleted (`exit 0`).

---

## 3. Verdict
* **Test Outcome**: **PASS**
* **Verification Detail**: The dashboard backend dynamically queried the resource list and returned the newly created resource (`temp-audit-ip`) immediately, matching all properties (name, location, type, resource group). This provides definitive proof of live, real-time connectivity between the backend API and the Azure cloud infrastructure.
