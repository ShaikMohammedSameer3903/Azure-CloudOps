const AzureProvider = require('./azure/AzureProvider');
const AwsProvider = require('./aws/AwsProvider');
const GcpProvider = require('./GcpProvider');

class ProviderFactory {
  static getProvider(account) {
    if (!account || !account.provider) {
      throw new Error("Invalid cloud account object provided.");
    }
    
    switch (account.provider.toLowerCase()) {
      case 'azure':
        return new AzureProvider(account);
      case 'aws':
        return new AwsProvider(account);
      case 'gcp':
        return new GcpProvider(account);
      default:
        throw new Error(`Unknown cloud provider: ${account.provider}`);
    }
  }
}

module.exports = ProviderFactory;
