# Microsoft Entra ID App Registration Checklist

Follow these steps to correctly configure the Microsoft Entra ID application registration for Azure CloudOps:

### 1. Create App Registration
- Navigate to the **Microsoft Entra ID** blade in the Azure Portal.
- Select **App registrations** > **New registration**.
- Name: `Azure CloudOps Platform` (or similar).
- Supported account types: Select as needed (e.g., Accounts in any organizational directory - Multitenant).
- Register.

### 2. Configure Authentication (SPA Platform)
- Go to **Authentication** under Manage.
- Click **Add a platform** > **Single-page application (SPA)**.
- **Add Redirect URIs:**
  - `http://localhost:5173` (for local development)
  - `https://your-production-domain` (for production)
- Check both **Access tokens** and **ID tokens** under Implicit grant and hybrid flows.
- Save.

### 3. API Permissions
- Go to **API permissions**.
- Click **Add a permission**.
- Select **Microsoft Graph** > Delegated permissions.
- Ensure the following are checked:
  - `User.Read`
  - `openid`
  - `profile`
  - `email`
  - `offline_access`
- (Optional, for Azure management) Add **Azure Service Management** > `user_impersonation`.
- Click **Grant admin consent** for your tenant.

### 4. Update Environment Variables
Once created, update your `.env` (and any local/production env files) with the generated values:
```env
VITE_AZURE_CLIENT_ID=your-client-id
VITE_AZURE_TENANT_ID=your-tenant-id
VITE_REDIRECT_URI=http://localhost:5173
```
