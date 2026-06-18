import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

declare global {
  interface Window {
    google?: any;
  }
}

export const isGoogleConfigured = !!(
  import.meta.env.VITE_GOOGLE_CLIENT_ID &&
  import.meta.env.VITE_GOOGLE_CLIENT_ID.trim() !== '' &&
  !import.meta.env.VITE_GOOGLE_CLIENT_ID.includes('YOUR_')
);

interface GoogleAuthContextType {
  isLoaded: boolean;
  googleLogin: () => Promise<{ email: string; name: string; googleId: string }>;
}

const GoogleAuthContext = createContext<GoogleAuthContextType | undefined>(undefined);

export function GoogleAuthProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Inject the Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setIsLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const googleLogin = (): Promise<{ email: string; name: string; googleId: string }> => {
    return new Promise((resolve, reject) => {
      if (!isLoaded || !window.google) {
        reject(new Error('Google Identity Services script is not loaded yet.'));
        return;
      }

      // Initialize the Google Sign-In client
      if (!isGoogleConfigured) {
        reject(new Error('Google Login Not Configured: VITE_GOOGLE_CLIENT_ID is missing or invalid.'));
        return;
      }
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              reject(tokenResponse);
              return;
            }

            // Fetch user profile info using the access token
            try {
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
              });
              const profile = await res.json();
              resolve({
                email: profile.email,
                name: profile.name,
                googleId: profile.sub
              });
            } catch (err) {
              reject(err);
            }
          }
        });
        client.requestAccessToken();
      } catch (err) {
        reject(err);
      }
    });
  };

  return (
    <GoogleAuthContext.Provider value={{ isLoaded, googleLogin }}>
      {children}
    </GoogleAuthContext.Provider>
  );
}

export function useGoogleAuth() {
  const context = useContext(GoogleAuthContext);
  if (!context) throw new Error('useGoogleAuth must be used within GoogleAuthProvider');
  return context;
}
