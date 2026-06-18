import { API_BASE_URL } from '../config/environment';

const API_BASE = API_BASE_URL;

export const isApiConfigValid = true;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface RequestOptions {
  body?: unknown;
  params?: Record<string, any>;
  signal?: AbortSignal;
}

class ApiService {
  private tokenProvider: (() => Promise<string | null>) | null = null;
  private azureTokenProvider: (() => Promise<string | null>) | null = null;
  private onUnauthorized: (() => void) | null = null;

  setTokenProvider(provider: () => Promise<string | null>) {
    this.tokenProvider = provider;
  }

  setAzureTokenProvider(provider: () => Promise<string | null>) {
    this.azureTokenProvider = provider;
  }

  setOnUnauthorized(handler: () => void) {
    this.onUnauthorized = handler;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let token: string | null = null;
    if (this.tokenProvider) {
      token = await this.tokenProvider();
    }

    if (!token) {
      token = localStorage.getItem('cloudops-local-token');
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (this.azureTokenProvider) {
      try {
        const azureToken = await this.azureTokenProvider();
        if (azureToken) {
          headers['X-Azure-Token'] = azureToken;
        }
      } catch (err) {
        console.warn('[API] Failed to retrieve Azure token:', err);
      }
    }

    return headers;
  }

  private buildUrl(path: string, params?: Record<string, any>): string {
    const base = API_BASE || window.location.origin;
    const url = new URL(path, base);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  async request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T> {
    const headers = await this.getHeaders();
    const url = this.buildUrl(path, options?.params);

    const response = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
      const isAuthError = response.status === 401 || 
                          (response.status === 403 && typeof errorBody.error === 'string' && errorBody.error.includes('Access Denied'));

      if (isAuthError && this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw new ApiError(
        errorBody.message || errorBody.error || `HTTP ${response.status}`,
        response.status,
        errorBody
      );
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) return undefined as T;

    return response.json();
  }

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PUT', path, { ...options, body });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }
}

export class ApiError extends Error {
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Singleton API service instance
export const api = new ApiService();
