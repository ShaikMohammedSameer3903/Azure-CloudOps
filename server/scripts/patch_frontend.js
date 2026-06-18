const fs = require('fs');

let appContent = fs.readFileSync('src/App.tsx', 'utf8');

appContent = appContent.replace(
  `if (cloudAccounts.length === 0) {
           setSubscriptions([]);
           setActiveSubscription(null);
           return;
        }`,
  `if (!user) {
           setSubscriptions([]);
           setActiveSubscription(null);
           return;
        }`
);

fs.writeFileSync('src/App.tsx', appContent);

let dashboardContent = fs.readFileSync('src/pages/DashboardHome.tsx', 'utf8');

// Inside DashboardHome, replace the condition that redirects to Welcome screen
// It currently says: if (!loading && cloudAccounts.length === 0)
// It should be: if (!loading && !user?.onboardingComplete)

dashboardContent = dashboardContent.replace(
  `if (!loading && cloudAccounts.length === 0) {`,
  `if (!loading && !user?.onboardingComplete && cloudAccounts.length === 0) {`
);

fs.writeFileSync('src/pages/DashboardHome.tsx', dashboardContent);
