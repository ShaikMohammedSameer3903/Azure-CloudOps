
$content = Get-Content src/App.tsx -Raw

# Replace the whole loadSubscriptions useEffect block (lines 63-124)
$content = $content -replace "(?s)useEffect\(\(\) => \{\s+if \(isAuthenticated\) \{\s+const loadSubscriptions = async \(\) => \{.*?\}\);\s*\}, \[isAuthenticated.*?\]\);", @"
  useEffect(() => {
    if (isAuthenticated) {
      const loadAccounts = async () => {
        try {
          const accounts = await api.get<any[]>('/api/cloud-accounts');
          useCloudStore.getState().setCloudAccounts(accounts);
          
          if (accounts.length === 0) {
            window.dispatchEvent(new Event('cloudops-show-onboarding'));
          } else {
            const activeScope = useCloudStore.getState().activeScope;
            if (activeScope !== 'ALL' && !accounts.find(a => a.id === activeScope)) {
              useCloudStore.getState().setActiveScope('ALL');
            }
          }
        } catch (err) {
          console.error('Failed to load cloud accounts:', err);
        }
      };
      loadAccounts();
    }
  }, [isAuthenticated]);
"@

# Replace the loadResources block (126-158)
$content = $content -replace "(?s)useEffect\(\(\) => \{\s+if \(isAuthenticated && activeSubscriptionId\).*?loadResources\(\);\s*\}\s*\}, \[isAuthenticated, activeSubscriptionId.*?\]\);", ""

# Replace the interval sync block (162-183)
$content = $content -replace "(?s)// Smart background sync — every 10s.*?useEffect\(\(\) => \{\s+if \(!isAuthenticated \|\| !activeSubscriptionId\) return;.*?clearInterval\(interval\);\s*\}, \[isAuthenticated.*?\]\);", ""

Set-Content -Path src/App.tsx -Value $content

