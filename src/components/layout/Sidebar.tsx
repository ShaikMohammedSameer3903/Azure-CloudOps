// ============================================================
// Enterprise Multi-Cloud Sidebar — Context-Aware Navigation
// Shows only the relevant cloud section based on current route
// ============================================================

import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Activity, AlertTriangle, Zap,
  Brain, FileBarChart, Settings, ChevronLeft, ChevronRight,
  LogOut, Cloud, ShieldAlert, ShieldCheck, BarChart3,
  HardDrive, Landmark, PieChart, Siren, Globe, Sparkles, Shield,
  Layers, Cpu, Database, Crosshair, Home, DollarSign,
} from 'lucide-react';
import { useAuth } from '../../providers/AuthProvider';
import { useAppStore } from '../../store/appStore';
import { useCloudStore } from '../../store/cloudStore';
import HealthWidget from './HealthWidget';

// ── Azure Navigation ──
const azureNavItems = [
  { id: 'azure-dash',       label: 'Dashboard',       icon: LayoutDashboard, path: '/azure' },
  { id: 'azure-resources',  label: 'Resources',        icon: Server,          path: '/azure/resources' },
  { id: 'azure-monitoring', label: 'Monitoring',       icon: Activity,        path: '/azure/monitoring' },
  { id: 'azure-security',   label: 'Security',         icon: ShieldAlert,     path: '/azure/security' },
  { id: 'azure-cost',       label: 'Cost',             icon: DollarSign,      path: '/azure/cost' },
  { id: 'azure-governance', label: 'Governance',       icon: Landmark,        path: '/azure/governance' },
  { id: 'azure-backup',     label: 'Backup',           icon: HardDrive,       path: '/azure/backup' },
  { id: 'azure-ai',         label: 'AI Assistant',     icon: Brain,           path: '/azure/ai' },
  { id: 'azure-reports',    label: 'Reports',          icon: FileBarChart,    path: '/azure/reports' },
];

// ── AWS Navigation ──
const awsNavItems = [
  { id: 'aws-dash',       label: 'Dashboard',       icon: LayoutDashboard, path: '/aws' },
  { id: 'aws-resources',  label: 'Resources',        icon: Server,          path: '/aws/resources' },
  { id: 'aws-monitoring', label: 'Monitoring',       icon: Activity,        path: '/aws/monitoring' },
  { id: 'aws-security',   label: 'Security',         icon: ShieldAlert,     path: '/aws/security' },
  { id: 'aws-cost',       label: 'Cost',             icon: DollarSign,      path: '/aws/cost' },
  { id: 'aws-governance', label: 'Governance',       icon: Landmark,        path: '/aws/governance' },
  { id: 'aws-backup',     label: 'Backup',           icon: HardDrive,       path: '/aws/backup' },
  { id: 'aws-ai',         label: 'AI Assistant',     icon: Brain,           path: '/aws/ai' },
  { id: 'aws-reports',    label: 'Reports',          icon: FileBarChart,    path: '/aws/reports' },
];

// ── Multi-Cloud Navigation ──
const multiCloudNavItems = [
  { id: 'mc-executive',   label: 'Executive View',    icon: LayoutDashboard, path: '/multicloud' },
  { id: 'mc-operations',  label: 'Operations Center', icon: Globe,           path: '/multicloud/operations' },
  { id: 'mc-governance',  label: 'Governance',        icon: Landmark,        path: '/multicloud/governance' },
  { id: 'mc-reports',     label: 'Reports',           icon: FileBarChart,    path: '/multicloud/reports' },
  { id: 'mc-analytics',   label: 'Analytics',         icon: BarChart3,       path: '/multicloud/analytics' },
];

// ── Common / Admin Navigation (always visible) ──
const commonNavItems = [
  { id: 'security-soc', label: 'Security SOC',     icon: ShieldAlert,   path: '/security-soc' },
  { id: 'incidents',    label: 'Incidents',        icon: AlertTriangle, path: '/incidents' },
  { id: 'actions',      label: 'Actions',          icon: Zap,           path: '/actions' },
  { id: 'settings',     label: 'Settings',         icon: Settings,      path: '/settings' },
];

type ActiveSection = 'home' | 'azure' | 'aws' | 'multicloud' | 'other';

