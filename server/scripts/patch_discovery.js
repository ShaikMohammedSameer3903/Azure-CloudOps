const fs = require('fs');

let c = fs.readFileSync('src/pages/Discovery.tsx', 'utf8');

c = c.replace(/const handleAzureDiscovery/g, `const handleSuccess = async () => {
    try {
      await api.post('/api/users/onboarding/complete');
      const lUser = JSON.parse(localStorage.getItem('cloudops-local-user') || 'null');
      if (lUser) {
        lUser.onboardingComplete = true;
        localStorage.setItem('cloudops-local-user', JSON.stringify(lUser));
      }
    } catch (err) {
      console.warn('Failed to save onboarding state');
    }
    setStep('success');
  };

  const handleAzureDiscovery`);

c = c.replace(/setStep\('success'\);/g, `handleSuccess();`);
c = c.replace(/<button onClick=\{\(\) => navigate\('\/'\)\} /g, `<button onClick={() => window.location.href = '/'} `);

fs.writeFileSync('src/pages/Discovery.tsx', c);
