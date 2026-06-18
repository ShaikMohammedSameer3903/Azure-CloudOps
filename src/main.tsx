import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MsalProvider } from '@azure/msal-react'
import { AuthProvider } from './providers/AuthProvider'
import { ThemeProvider } from './providers/ThemeProvider'
import './index.css'
import App from './App.tsx'

import { GoogleAuthProvider } from './providers/GoogleAuthProvider'
import { msalInstance, configureMsalCallbacks } from './config/msalInstance'
import { initTelemetry } from './telemetry'

// Initialize OpenTelemetry
initTelemetry();

/**
 * Initialize MSAL and render the React app.
 * MSAL's <MsalProvider> automatically handles handleRedirectPromise() 
 * under the hood when the components mount, avoiding duplicate call 
 * conflicts and token request cache errors.
 */
msalInstance.initialize().then(() => {
  configureMsalCallbacks();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <GoogleAuthProvider>
          <ThemeProvider>
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </ThemeProvider>
        </GoogleAuthProvider>
      </MsalProvider>
    </StrictMode>,
  );
}).catch((err) => {
  console.error('[MSAL] Global initialization failed:', err);
});
