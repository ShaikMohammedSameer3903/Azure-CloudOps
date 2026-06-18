# Azure Healthcare Platform Deployment Script
# Provisions resources using Bicep templates

$ResourceGroup = "RG-Healthcare-Prod"
$Location = "southeastasia"

Write-Host "Deploying main Landing Zone architecture (law, keyvault, RSV)..."
az deployment group create `
  --resource-group $ResourceGroup `
  --template-file iac/main.bicep `
  --parameters environment=prod location=$Location

Write-Host "Deploying application hosting layer (App Service, Static Web App, App Insights, Role Assignments)..."
az deployment group create `
  --resource-group $ResourceGroup `
  --template-file iac/deployment.bicep `
  --parameters environment=prod location=$Location

Write-Host "Deployment completed successfully!"

