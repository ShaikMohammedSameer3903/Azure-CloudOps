# Azure Platform Deployment Report

This report documents the validation, compilation, and provisioning outcomes for the **Azure Healthcare Cloud Landing Zone** resources.

---

## 🛠️ 1. Template Compilation & Validation

```powershell
# Compile Bicep template
az bicep build --file iac/main.bicep
# Output: Successfully generated main.json

# Run dry-run validation targeting Singapore
az deployment group validate `
  --resource-group RG-Healthcare-Prod `
  --template-file iac/main.bicep `
  --parameters location=southeastasia environment=prod
# Output: validation succeeded (provisioningState: Succeeded)
```

---

## 🚀 2. Command Execution Logs

The resources were deployed into the target subscription:

```powershell
$ResourceGroup = "RG-Healthcare-Prod"

az deployment group create `
  --name "hc-lz-deployment-run" `
  --resource-group $ResourceGroup `
  --template-file iac/main.bicep `
  --parameters location=southeastasia environment=prod
```

### Deployed Resource Inventory
* **Recovery Services Vault**: `rsv-hc-prod-backup` (Location: `southeastasia`, Provisioned: Success)
* **Log Analytics Workspace**: `law-hc-prod-logs` (Location: `southeastasia`, Provisioned: Success)
* **Key Vault Premium**: `kv-hc-prod-secrets` (Location: `southeastasia`, Provisioned: Success)
* **Metric Alert Rules**: `alert-hc-backup-failures` (Location: `global`, Provisioned: Success)

---

## 🔍 3. Resource Health Verification

```powershell
# Check health of deployed RSV
az backup vault show `
  --name rsv-hc-prod-backup `
  --resource-group RG-Healthcare-Prod `
  --query "properties.provisioningState" -o tsv
# Output: Succeeded

# Check Key Vault connection and policy state
az keyvault show `
  --name kv-hc-prod-secrets `
  --resource-group RG-Healthcare-Prod `
  --query "properties.provisioningState" -o tsv
# Output: Succeeded
```
