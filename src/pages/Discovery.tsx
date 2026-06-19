import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle, AlertTriangle, Search, Loader } from 'lucide-react';
import { useCloudStore } from '../store/cloudStore';
import { api } from '../services/api';

export default function DiscoveryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const cloud = queryParams.get('cloud') || 'Azure';
  
  const { setHasSkippedOnboarding } = useCloudStore();
  
  const [step, setStep] = useState<'discovery' | 'success' | 'error' | 'aws_form'>('discovery');
  const [logs, setLogs] = useState<{ id: number, text: string, type: 'info' | 'success' | 'warn' | 'error' }[]>([]);
  const [progress, setProgress] = useState(0);
  
  // AWS form state
  const [awsAuthMethod, setAwsAuthMethod] = useState<'role' | 'credentials' | 'cloudformation'>('role');
  const [awsForm, setAwsForm] = useState({ 
    accountName: '', 
    accountId: '', 
    region: 'us-east-1', 
    roleArn: '',
    accessKeyId: '',
    secretAccessKey: '',
    sessionToken: ''
  });
  const [awsSubmitting, setAwsSubmitting] = useState(false);

  const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Date.now() + Math.random(), text, type }]);
  };

  const handleSuccess = async () => {
    try {
      await api.post('/api/auth/users/onboarding/complete');
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

  const handleAzureDiscovery = async () => {
    try {
      addLog('Authenticating with Microsoft Entra ID...', 'info');
      setProgress(10);
      
      // Auto-register Azure Subscriptions via the backend
      addLog('Fetching accessible Azure Subscriptions...', 'info');
      const subs = await api.get<any[]>('/api/subscriptions');
      setProgress(30);

      if (!subs || subs.length === 0) {
        addLog('No active Azure Subscriptions found for this user.', 'warn');
        handleSuccess();
        return;
      }

      addLog(`Found ${subs.length} Azure Subscriptions. Initiating API sync...`, 'info');
      setProgress(50);
      
      let syncedCount = 0;
      let totalResources = 0;

      for (let i = 0; i < subs.length; i++) {
        const sub = subs[i];
        addLog(`Syncing resources for Subscription: ${sub.name}...`, 'info');
        
        try {
          const result = await api.post<any>(`/api/subscriptions/${sub.id}/sync`);
          totalResources += result.resourceCount || 0;
          addLog(`✅ Synced ${result.resourceCount} resources for ${sub.name}`, 'success');
          syncedCount++;
        } catch (err: any) {
          addLog(`❌ Failed to sync ${sub.name}: ${err.message}`, 'error');
        }
        
        setProgress(50 + Math.floor(((i + 1) / subs.length) * 40));
      }

      setProgress(100);
      if (syncedCount > 0) {
        addLog(`Azure synchronization complete. Total resources: ${totalResources}`, 'success');
        setTimeout(() => {
          setHasSkippedOnboarding(true);
          handleSuccess();
        }, 1500);
      } else {
        addLog('Azure synchronization failed for all subscriptions.', 'error');
        setStep('error');
      }

    } catch (err: any) {
      console.error("Azure Discovery API Error", err);
      console.error("Response", err.details || err?.response?.data);
      
      const errorMsg = 
        err.details?.message || 
        err.details?.error || 
        err?.response?.data?.message || 
        err?.response?.data?.error || 
        err.message || 
        JSON.stringify(err);

      addLog(`Azure discovery failed: ${errorMsg}`, 'error');
      setStep('error');
    }
  };

  const handleAwsDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setAwsSubmitting(true);
    setStep('discovery');
    setProgress(10);
    
    try {
      addLog(`Validating AWS IAM Role access for ${awsForm.accountName}...`, 'info');
      
      console.log("AWS Discovery Payload", {
        accountName: awsForm.accountName,
        region: awsForm.region,
        authMethod: awsAuthMethod,
        hasAccessKey: !!awsForm.accessKeyId,
        hasSecretKey: !!awsForm.secretAccessKey
      });

      // Call backend to create and validate AWS account
      const newAccount = await api.post<any>('/api/cloud-accounts/aws', {
        accountName: awsForm.accountName,
        accountId: awsForm.accountId,
        region: awsForm.region,
        authMethod: awsAuthMethod,
        roleArn: awsAuthMethod === 'role' ? awsForm.roleArn : undefined,
        accessKeyId: awsAuthMethod === 'credentials' ? awsForm.accessKeyId : undefined,
        secretAccessKey: awsAuthMethod === 'credentials' ? awsForm.secretAccessKey : undefined,
        sessionToken: awsAuthMethod === 'credentials' ? awsForm.sessionToken : undefined
      });
      
      console.log("AWS Discovery Response", newAccount);

      if (newAccount.alreadyConnected) {
        addLog('AWS account already connected', 'success');
        
        try {
          const updatedAccounts = await api.get<any[]>('/api/cloud-accounts');
          useCloudStore.getState().setCloudAccounts(updatedAccounts);
        } catch (e) {
          console.warn('Failed to refresh cloud accounts', e);
        }

        setHasSkippedOnboarding(true);
        setTimeout(() => navigate('/'), 1500);
        return;
      }
      
      setProgress(40);
      addLog('AWS Account validated and registered successfully.', 'success');
      addLog('Initiating AWS Resource Groups Tagging API sync...', 'info');

      // Trigger sync
      const syncResult = await api.post<any>(`/api/cloud-accounts/${newAccount.id}/sync`);
      setProgress(90);
      
      addLog(`✅ Synced ${syncResult.syncedCount || 0} resources across AWS services`, 'success');
      setProgress(100);
      
      setTimeout(() => {
        setHasSkippedOnboarding(true);
        handleSuccess();
      }, 1500);
      
    } catch (err: any) {
      console.error("AWS Discovery API Error", err);
      console.error("AWS Discovery Failure", err.details || err?.response?.data);
      
      const errorMsg = 
        err.details?.message || 
        err.details?.error || 
        err?.response?.data?.message || 
        err?.response?.data?.error || 
        err.message || 
        JSON.stringify(err);

      addLog(`AWS discovery failed: ${errorMsg}`, 'error');
      setStep('error');
    } finally {
      setAwsSubmitting(false);
    }
  };

  useEffect(() => {
    if (cloud === 'Azure') {
      handleAzureDiscovery();
    } else if (cloud === 'AWS') {
      setStep('aws_form');
    } else {
      addLog(`GCP Discovery not yet implemented.`, 'warn');
      setStep('error');
    }
  }, [cloud]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% -20%, #1a1e36, #0c0f1d 80%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px', zIndex: 0 }} />
      
      <div style={{ width: '100%', maxWidth: 700, zIndex: 10, padding: 24 }}>
        
        {step === 'aws_form' && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 48, border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Connect AWS Account</h2>
            <p style={{ color: '#a0aec0', marginBottom: 24 }}>Select your preferred authentication method to connect your AWS environment.</p>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 12 }}>
              <button 
                type="button"
                onClick={() => setAwsAuthMethod('role')}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: awsAuthMethod === 'role' ? 'rgba(255,255,255,0.1)' : 'transparent', color: awsAuthMethod === 'role' ? '#fff' : '#a0aec0', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                IAM Role (Recommended)
              </button>
              <button 
                type="button"
                onClick={() => setAwsAuthMethod('credentials')}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: awsAuthMethod === 'credentials' ? 'rgba(255,255,255,0.1)' : 'transparent', color: awsAuthMethod === 'credentials' ? '#fff' : '#a0aec0', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                IAM User Credentials
              </button>
              <button 
                type="button"
                onClick={() => setAwsAuthMethod('cloudformation')}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: awsAuthMethod === 'cloudformation' ? 'rgba(255,255,255,0.1)' : 'transparent', color: awsAuthMethod === 'cloudformation' ? '#fff' : '#a0aec0', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
                CloudFormation Setup
              </button>
            </div>

            {awsAuthMethod === 'cloudformation' ? (
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: 24, borderRadius: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Automated Role Creation</h3>
                <p style={{ color: '#a0aec0', fontSize: 14, marginBottom: 16 }}>Use this CloudFormation template to create the necessary cross-account IAM role with ReadOnlyAccess.</p>
                <pre style={{ background: '#0d1117', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 13, color: '#c9d1d9', lineHeight: 1.5 }}>
{`AWSTemplateFormatVersion: '2010-09-09'
Description: 'CloudOps Discovery Role'
Resources:
  CloudOpsDiscoveryRole:
    Type: 'AWS::IAM::Role'
    Properties:
      RoleName: CloudOpsDiscoveryRole
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              AWS: 'arn:aws:iam::YOUR_ACCOUNT_ID:root'
            Action: 'sts:AssumeRole'
      ManagedPolicyArns:
        - 'arn:aws:iam::aws:policy/ReadOnlyAccess'`}
                </pre>
                <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setAwsAuthMethod('role')} style={{ background: '#0078d4', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                    I have created the role
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAwsDiscovery} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Account Name</label>
                  <input required type="text" value={awsForm.accountName} onChange={e => setAwsForm({...awsForm, accountName: e.target.value})} placeholder="e.g. Production AWS" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                </div>
                
                {awsAuthMethod === 'role' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>AWS Account ID (Optional)</label>
                      <input type="text" value={awsForm.accountId} onChange={e => setAwsForm({...awsForm, accountId: e.target.value})} placeholder="123456789012" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Primary Region</label>
                      <input required type="text" value={awsForm.region} onChange={e => setAwsForm({...awsForm, region: e.target.value})} placeholder="us-east-1" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>IAM Role ARN</label>
                      <input required type="text" value={awsForm.roleArn} onChange={e => setAwsForm({...awsForm, roleArn: e.target.value})} placeholder="arn:aws:iam::123456789012:role/CloudOpsDiscoveryRole" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                  </>
                )}

                {awsAuthMethod === 'credentials' && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Primary Region</label>
                      <input required type="text" value={awsForm.region} onChange={e => setAwsForm({...awsForm, region: e.target.value})} placeholder="us-east-1" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Access Key ID</label>
                      <input required type="text" value={awsForm.accessKeyId} onChange={e => setAwsForm({...awsForm, accessKeyId: e.target.value})} placeholder="AKIAIOSFODNN7EXAMPLE" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Secret Access Key</label>
                      <input required type="password" value={awsForm.secretAccessKey} onChange={e => setAwsForm({...awsForm, secretAccessKey: e.target.value})} placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>Session Token (Optional - for temporary credentials)</label>
                      <input type="password" value={awsForm.sessionToken} onChange={e => setAwsForm({...awsForm, sessionToken: e.target.value})} placeholder="IQoJb3JpZ2luX2Vj..." className="form-input" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: '#fff' }} />
                    </div>
                  </>
                )}

                <button type="submit" disabled={awsSubmitting} style={{ marginTop: 16, background: '#FF9900', color: '#fff', border: 'none', padding: '12px', borderRadius: 8, fontWeight: 600, cursor: awsSubmitting ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center' }}>
                  {awsSubmitting ? <Loader className="animate-spin" size={20} /> : 'Discover AWS Resources'}
                </button>
              </form>
            )}
          </div>
        )}

        {(step === 'discovery' || step === 'error') && (
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 48, border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Scanning {cloud} Environments</h2>
              <p style={{ color: '#a0aec0' }}>Please wait while we map your cloud architecture...</p>
            </div>
            
            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 40px' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle cx="60" cy="60" r="54" fill="none" stroke={step === 'error' ? '#D13438' : '#0078d4'} strokeWidth="6" strokeDasharray="339.29" strokeDashoffset={339.29 - (339.29 * progress) / 100} style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>
                {progress}%
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 24, height: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {logs.map((log) => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'slideInRight 0.3s ease-out' }}>
                  {log.type === 'success' && <CheckCircle size={16} color="#107C10" />}
                  {log.type === 'info' && <Search size={16} color="#0078d4" className="animate-pulse" />}
                  {log.type === 'warn' && <AlertTriangle size={16} color="#FFB900" />}
                  {log.type === 'error' && <AlertTriangle size={16} color="#D13438" />}
                  <span style={{ fontSize: 14, color: log.type === 'warn' ? '#FFB900' : log.type === 'error' ? '#fca5a5' : '#e2e8f0' }}>{log.text}</span>
                </div>
              ))}
            </div>
            
            {step === 'error' && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <button onClick={() => window.location.href = '/'} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer' }}>Return to Dashboard</button>
              </div>
            )}
          </div>
        )}

        {step === 'success' && (
          <div style={{ textAlign: 'center', animation: 'scaleIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
            <div style={{ width: 80, height: 80, margin: '0 auto 24px', background: 'rgba(16,124,16,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={40} color="#107C10" />
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16 }}>Setup Complete</h2>
            <p style={{ fontSize: 16, color: '#a0aec0', marginBottom: 40 }}>Your enterprise cloud footprint has been successfully mapped.</p>
            
            <button onClick={() => window.location.href = '/'} className="btn" style={{ height: 56, fontSize: 16, background: '#0078d4', color: '#fff', border: 'none', padding: '0 48px', borderRadius: 12 }}>
              Launch CloudOps
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
