// ============================================================
// Enterprise Header — Azure Portal style with Tenant Switcher
// ============================================================

import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Sun, Moon, RefreshCw, Menu, ChevronDown, Sparkles } from 'lucide-react';
import { useTheme } from '../../providers/ThemeProvider';
import { useCloudStore } from '../../store/cloudStore';
import { useAppStore, TENANT_CONFIGS, type IndustryTenant } from '../../store/appStore';
import { useEffect, useCallback, useState, useRef } from 'react';

const pageTitles: Record<string, string> = {
  '/':           'Executive View',
  '/resources':  'Resources',
  '/monitoring': 'Monitoring',
  '/cost':       'Cost Management',
  '/actions':    'Actions',
  '/incidents':  'Incidents',
  '/ai':         'AI Assistant',
  '/reports':    'Reports',
  '/security':   'Security Center',
  '/soc':        'SOC Dashboard',
  '/risk':       'Risk Management',
  '/governance': 'Governance',
  '/backup':     'Backup & DR',
  '/settings':   'Settings',
};

const INDUSTRY_OPTIONS: IndustryTenant[] = ['All', 'Healthcare', 'Education', 'Government', 'Banking', 'Retail', 'Manufacturing'];

export default function Header() {
  const { toggleTheme, isDark } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { cloudAccounts, activeScope, setActiveScope, selectedProvider } = useCloudStore();
  const {
    isRefreshing, lastUpdated, unreadCount,
    globalSearchQuery, setGlobalSearchQuery,
    toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen, toggleActivityPanel, activityPanelCollapsed,
    
    autoRefreshEnabled, refreshInterval,
    activeEnvironment, setActiveEnvironment,
  } = useAppStore();

  const [showSubDropdown, setShowSubDropdown] = useState(false);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [countdown, setCountdown] = useState(refreshInterval);
  const countdownRef = useRef<any>(null);
  const subDropdownRef = useRef<HTMLDivElement>(null);
  const tenantDropdownRef = useRef<HTMLDivElement>(null);

  const currentPage = pageTitles[location.pathname] || 'Dashboard';
  const activeAccount = cloudAccounts.find(a => a.id === activeScope);
  const filteredAccounts = selectedProvider === 'all' ? cloudAccounts : cloudAccounts.filter(a => a.provider === selectedProvider);
  const tenantConfig = activeEnvironment !== 'All' ? TENANT_CONFIGS[activeEnvironment] : null;

  // Countdown timer for auto-refresh
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    setCountdown(refreshInterval);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return refreshInterval;
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoRefreshEnabled, refreshInterval, lastUpdated]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (subDropdownRef.current && !subDropdownRef.current.contains(e.target as Node)) {
        setShowSubDropdown(false);
      }
      if (tenantDropdownRef.current && !tenantDropdownRef.current.contains(e.target as Node)) {
        setShowTenantDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRefresh = useCallback(async () => {
    window.dispatchEvent(new CustomEvent('azure-manual-refresh'));
  }, []);

  const formatLastUpdated = () => {
    if (!lastUpdated) return 'Never';
    const diff = Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 1000);
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  return (
    <header className="header">
      {/* Left: Menu + Breadcrumb */}
      <div className="header-left">
        <button
          className="header-toggle-btn"
          onClick={() => {
            if (window.innerWidth < 768) {
              setMobileSidebarOpen(!mobileSidebarOpen);
            } else {
              toggleSidebar();
            }
          }}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          aria-expanded={window.innerWidth < 768 ? mobileSidebarOpen : !activityPanelCollapsed}
        >
          <Menu size={17} />
        </button>

        <div className="header-breadcrumbs">
          <a onClick={() => navigate('/')} role="link" tabIndex={0}>Home</a>
          <span className="separator">›</span>
          <span className="current">{currentPage}</span>
        </div>
      </div>

      {/* Center: Search */}
      <div className="header-center">
        <div className="header-search-wrapper">
          <Search size={13} className="header-search-icon" />
          <input
            type="text"
            className="header-search"
            placeholder="Search resources, alerts, subscriptions…"
            value={globalSearchQuery}
            onChange={e => setGlobalSearchQuery(e.target.value)}
            aria-label="Global search"
          />
          <div className="header-search-kbd">
            <span className="kbd">Ctrl</span>
            <span className="kbd">K</span>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="header-right">
        {/* Live indicator */}
        <div className="header-live-indicator" title={`Last refreshed: ${formatLastUpdated()}`}>
          <span className="live-dot" />
          <span>Live</span>
        </div>

        {/* Data Source Diagnostics Metadata */}
        {activeAccount ? (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.2, textAlign: 'right', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
            <div><span style={{ color: 'var(--azure-600)', fontWeight: 700 }}>Data Source:</span> {activeAccount.provider.toUpperCase()}</div>
            <div><span style={{ fontWeight: 600 }}>Account:</span> {activeAccount.account_name}</div>
            <div><span style={{ fontWeight: 600 }}>ID:</span> {activeAccount.subscription_id || activeAccount.account_id}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.2, textAlign: 'right', borderLeft: '1px solid var(--border-subtle)', paddingLeft: 12 }}>
            <div><span style={{ color: 'var(--azure-600)', fontWeight: 700 }}>Provider Context:</span> {selectedProvider.toUpperCase()}</div>
            <div><span style={{ fontWeight: 600 }}>Accounts:</span> All Connected</div>
          </div>
        )}
        {/* Account Switcher */}
        {filteredAccounts.length > 0 && (
          <div style={{ position: 'relative' }} ref={subDropdownRef}>
            <button
              className="sub-switcher-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-surface-secondary)',
                color: 'var(--text-primary)',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onClick={() => setShowSubDropdown(v => !v)}
              title="Select Cloud Account"
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {activeScope === 'ALL' ? 'All Accounts' : (activeAccount?.account_name || 'Select Account')}
              </span>
              <ChevronDown size={12} style={{ flexShrink: 0 }} />
            </button>
            {showSubDropdown && (
              <div className="dropdown-menu" style={{ minWidth: 220, left: 0, right: 'auto', background: '#16192b', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  className="dropdown-item"
                  onClick={() => { setActiveScope('ALL'); setShowSubDropdown(false); }}
                  style={{ fontWeight: activeScope === 'ALL' ? 700 : 400, padding: '8px 12px', cursor: 'pointer', color: 'white' }}
                >
                  🌐 All Accounts
                </div>
                <div className="dropdown-divider" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }} />
                {filteredAccounts.map(account => (
                  <div
                    key={account.id}
                    className="dropdown-item"
                    onClick={() => { setActiveScope(account.id); setShowSubDropdown(false); }}
                    style={{ fontWeight: account.id === activeScope ? 700 : 400, padding: '8px 12px', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <span>{account.provider === 'azure' ? '🔷' : account.provider === 'aws' ? '🟠' : '🟢'}</span>
                    {account.account_name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="header-divider" />

        {/* Auto-refresh countdown */}
        {autoRefreshEnabled && (
          <span className="header-refresh-countdown" title="Auto-refresh countdown">
            {countdown}s
          </span>
        )}

        {/* Manual refresh */}
        <button
          className="header-icon-btn"
          onClick={handleRefresh}
          title={`Refresh data (last: ${formatLastUpdated()})`}
          aria-label="Refresh data"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        {/* Theme toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Discovery Scan Status Panel Toggle */}
        <button
          className="header-icon-btn"
          onClick={toggleActivityPanel}
          title={activityPanelCollapsed ? 'Show Activity & Discovery Drawer' : 'Hide Activity & Discovery Drawer'}
          aria-label="Toggle Activity & Discovery Drawer"
          style={{
            color: activityPanelCollapsed ? 'var(--text-secondary)' : '#0078D4',
            background: activityPanelCollapsed ? 'transparent' : 'rgba(0, 120, 212, 0.08)',
          }}
        >
          <Sparkles size={16} className={isRefreshing ? 'animate-pulse' : ''} />
        </button>

        {/* Notifications */}
        <button
          className="header-icon-btn"
          title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
          aria-label="Notifications"
        >
          <Bell size={16} />
          {unreadCount > 0 && <span className="badge-dot" />}
        </button>
      </div>
    </header>
  );
}

