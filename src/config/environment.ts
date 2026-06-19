/**
 * Dynamic Environment Configuration & API Auto-Discovery
 */

// In production: use VITE_API_URL if set, otherwise use Render backend URL
// The backend is deployed separately on Render; the frontend is on Vercel.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? 'https://name-azure-cloudops-api.onrender.com'
    : ''); // Empty for local proxy

export const CURRENT_ENV = import.meta.env.DEV ? 'Development' : 'Production';
