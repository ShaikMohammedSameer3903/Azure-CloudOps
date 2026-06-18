# Resource Teardown and Rebuild Guide

Yes! You can delete your Azure resources and recreate/re-deploy them later. Because the infrastructure is fully defined as Infrastructure as Code (IaC) using Bicep templates, you can spin up the identical environment whenever you need it.

However, you must be aware of several critical risks, limitations, and "gotchas" before doing so—especially regarding **data loss** and **soft-delete resource name conflicts**.

---

## ⚠️ Critical Risks and Considerations

### 1. Permanent Data Loss
Deleting the resources will permanently destroy all underlying data unless backups are stored externally:
* **Recovery Services Vault (`rsv-hc-prod-backup`)**: All historical backup snapshots of your databases/virtual machines will be deleted.
* **Log Analytics Workspace (`law-hc-prod-logs`)**: All system diagnostic logs and historical HIPAA compliance audit trails will be permanently lost.
* **Application Insights (`ai-hc-prod`)**: Active tracing, performance metrics, and telemetry will be deleted.
* **Key Vault (`kv-hc-prod-secrets`)**: Active secrets, keys, and certificates will be deleted (though they can be recovered from the soft-deleted state if restored within 90 days).

### 2. The Key Vault & Purge Protection Conflict (The Big Gotcha)
In [main.bicep](file:///d:/Azure_project/iac/main.bicep#L59-L61), the Key Vault is configured with:
* `enableSoftDelete: true` (retained for 90 days)
* `enablePurgeProtection: true`

**Why this matters**: Because Purge Protection is enabled, you **cannot** permanently purge/delete the Key Vault name to clear it immediately. If you delete the Key Vault or its resource group and then immediately try to run the deployment script, the deployment will **fail** with a `Conflict` or `VaultAlreadyExists` error. Azure reserves the Key Vault name for 90 days in a soft-deleted state.

**How to resolve**: You must run a CLI command to **recover** the soft-deleted Key Vault *prior* to running the Bicep deployment script.

### 3. The Log Analytics Workspace Soft-Delete Conflict
Log Analytics Workspaces are also soft-deleted by Azure for 14 days by default. If you delete the workspace, you will face similar conflict errors upon redeployment unless you either:
* **Recover** the existing workspace before deploying, OR
* **Force-delete** (purge) the workspace to immediately release the name.

---

## 🛠️ Step 1: Teardown (Deletion) Procedure

To clean up all resources and avoid continuous Azure billing:

### Option A: Delete the Entire Resource Group (Recommended)
This is the simplest way to delete all resources (Web App, Static Web App, App Insights, Key Vault, RSV, LAW) in a single operation.

Run the following command using Azure CLI:
```powershell
# Set variables
$ResourceGroup = "RG-Healthcare-Prod"

# Delete the resource group and all contained resources (this may take 10-15 minutes)
az group delete --name $ResourceGroup --yes --no-wait
```

### Option B: Delete Individual Resources
If you want to keep the Resource Group shell but delete the resources inside:
```powershell
$ResourceGroup = "RG-Healthcare-Prod"

# Delete the App Service & Static Web App
az resource delete --resource-group $ResourceGroup --name app-hc-prod-backend --resource-type "Microsoft.Web/sites"
az resource delete --resource-group $ResourceGroup --name swa-hc-prod-frontend --resource-type "Microsoft.Web/staticSites"

# Delete Key Vault
az keyvault delete --name kv-hc-prod-secrets --resource-group $ResourceGroup

# Delete Recovery Services Vault
az backup vault delete --name rsv-hc-prod-backup --resource-group $ResourceGroup --yes

# Delete Log Analytics Workspace
az monitor log-analytics workspace delete --resource-group $ResourceGroup --workspace-name law-hc-prod-logs --yes
```

---

## 🚀 Step 2: Rebuild (Restoration) Procedure

When you are ready to bring the environment back online, follow these steps in order:

### 1. Authenticate and Target Subscription
```powershell
az login
az account set --subscription "sub-hc-prod-01"
```

### 2. Create the Resource Group (If Deleted)
```powershell
$ResourceGroup = "RG-Healthcare-Prod"
$Location = "southeastasia"

az group create `
  --name $ResourceGroup `
  --location $Location `
  --tags Environment=Production HIPAA=True Project=HealthcareReady
```

### 3. Recover Soft-Deleted Resources (CRITICAL STEP)
Before running Bicep, you must recover the soft-deleted Key Vault and Log Analytics Workspace to avoid name conflicts.

```powershell
# Recover the Key Vault (Must match original name and region)
az keyvault recover `
  --name kv-hc-prod-secrets `
  --resource-group $ResourceGroup `
  --location $Location

# Recover the Log Analytics Workspace (If you want to restore it)
az monitor log-analytics workspace recover `
  --workspace-name law-hc-prod-logs `
  --resource-group $ResourceGroup `
  --location $Location
```
> [!NOTE]
> If you do not want to recover the old Log Analytics Workspace and want a fresh one, you must instead force-delete the old one using `az monitor log-analytics workspace delete --resource-group $ResourceGroup --workspace-name law-hc-prod-logs --force true` before running the deployment script.

### 4. Deploy Infrastructure via Bicep
Run the pre-configured deployment script to recreate the infrastructure, networking, and role assignments:
```powershell
.\scripts\deploy-resources.ps1
```
*(This script runs `az deployment group create` using [main.bicep](file:///d:/Azure_project/iac/main.bicep) and [deployment.bicep](file:///d:/Azure_project/iac/deployment.bicep).)*

### 5. Re-populate Key Vault Secrets
Because the infrastructure has been redeployed or recovered, ensure any required secrets (such as connection strings or API keys) are re-added to the Key Vault:
```powershell
$SecretValue = ConvertTo-SecureString "YourDatabaseConnectionString" -AsPlainText -Force
Set-AzKeyVaultSecret -VaultName kv-hc-prod-secrets -Name "db-connection-string" -SecretValue $SecretValue
```

### 6. Re-deploy Application Code
Redeploy your backend code to the App Service and frontend assets to the Static Web App:
```powershell
# Deploy frontend & backend bundle packages
node .\scripts\zip-and-deploy.cjs
```