function getActiveSection(pathname: string): ActiveSection {
  if (pathname.startsWith('/azure')) return 'azure';
  if (pathname.startsWith('/aws')) return 'aws';
  if (pathname.startsWith('/multicloud')) return 'multicloud';
  if (pathname === '/') return 'home';
  return 'other';
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'Admin' || user?.role === 'SuperAdmin';
  const {
    sidebarCollapsed, toggleSidebar,
    mobileSidebarOpen, setMobileSidebarOpen,
    incidents,
  } = useAppStore();
  const { cloudAccounts } = useCloudStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectivelyCollapsed = isMobile ? false : sidebarCollapsed;
  const openIncidents = incidents.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').length;
  const initials = user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  const activeSection = getActiveSection(location.pathname);

  const hasAzure = cloudAccounts.some(a => a.provider === 'azure');
  const hasAws = cloudAccounts.some(a => a.provider === 'aws');

  const renderNavGroup = (title: string, items: typeof azureNavItems, providerColor?: string) => (
    <>
      <div className="sidebar-section-title" style={providerColor ? { display: 'flex', alignItems: 'center', gap: 6 } : undefined}>
        {providerColor && <div style={{ width: 6, height: 6, borderRadius: '50%', background: providerColor, flexShrink: 0 }} />}
        {title}
      </div>
      {items.map(item => (
        <NavLink
          key={item.id}
          to={item.path}
          className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
          end={item.path === '/azure' || item.path === '/aws' || item.path === '/multicloud' || item.path === '/'}
          title={effectivelyCollapsed ? item.label : undefined}
          aria-label={`Navigate to ${item.label}`}
          onClick={() => setMobileSidebarOpen(false)}
        >
          <span className="sidebar-item-icon">
            <item.icon size={17} strokeWidth={1.8} />
          </span>
          <span className="sidebar-item-label">{item.label}</span>
          {item.id === 'incidents' && openIncidents > 0 && (
            <span className="sidebar-item-badge">{openIncidents}</span>
          )}
        </NavLink>
      ))}
    </>
  );

  return (
    <>
      {mobileSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}
      <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}${mobileSidebarOpen ? ' mobile-open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <span className="b1" /><span className="b2" />
            <span className="b3" /><span className="b4" />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">CloudOps Enterprise</span>
            <span className="sidebar-brand-sub">Multi-Cloud Portal</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {cloudAccounts.length > 0 ? (
            <>
              {/* Home Link — always visible */}
              <NavLink
                to="/"
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                end
                onClick={() => setMobileSidebarOpen(false)}
                title={effectivelyCollapsed ? 'Dashboard Home' : undefined}
                aria-label="Navigate to Dashboard Home"
              >
                <span className="sidebar-item-icon"><Home size={17} strokeWidth={1.8} /></span>
                <span className="sidebar-item-label">Dashboard Home</span>
              </NavLink>

              {/* Context-Aware Cloud Navigation */}
              {activeSection === 'azure' && renderNavGroup('Azure', azureNavItems, '#0078d4')}
              {activeSection === 'aws' && renderNavGroup('AWS', awsNavItems, '#FF9900')}
              {activeSection === 'multicloud' && renderNavGroup('Multi-Cloud', multiCloudNavItems, '#8b5cf6')}

              {/* When on home or other pages, show cloud entry points */}
              {(activeSection === 'home' || activeSection === 'other') && (
                <>
                  {hasAzure && (
                    <>
                      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0078d4', flexShrink: 0 }} />
                        Azure
                      </div>
                      <NavLink to="/azure" className="sidebar-item" aria-label="Navigate to Azure Dashboard" onClick={() => setMobileSidebarOpen(false)}>
                        <span className="sidebar-item-icon"><Cloud size={17} strokeWidth={1.8} /></span>
                        <span className="sidebar-item-label">Azure Dashboard</span>
                      </NavLink>
                    </>
                  )}
                  {hasAws && (
                    <>
                      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF9900', flexShrink: 0 }} />
                        AWS
                      </div>
                      <NavLink to="/aws" className="sidebar-item" aria-label="Navigate to AWS Dashboard" onClick={() => setMobileSidebarOpen(false)}>
                        <span className="sidebar-item-icon"><Cpu size={17} strokeWidth={1.8} /></span>
                        <span className="sidebar-item-label">AWS Dashboard</span>
                      </NavLink>
                    </>
                  )}
                  {(hasAzure || hasAws) && (
                    <>
                      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', flexShrink: 0 }} />
                        Multi-Cloud
                      </div>
                      <NavLink to="/multicloud" className="sidebar-item" aria-label="Navigate to Multi-Cloud Executive View" onClick={() => setMobileSidebarOpen(false)}>
                        <span className="sidebar-item-icon"><Globe size={17} strokeWidth={1.8} /></span>
                        <span className="sidebar-item-label">Executive View</span>
                      </NavLink>
                    </>
                  )}
                </>
              )}

              {/* Common section */}
              {renderNavGroup('Operations', commonNavItems)}

              {/* Admin section */}
              {isAdmin && (
                <>
                  <div className="sidebar-section-title">Administration</div>
                  <NavLink to="/admin" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`} aria-label="Navigate to Admin Panel" onClick={() => setMobileSidebarOpen(false)}>
                    <span className="sidebar-item-icon"><Shield size={17} strokeWidth={1.8} /></span>
                    <span className="sidebar-item-label">Admin Panel</span>
                  </NavLink>
                </>
              )}
            </>
          ) : (
            <>
              {renderNavGroup('Get Started', [
                { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
                { id: 'cloud-accounts', label: 'Cloud Accounts', icon: Cloud, path: '/cloud-accounts' },
                { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
              ])}
            </>
          )}
        </nav>

        {/* Platform Health Center */}
        <HealthWidget collapsed={effectivelyCollapsed} />

        {/* Collapse toggle */}
        {!isMobile && (
          <button
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed
              ? <ChevronRight size={16} />
              : <><ChevronLeft size={16} /><span>Collapse</span></>
            }
          </button>
        )}

        {/* User Footer */}
        <div className="sidebar-footer">
          <div
            className="sidebar-user"
            onClick={logout}
            title="Sign out"
            role="button"
            aria-label="Sign out"
            tabIndex={0}
            onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') logout(); }}
          >
            <div className="sidebar-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.displayName || 'User'}</div>
              <div className="sidebar-user-role">{user?.role || 'Viewer'}</div>
            </div>
            <LogOut size={14} style={{ color: 'var(--sidebar-text-muted)', minWidth: 14 }} />
          </div>
        </div>
      </aside>
    </>
  );
}
