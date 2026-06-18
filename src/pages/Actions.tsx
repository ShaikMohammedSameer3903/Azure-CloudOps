// ============================================================
// Operations Actions and Provisioning Wizards Component
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import { 
  Play, Square, RotateCw, Cpu, HardDrive, 
  Layers, Lock, CheckCircle2, AlertCircle,
  Shield, Globe, Database, Box, Award, Zap, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Info, MapPin, Tag
} from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../services/api';

export default function Actions() {
  const { user } = useAuth();
  const {
    resources,
    activeSubscriptionId,
    setResources
  } = useAppStore();

  // Selected subscription's virtual machines
  const vms = useMemo(() => {
    return resources.filter(r => 
      r.type === 'Microsoft.Compute/virtualMachines' &&
      (activeSubscriptionId === 'all' || r.cloudAccountId === activeSubscriptionId || r.subscription_id === activeSubscriptionId)
    );
  }, [resources, activeSubscriptionId]);

  // Unique Resource Groups for selector dropdowns
  const resourceGroups = useMemo(() => {
    const rgs = new Set<string>();
    resources.filter(r => activeSubscriptionId === 'all' || r.cloudAccountId === activeSubscriptionId || r.subscription_id === activeSubscriptionId)
      .forEach(r => {
        if (r.resource_group) rgs.add(r.resource_group);
        else if (r.resourceGroup) rgs.add(r.resourceGroup);
      });
    return Array.from(rgs);
  }, [resources, activeSubscriptionId]);

  // Action status/notifications
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // resourceId of currently running VM action

  // Forms state
  const [rgName, setRgName] = useState('');
  const [rgLocation, setRgLocation] = useState('southeastasia');
  const [rgLoading, setRgLoading] = useState(false);

  const [saName, setSaName] = useState('');
  const [saGroup, setSaGroup] = useState('');
  const [saLocation, setSaLocation] = useState('southeastasia');
  const [saLoading, setSaLoading] = useState(false);

  const [vmName, setVmName] = useState('');
  const [vmGroup, setVmGroup] = useState('');
  const [vmLocation, setVmLocation] = useState('southeastasia');
  const [vmSize, setVmSize] = useState('Standard_D2s_v5');
  const [vmOs, setVmOs] = useState('Ubuntu 22.04 LTS');
  const [vmLoading, setVmLoading] = useState(false);

  const [studentLoading, setStudentLoading] = useState(false);
  const [studentResult, setStudentResult] = useState<any>(null);
  const [studentProvisionStep, setStudentProvisionStep] = useState(0);

  const handleCreateStudentLab = async () => {
    if (isReadOnly) return;
    setStudentLoading(true);
    setStudentResult(null);
    setStudentProvisionStep(0);
    setActionMessage(null);

    // Animate provision steps
    const stepTimer = setInterval(() => {
      setStudentProvisionStep(prev => (prev < 3 ? prev + 1 : prev));
    }, 1800);

    try {
      const result = await api.post<any>('/api/actions/student-lab', {
        subscriptionId: activeSubscriptionId
      });
      clearInterval(stepTimer);
      setStudentProvisionStep(4);
      setStudentResult(result);
      setActionMessage({ type: 'success', text: result.message });
    } catch (err: any) {
      clearInterval(stepTimer);
      setStudentProvisionStep(0);
      setActionMessage({ type: 'error', text: err.message || 'Student Lab deployment failed.' });
    } finally {
      setStudentLoading(false);
    }
  };

  // Auto-derive student lab info from provisioned resources
  const studentLabResources = useMemo(() => {
    return resources.filter(r => {
      const match = r.tags?.StudentLab === 'true' ||
      (r.resource_group || r.resourceGroup || '').toLowerCase().includes('student-lab') ||
      (r.name || '').toLowerCase().includes('student-lab') ||
      (r.name || '').toLowerCase().includes('forstudents') ||
      (r.name || '').toLowerCase().includes('swa-student');
      
      const inActiveSub = activeSubscriptionId === 'all' || r.cloudAccountId === activeSubscriptionId || r.subscription_id === activeSubscriptionId;
      return match && inActiveSub;
    });
  }, [resources, activeSubscriptionId]);

  const studentRg = studentLabResources.find(r => r.type?.includes('resourceGroups'));
  const studentSa = studentLabResources.find(r => r.type?.includes('storageAccounts'));
  const studentSwa = studentLabResources.find(r => r.type?.includes('staticSites'));

  // Live refresh every 60s
  const { activeSubscriptionId: subId } = useAppStore();
  useEffect(() => {
    const t = setInterval(() => {
      if (subId) api.get<any[]>('/api/resources', { params: { subscriptionId: subId } })
        .then(r => useAppStore.getState().setResources(r)).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, [subId]);

  // Check if role has writing permission or if in global view
  const isReadOnly = ['VIEWER', 'AUDITOR'].includes(user?.role || '') || activeSubscriptionId === 'all';

  // 1. VM Power Actions (Start, Stop, Restart)
  const handleVmPowerAction = async (resourceId: string, action: 'start' | 'stop' | 'restart') => {
    if (isReadOnly) return;
    setActionLoading(resourceId);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/vm', {
        subscriptionId: activeSubscriptionId,
        resourceId,
        action
      });

      // Update resource state locally in Zustand store
      setResources(
        resources.map(r => r.id === resourceId ? { ...r, status: result.status } : r)
      );

      setActionMessage({ type: 'success', text: result.message });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Action failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Create Resource Group
  const handleCreateRg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !rgName) return;
    setRgLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/resource-group', {
        subscriptionId: activeSubscriptionId,
        name: rgName,
        location: rgLocation
      });

      // Trigger resource reload or update cache locally
      const newRg = {
        id: result.id,
        resourceId: result.id,
        name: rgName,
        type: 'Microsoft.Resources/resourceGroups',
        resourceTypeFull: 'Microsoft.Resources/resourceGroups',
        location: rgLocation,
        resourceGroup: rgName,
        resource_group: rgName,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Active',
        tags: {},
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newRg]);

      setActionMessage({ type: 'success', text: result.message });
      setRgName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create Resource Group.' });
    } finally {
      setRgLoading(false);
    }
  };

  // 3. Create Storage Account
  const handleCreateSa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !saName || !saGroup) return;
    setSaLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/storage-account', {
        subscriptionId: activeSubscriptionId,
        name: saName,
        resourceGroup: saGroup,
        location: saLocation
      });

      const newSa = {
        id: result.id,
        resourceId: result.id,
        name: saName,
        type: 'Microsoft.Storage/storageAccounts',
        resourceTypeFull: 'Microsoft.Storage/storageAccounts',
        location: saLocation,
        resourceGroup: saGroup,
        resource_group: saGroup,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Available',
        tags: { Environment: 'Production' },
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newSa]);

      setActionMessage({ type: 'success', text: result.message });
      setSaName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create Storage Account.' });
    } finally {
      setSaLoading(false);
    }
  };

  // 4. Deploy VM
  const handleDeployVm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !vmName || !vmGroup) return;
    setVmLoading(true);
    setActionMessage(null);

    try {
      const result = await api.post<any>('/api/actions/deploy-vm', {
        subscriptionId: activeSubscriptionId,
        name: vmName,
        resourceGroup: vmGroup,
        location: vmLocation,
        size: vmSize,
        os: vmOs
      });

      const newVm = {
        id: result.id,
        resourceId: result.id,
        name: vmName,
        type: 'Microsoft.Compute/virtualMachines',
        resourceTypeFull: 'Microsoft.Compute/virtualMachines',
        location: vmLocation,
        resourceGroup: vmGroup,
        resource_group: vmGroup,
        subscriptionId: activeSubscriptionId || '',
        subscription_id: activeSubscriptionId || '',
        provisioningState: 'Succeeded',
        status: 'Running',
        tags: { Environment: 'Staging' },
        lastSynced: new Date().toISOString()
      };
      setResources([...resources, newVm]);

      setActionMessage({ type: 'success', text: result.message });
      setVmName('');
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'VM Deployment failed.' });
    } finally {
      setVmLoading(false);
    }
  };

  return (
    <div>
      <header className="page-header">
        <div className="page-header-content">
          <h1 className="page-title">Operations Center & Provisioning</h1>
          <p className="page-subtitle">
            Perform VM control power cycles and trigger automated Bicep deployments.
          </p>
        </div>
      </header>

      {/* Global Action Banner */}
      {actionMessage && (
        <div className={`status-pill ${actionMessage.type === 'success' ? 'healthy' : 'stopped'} mb-5`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          {actionMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {activeSubscriptionId === 'all' && (
        <div className="status-pill stopped mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <AlertTriangle size={16} />
          <span>Please select a specific subscription from the top navigation menu to perform provisioning actions. Global "All Subscriptions" scope does not support creating resources.</span>
        </div>
      )}

      {isReadOnly && (
        <div className="status-pill info mb-5" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderRadius: 'var(--radius-md)', fontSize: 13.5 }}>
          <Lock size={16} />
          <span>Your active directory role <strong>{user?.role}</strong> is restricted to read-only scopes. Write operations are disabled.</span>
        </div>
      )}

      <div className="grid-2">
        {/* Left column: VM management list */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <Cpu size={16} color="var(--azure-600)" />
              Virtual Machine Power States
            </h2>
          </div>
          <div className="card-body">
            <p className="card-subtitle mb-4">Start, stop, or reboot virtual servers deployed in this subscription.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {vms.length > 0 ? (
                vms.map(vm => {
                  const isLoading = actionLoading === vm.id;
                  const isRunning = vm.status === 'Running' || vm.status === 'Online';
                  
                  return (
                    <div className="card p-4" key={vm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-secondary)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{vm.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                          <span>{vm.resource_group}</span>
                          <span>•</span>
                          <span className={`status-pill ${isRunning ? 'healthy' : 'stopped'}`} style={{ padding: '1px 6px', fontSize: 10 }}>
                            {vm.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'start')}
                          title="Start VM"
                          aria-label="Start VM"
                        >
                          <Play size={14} color="#107C10" />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || !isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'stop')}
                          title="Stop VM"
                          aria-label="Stop VM"
                        >
                          <Square size={14} color="#D13438" />
                        </button>
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={isReadOnly || !isRunning || isLoading}
                          onClick={() => handleVmPowerAction(vm.id, 'restart')}
                          title="Restart VM"
                          aria-label="Restart VM"
                        >
                          <RotateCw size={14} color="#0078d4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><Cpu size={24} /></div>
                  <div className="empty-state-title">No VMs found</div>
                  <div className="empty-state-desc">No Virtual Machines discovered in this subscription.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Provisioning Wizards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── Student Environment Showcase Card ─────────────── */}
          <div className="card" style={{
            border: '1.5px solid rgba(0, 120, 212, 0.4)',
            background: 'linear-gradient(145deg, rgba(0,120,212,0.06) 0%, rgba(0,183,195,0.04) 100%)',
            boxShadow: '0 4px 32px rgba(0,120,212,0.12)'
          }}>
            {/* Header */}
            <div className="card-header" style={{ background: 'rgba(0,120,212,0.08)', borderBottom: '1px solid rgba(0,120,212,0.15)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#0078d4,#00B7C3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={18} color="white" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0078D4' }}>Student Environment</h3>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Azure for Students · Free-Tier Only</div>
                </div>
              </div>
              {/* Badges */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {[{icon: Award, label: 'Free Tier', color:'#107C10'},{icon: Shield, label:'Student Safe', color:'#0078D4'},{icon: CheckCircle, label:'Azure Verified', color:'#00B7C3'}].map(({icon: Icon, label, color}) => (
                  <span key={label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:700, color, background:`${color}18`, border:`1px solid ${color}30`, borderRadius:20, padding:'2px 10px' }}>
                    <Icon size={10} /> {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="card-body">
              {/* Architecture diagram */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color:'var(--text-tertiary)', letterSpacing:'0.06em', marginBottom: 10, textTransform:'uppercase' }}>Architecture</div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, overflowX:'auto', paddingBottom: 4 }}>
                  {/* Subscription box */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, color:'var(--text-tertiary)', fontWeight:600, textTransform:'uppercase' }}>Subscription</div>
                    <div style={{ border:'1.5px dashed rgba(0,120,212,0.4)', borderRadius:10, padding:'8px 10px', minWidth:80, textAlign:'center', fontSize:10, color:'var(--text-secondary)' }}>
                      <Globe size={14} color="#0078d4" style={{display:'block',margin:'0 auto 4px'}} />
                      {useAppStore.getState().subscriptions.find(s => s.id === activeSubscriptionId)?.name || 'Azure Subscription'}
                    </div>
                  </div>
                  <div style={{ width:24, height:2, background:'linear-gradient(90deg,#0078d4,#00B7C3)', margin:'0 4px', borderRadius:2 }} />
                  {/* Resource Group box */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                    <div style={{ fontSize:9, color:'var(--text-tertiary)', fontWeight:600, textTransform:'uppercase' }}>Resource Group</div>
                    <div style={{ border:'1.5px solid rgba(0,120,212,0.5)', borderRadius:10, background:'rgba(0,120,212,0.07)', padding:'6px 8px', minWidth:90, textAlign:'center', fontSize:10, color:'#0078d4', fontWeight:600 }}>
                      <Layers size={14} style={{display:'block',margin:'0 auto 4px'}} />
                      {studentRg ? studentRg.name.replace('rg-student-lab-','rg-…') : 'rg-student-lab'}
                    </div>
                    {/* Children */}
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <div style={{ width:1, height:14, background:'rgba(0,120,212,0.3)' }} />
                        <div style={{ border:'1px solid rgba(16,124,16,0.5)', borderRadius:8, background:'rgba(16,124,16,0.07)', padding:'5px 8px', textAlign:'center', fontSize:9, color:'#107C10', fontWeight:600 }}>
                          <Database size={12} style={{display:'block',margin:'0 auto 3px'}} />
                          Storage<br/>Standard LRS
                        </div>
                        {studentSa && <div style={{fontSize:8,color:'var(--text-tertiary)',marginTop:2}}>{(studentSa.status||'').toLowerCase()}</div>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                        <div style={{ width:1, height:14, background:'rgba(0,120,212,0.3)' }} />
                        <div style={{ border:'1px solid rgba(0,183,195,0.5)', borderRadius:8, background:'rgba(0,183,195,0.07)', padding:'5px 8px', textAlign:'center', fontSize:9, color:'#00B7C3', fontWeight:600 }}>
                          <Box size={12} style={{display:'block',margin:'0 auto 3px'}} />
                          Static<br/>Web App (Free)
                        </div>
                        {studentSwa && <div style={{fontSize:8,color:'var(--text-tertiary)',marginTop:2}}>{(studentSwa.status||'').toLowerCase()}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              {studentLabResources.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
                  {[
                    { label:'Resources', val: studentLabResources.length, icon: Layers, color:'#0078d4' },
                    { label:'Region', val: (studentRg?.location || studentSa?.location || '—').replace('southeastasia','SE Asia').replace('eastus','East US'), icon: MapPin, color:'#8b5cf6' },
                    { label:'Plan', val:'Free Tier', icon: Tag, color:'#107C10' },
                  ].map(({label,val,icon:Icon,color}) => (
                    <div key={label} style={{ background:'var(--bg-surface-secondary)', borderRadius:8, padding:'8px 10px', textAlign:'center', border:'1px solid var(--border-subtle)' }}>
                      <Icon size={13} color={color} style={{margin:'0 auto 4px',display:'block'}} />
                      <div style={{ fontSize:13, fontWeight:700, color }}>{val}</div>
                      <div style={{ fontSize:10, color:'var(--text-tertiary)', marginTop:2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approved services list */}
              <div style={{ background:'rgba(16,124,16,0.06)', border:'1px solid rgba(16,124,16,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12 }}>
                <div style={{ fontWeight:700, color:'#107C10', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                  <CheckCircle size={13} /> Approved Free-Tier Services Only
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['✓ 1 Resource Group','✓ Storage Account (Standard LRS)','✓ Static Web App (Free)'].map(s=><span key={s} style={{fontSize:11,color:'var(--text-secondary)'}}>{s}</span>)}
                </div>
              </div>

              {/* Blocked services list */}
              <div style={{ background:'rgba(209,52,56,0.06)', border:'1px solid rgba(209,52,56,0.2)', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12 }}>
                <div style={{ fontWeight:700, color:'#D13438', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                  <XCircle size={13} /> Blocked Paid Services
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {['✗ VMs','✗ AKS','✗ SQL DB','✗ Cosmos DB','✗ Key Vault','✗ VNet','✗ App Service (Paid)'].map(s=><span key={s} style={{fontSize:11,color:'var(--text-secondary)'}}>{s}</span>)}
                </div>
              </div>

              {/* Provision steps when loading */}
              {studentLoading && (
                <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:12, marginBottom:12 }}>
                  <div style={{ fontSize:10.5, fontWeight:700, color:'#0078d4', marginBottom:8, letterSpacing:'0.05em', textTransform:'uppercase' }}>ARM Provisioning Pipeline</div>
                  {[
                    'Verifying Subscription Eligibility',
                    'Creating Resource Group',
                    'Provisioning Storage Account (Standard LRS)',
                    'Deploying Static Web App (Free Tier)',
                  ].map((step, i) => (
                    <div key={step} style={{ display:'flex', justifyContent:'space-between', fontSize:11.5, marginBottom:5 }}>
                      <span style={{ color: i <= studentProvisionStep ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{i+1}. {step}</span>
                      <span style={{ fontWeight:700, color: i < studentProvisionStep ? '#107C10' : i === studentProvisionStep ? '#FFB900' : 'var(--text-tertiary)' }}>
                        {i < studentProvisionStep ? '✓ DONE' : i === studentProvisionStep ? '⏳ RUNNING' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Success summary */}
              {studentResult && !studentLoading && (
                <div style={{ background:'rgba(16,124,16,0.08)', border:'1px solid rgba(16,124,16,0.3)', borderRadius:8, padding:12, marginBottom:12 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#107C10', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><CheckCircle size={13} /> Deployment Succeeded</div>
                  <div style={{ fontSize:11.5, color:'var(--text-secondary)', display:'flex', flexDirection:'column', gap:3 }}>
                    <span>📁 {studentResult.resourceGroup}</span>
                    <span>💾 {studentResult.storageAccount}</span>
                    <span>🌐 {studentResult.staticWebApp}</span>
                    <span style={{ color:'var(--text-tertiary)', marginTop:4 }}>Region: {studentResult.location} · {new Date().toLocaleTimeString()}</span>
                  </div>
                </div>
              )}

              <button 
                onClick={handleCreateStudentLab}
                className="btn btn-primary" 
                disabled={isReadOnly || studentLoading}
                id="provision-student-lab-btn"
                style={{ width: '100%', background: 'linear-gradient(90deg,#0078D4,#00B7C3)', border: 'none', fontWeight:700, fontSize:14, padding:'10px 0' }}
              >
                {studentLoading ? (
                  <span style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                    <RefreshCw size={14} className="animate-spin" /> Provisioning Student Lab...
                  </span>
                ) : '🚀 Deploy Student Lab (Free Tier)'}
              </button>
            </div>
          </div>

          {/* 1. Create Resource Group */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <Layers size={16} color="var(--azure-600)" />
                Create Resource Group
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateRg} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <input
                    type="text"
                    placeholder="rg-project-environment"
                    value={rgName}
                    onChange={(e) => setRgName(e.target.value)}
                    disabled={isReadOnly || rgLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  />
                </div>
                <div>
                  <select
                    value={rgLocation}
                    onChange={(e) => setRgLocation(e.target.value)}
                    disabled={isReadOnly || rgLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia (Singapore)</option>
                    <option value="eastus">East US (Virginia)</option>
                    <option value="westus2">West US 2 (Washington)</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || rgLoading}
                  style={{ width: '100%' }}
                >
                  {rgLoading ? 'Creating...' : 'Provision Resource Group'}
                </button>
              </form>
            </div>
          </div>

          {/* 2. Create Storage Account */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <HardDrive size={16} color="#107C10" />
                Create Storage Account
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateSa} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="sauniquename"
                    value={saName}
                    onChange={(e) => setSaName(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  />
                  <select
                    value={saGroup}
                    onChange={(e) => setSaGroup(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  >
                    <option value="">Select Resource Group</option>
                    {resourceGroups.map(rg => (
                      <option key={rg} value={rg}>{rg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={saLocation}
                    onChange={(e) => setSaLocation(e.target.value)}
                    disabled={isReadOnly || saLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia</option>
                    <option value="eastus">East US</option>
                    <option value="westus2">West US 2</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || saLoading || !saGroup}
                  style={{ width: '100%' }}
                >
                  {saLoading ? 'Provisioning...' : 'Provision Storage Account'}
                </button>
              </form>
            </div>
          </div>

          {/* 3. Deploy Virtual Machine — Cost Protection Warning */}
          <div className="card" style={{ border: '1px solid rgba(255,185,0,0.3)' }}>
            <div className="card-header" style={{ background: 'rgba(255,185,0,0.05)' }}>
              <h3 className="card-title" style={{ color:'var(--text-primary)' }}>
                <Cpu size={16} color="var(--azure-600)" />
                Deploy Virtual Machine Wizard
              </h3>
            </div>
            <div className="card-body">
              <form onSubmit={handleDeployVm} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input
                    type="text"
                    placeholder="vm-web-staging"
                    value={vmName}
                    onChange={(e) => setVmName(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  />
                  <select
                    value={vmGroup}
                    onChange={(e) => setVmGroup(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                    required
                  >
                    <option value="">Select Resource Group</option>
                    {resourceGroups.map(rg => (
                      <option key={rg} value={rg}>{rg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    value={vmLocation}
                    onChange={(e) => setVmLocation(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="southeastasia">Southeast Asia (Singapore)</option>
                    <option value="eastus">East US (Virginia)</option>
                    <option value="westus2">West US 2 (Washington)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select
                    value={vmSize}
                    onChange={(e) => setVmSize(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="Standard_B2s">Standard_B2s (2 vCPU, 4GB RAM)</option>
                    <option value="Standard_D2s_v5">Standard_D2s_v5 (2 vCPU, 8GB RAM)</option>
                    <option value="Standard_D4s_v5">Standard_D4s_v5 (4 vCPU, 16GB RAM)</option>
                  </select>
                  <select
                    value={vmOs}
                    onChange={(e) => setVmOs(e.target.value)}
                    disabled={isReadOnly || vmLoading}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-secondary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="Ubuntu 22.04 LTS">Ubuntu 22.04 LTS</option>
                    <option value="Windows Server 2022">Windows Server 2022</option>
                  </select>
                </div>

                {/* Cost Protection Warning */}
                <div style={{
                  background: 'rgba(255,185,0,0.08)',
                  border: '1.5px solid rgba(255,185,0,0.4)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 12,
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700, color:'#FFB900', marginBottom:6 }}>
                    <AlertTriangle size={13} /> Cost Protection — Paid Resource
                  </div>
                  <div style={{ color:'var(--text-secondary)', lineHeight:1.5, marginBottom:6 }}>
                    Virtual Machines consume Azure credits. Student subscriptions have limited budgets.
                    Ensure you have sufficient quota before deploying.
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700 }}>
                    <span style={{ color:'var(--text-secondary)' }}>Estimated monthly cost:</span>
                    <span style={{ color:'#FFB900' }}>
                      {vmSize === 'Standard_B2s' ? '~$15/month' : vmSize === 'Standard_D2s_v5' ? '~$70/month' : '~$140/month'}
                    </span>
                  </div>
                </div>

                {/* Provisioning Stage View */}
                {vmLoading && (
                  <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0078d4', marginBottom: 4 }}>ARM PROVISIONING PIPELINE</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span>1. Request Validation</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>✓ COMPLETE</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span>2. Azure Authentication</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>✓ COMPLETE</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span>3. ARM Template Provisioning</span>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }} className="animate-pulse">⏳ IN PROGRESS</span>
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={isReadOnly || vmLoading || !vmGroup}
                  style={{ width: '100%' }}
                >
                  {vmLoading ? 'Deploying Bicep Template...' : 'Deploy Virtual Machine'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
