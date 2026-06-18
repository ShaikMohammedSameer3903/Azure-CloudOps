class CloudProvider {
  constructor(account) {
    if (this.constructor === CloudProvider) {
      throw new Error("Abstract classes can't be instantiated.");
    }
    this.account = account; // { id, provider, tenant_id, account_id, etc. }
  }

  async getResources() {
    throw new Error("Method 'getResources()' must be implemented.");
  }

  async getMonitoring() {
    throw new Error("Method 'getMonitoring()' must be implemented.");
  }

  async getSecurity() {
    throw new Error("Method 'getSecurity()' must be implemented.");
  }

  async getCost() {
    throw new Error("Method 'getCost()' must be implemented.");
  }

  async getBackup() {
    throw new Error("Method 'getBackup()' must be implemented.");
  }

  async getCompliance() {
    throw new Error("Method 'getCompliance()' must be implemented.");
  }

  async getIncidents() {
    throw new Error("Method 'getIncidents()' must be implemented.");
  }
}

module.exports = CloudProvider;
