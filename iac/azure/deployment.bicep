metadata description = 'App Service and Static Web App Deployments for Healthcare Dashboard'

param location string = resourceGroup().location
param environment string = 'prod'
param appServicePlanName string = 'asp-hc-${environment}'
param webAppName string = 'app-hc-${environment}-backend'
param staticWebAppName string = 'swa-hc-${environment}-frontend'
param keyVaultName string = 'kv-hc-${environment}-secrets'
param logAnalyticsWorkspaceName string = 'law-hc-${environment}-logs'
param appInsightsName string = 'ai-hc-${environment}'
param swaLocation string = 'eastasia'


// Reference existing LAW
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' existing = {
  name: logAnalyticsWorkspaceName
}

// Reference existing Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' existing = {
  name: keyVaultName
}

// App Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// App Service Plan (Linux)
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// App Service Web App (Backend)
resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      appSettings: [
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: appInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'PORT'
          value: '8080'
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
        {
          name: 'SUBSCRIPTION_ID'
          value: subscription().subscriptionId
        }
        {
          name: 'TENANT_ID'
          value: subscription().tenantId
        }
        {
          name: 'AZURE_REGION'
          value: location
        }
        {
          name: 'RESOURCE_GROUP'
          value: resourceGroup().name
        }
      ]
    }
  }
}

// Static Web App (Frontend)
resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// Assign Key Vault Secrets User role to the App Service Managed Identity
// Key Vault Secrets User Role Definition ID: 4633458b-17de-408a-b874-0445c86b69e6
resource kvSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.name, 'kvSecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Assign Reader role to the App Service Managed Identity on the Resource Group to query resources/alerts
// Reader Role Definition ID: acdd72a7-3385-48ef-bd42-f606fba81ae7
resource rgReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, webApp.name, 'rgReader')
  scope: resourceGroup()
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}


output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname

