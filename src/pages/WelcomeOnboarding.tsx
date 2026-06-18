// ============================================================
// Intelligent First Run Experience (CloudOps V4)
// Welcome Gateway
// ============================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, Cpu, Box, ArrowRight, Zap } from 'lucide-react';
import { useCloudStore } from '../store/cloudStore';

export default function WelcomeOnboarding() {
  const navigate = useNavigate();
  const { setHasSkippedOnboarding } = useCloudStore();
  
  const handleSkip = () => {
    setHasSkippedOnboarding(true);
    navigate('/');
  };

  const startDiscovery = (cloud: 'Azure' | 'AWS' | 'GCP') => {
    navigate(`/discovery?cloud=${cloud}`);
  };

  return (
    <div className="welcome-container">
      {/* Animated Background Gradients & Particles */}
      <div className="bg-gradient-1" />
      <div className="bg-gradient-2" />
      <div className="grid-overlay" />

      <div className="welcome-card">
        <div className="welcome-content">
          <div className="icon-container">
            <Cloud size={40} className="icon-cloud" strokeWidth={1.5} />
          </div>
          
          <h1 className="welcome-title">
            Welcome to CloudOps Enterprise
          </h1>
          
          <p className="welcome-subtitle">
            Let's connect your cloud environments. We will automatically discover your subscriptions, resources, and security posture in real-time.
          </p>
          
          <div className="eta-badge">
            <Zap size={14} className="eta-icon" />
            <span>Estimated setup time: 2 minutes</span>
          </div>

          <div className="btn-group" role="group" aria-label="Cloud Provider Selection">
            <button onClick={() => startDiscovery('Azure')} aria-label="Connect Azure Environment" tabIndex={0} className="btn btn-azure">
              <div className="btn-left">
                <div className="provider-icon-wrapper"><Cloud size={20} aria-hidden="true" /></div>
                <span>Connect Azure</span>
              </div>
              <ArrowRight size={18} className="arrow-icon" aria-hidden="true" />
            </button>

            <button onClick={() => startDiscovery('AWS')} aria-label="Connect AWS Environment" tabIndex={0} className="btn btn-aws">
              <div className="btn-left">
                <div className="provider-icon-wrapper"><Cpu size={20} color="#FF9900" aria-hidden="true" /></div>
                <span>Connect AWS</span>
              </div>
              <ArrowRight size={18} color="#FF9900" className="arrow-icon" aria-hidden="true" />
            </button>

            <button onClick={() => startDiscovery('GCP')} aria-label="Connect GCP Environment" tabIndex={0} className="btn btn-gcp">
              <div className="btn-left">
                <div className="provider-icon-wrapper"><Box size={20} color="#4285F4" aria-hidden="true" /></div>
                <span>Connect GCP</span>
              </div>
              <ArrowRight size={18} color="#4285F4" className="arrow-icon" aria-hidden="true" />
            </button>
          </div>

          <button onClick={handleSkip} aria-label="Skip cloud provider connection for now" tabIndex={0} className="skip-btn">
            Skip for now
          </button>
        </div>
      </div>
      
      <style>{`
        .welcome-container {
          min-height: 100vh;
          background: #0B1121;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
          position: relative;
          overflow: hidden;
        }

        .bg-gradient-1 {
          position: absolute;
          top: -10%; left: -10%;
          width: 60%; height: 60%;
          background: radial-gradient(circle, rgba(0, 120, 212, 0.15) 0%, transparent 60%);
          filter: blur(100px);
          z-index: 0;
          animation: float 15s ease-in-out infinite alternate;
        }

        .bg-gradient-2 {
          position: absolute;
          bottom: -10%; right: -10%;
          width: 60%; height: 60%;
          background: radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 60%);
          filter: blur(100px);
          z-index: 0;
          animation: float 20s ease-in-out infinite alternate-reverse;
        }

        .grid-overlay {
          position: absolute; inset: 0;
          opacity: 0.15;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px), 
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 50px 50px;
          z-index: 0;
          mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
          -webkit-mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
        }

        .welcome-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 580px;
          padding: 2rem;
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .welcome-content {
          background: rgba(17, 24, 39, 0.6);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 3rem 2rem;
          text-align: center;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.1);
        }

        .icon-container {
          width: 72px; height: 72px;
          margin: 0 auto 1.5rem;
          background: linear-gradient(135deg, rgba(0, 120, 212, 0.2), rgba(0, 183, 195, 0.05));
          border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid rgba(0, 120, 212, 0.3);
          box-shadow: 0 0 30px rgba(0, 120, 212, 0.2);
          position: relative;
        }
        
        .icon-container::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(0,120,212,0.5), transparent);
          z-index: -1;
          filter: blur(4px);
        }

        .icon-cloud { color: #60A5FA; }

        .welcome-title {
          font-size: 2.25rem;
          font-weight: 800;
          margin-bottom: 1rem;
          letter-spacing: -0.03em;
          background: linear-gradient(to right, #ffffff, #a5b4fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .welcome-subtitle {
          font-size: 1.05rem;
          color: #9ca3af;
          margin-bottom: 2rem;
          line-height: 1.6;
          max-width: 480px;
          margin-left: auto; margin-right: auto;
        }

        .eta-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(139, 92, 246, 0.1);
          padding: 0.4rem 1rem;
          border-radius: 999px;
          margin-bottom: 2.5rem;
          border: 1px solid rgba(139, 92, 246, 0.2);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);
        }
        
        .eta-badge span {
          font-size: 0.85rem;
          color: #c4b5fd;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .eta-icon { color: #a78bfa; }

        .btn-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 420px;
          margin: 0 auto;
        }

        .btn {
          height: 60px;
          font-size: 1rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1.5rem;
          border-radius: 16px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          overflow: hidden;
          outline: none;
        }

        .btn:focus-visible { outline: 2px solid #0078d4; outline-offset: 2px; }

        .btn-left {
          display: flex;
          align-items: center;
          gap: 1rem;
          z-index: 1;
        }

        .provider-icon-wrapper {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          border-radius: 10px;
          background: rgba(255,255,255,0.1);
        }

        .arrow-icon {
          z-index: 1;
          transition: transform 0.3s ease;
        }

        .btn:hover .arrow-icon { transform: translateX(4px); }

        /* Azure Button */
        .btn-azure {
          background: rgba(0, 120, 212, 0.9);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 24px rgba(0, 120, 212, 0.3);
        }
        .btn-azure:hover { background: #0078d4; transform: translateY(-2px); box-shadow: 0 12px 30px rgba(0, 120, 212, 0.4); }

        /* AWS Button */
        .btn-aws {
          background: rgba(31, 41, 55, 0.6);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .btn-aws:hover { background: rgba(255, 153, 0, 0.15); border-color: rgba(255, 153, 0, 0.3); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(255, 153, 0, 0.15); }

        /* GCP Button */
        .btn-gcp {
          background: rgba(31, 41, 55, 0.6);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .btn-gcp:hover { background: rgba(66, 133, 244, 0.15); border-color: rgba(66, 133, 244, 0.3); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(66, 133, 244, 0.15); }

        .skip-btn {
          margin-top: 2rem;
          background: transparent;
          border: none;
          color: #6b7280;
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s;
          padding: 0.5rem 1rem;
          border-radius: 8px;
        }
        .skip-btn:hover { color: #d1d5db; background: rgba(255,255,255,0.05); }
        .skip-btn:focus-visible { outline: 2px solid #6b7280; }

        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(30px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        @keyframes float {
          0% { transform: translate(0px, 0px) scale(1); }
          100% { transform: translate(30px, 50px) scale(1.1); }
        }
      `}</style>
    </div>
  );
}
