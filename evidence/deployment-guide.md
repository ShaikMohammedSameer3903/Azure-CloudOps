# Azure Healthcare Platform Deployment Guide

This guide details the step-by-step procedures to provision the **Azure Healthcare Cloud Landing Zone** using Bicep templates, validate the deployment state, and initiate automated rollback if validation fails.

---

## 📋 Pre-deployment Prerequisites

1. **Required Permissions**: Ensure your account holds the `Owner` or `Contributor` role at the Subscription level (or Resource Group level if pre-created).
2. **Az CLI Installation**: Install the latest [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).
3. **Bicep CLI**: Verify Bicep installation:
   ```bash
   az bicep install
   az bicep version
   ```

---

## 🚀 Step 1: Authentication & Scope Definition

Login to the Azure environment and set the target subscription scope:

```powershell
# Authenticate Azure Active Directory account
az login

# Set the active tenant subscription
$SubscriptionId = "sub-hc-prod-01"
az account set --subscription $SubscriptionId

# Register required Azure Resource Providers
az provider register --namespace Microsoft.RecoveryServices
az provider register --namespace Microsoft.KeyVault
az provider register --namespace Microsoft.OperationalInsights
az provider register --namespace Microsoft.Insights
```

---

## 🛠️ Step 2: Create Target Resource Groups

We follow Azure enterprise landing zone naming conventions:

```powershell
# Define variables
$ResourceGroup = "rg-hc-database-prod"
$Location = "eastus2"

# Provision resource group with tags for tagging compliance checks
az group create `
  --name $ResourceGroup `
  --location $Location `
  --tags Environment=Production HIPAA=True Project=HealthcareReady
```

---

## 🚀 Step 3: Deployment Command (Bicep IaC)

Launch the subscription/resource group deployment using [main.bicep](file:///d:/Azure_project/iac/main.bicep):

```powershell
# Run deployment validation check first (dry-run)
az deployment group validate `
  --resource-group $ResourceGroup `
  --template-file iac/main.bicep `
  --parameters iac/parameters.json

# Execute the production deployment
az deployment group create `
  --name "hc-landingzone-rollout-$(Get-Date -Format 'yyyyMMddHHmmss')" `
  --resource-group $ResourceGroup `
  --template-file iac/main.bicep `
  --parameters iac/parameters.json `
  --verbose
```

---

## 🔍 Step 4: Post-Deployment Infrastructure Validation

Verify the deployed resources using validation queries:

```powershell
# 1. Verify Recovery Services Vault status
az backup vault show `
  --name "rsv-hc-prod-backup" `
  --resource-group $ResourceGroup `
  --query "properties.provisioningState" -o tsv

# 2. Verify Key Vault secrets access and network rules
az keyvault show `
  --name "kv-hc-prod-secrets" `
  --resource-group $ResourceGroup `
  --query "properties.publicNetworkAccess" -o tsv

# 3. Check Log Analytics retention configurations
az monitor log-analytics workspace show `
  --workspace-name "law-hc-prod-logs" `
  --resource-group $ResourceGroup `
  --query "retentionInDays" -o tsv
```

---

## 🔄 Step 5: Rollback Procedure (Emergency Rollback)

In case validation fails or metric alert definitions fail deployment:

```powershell
# 1. Remove the active resource lock (if applied)
az lock delete `
  --name "rg-delete-lock" `
  --resource-group $ResourceGroup

# 2. Delete the Resource Group to purge ephemeral services
az group delete `
  --name $ResourceGroup `
  --yes --no-wait

# 3. Clean up Azure AD App Registrations and PIM configurations
Write-Host "[ROLLBACK COMPLETED] Environment restored to clean state." -ForegroundColor Red
```
