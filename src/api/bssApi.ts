import type {
  LoginRequest,
  LoginResponse,
  Partner,
  CreatePartnerPayload,
  UpdatePartnerPayload,
  ApiResponse,
  ApiLog,
  PlanSyncResponse,
  InternetPlan,
  SaveInternetPlanMappingPayload,
  IptvPlan,
  SaveIptvPlanMappingPayload,
} from '../types';

export const DEFAULT_API_BASE = '/b_bss'; // Uses Vite proxy in development
export const DIRECT_API_BASE = 'https://demo.onebss.in/b_bss';

// Custom event system to notify UI of API calls for the live log console
type ApiLogListener = (log: ApiLog) => void;
const logListeners: Set<ApiLogListener> = new Set();

export const subscribeToApiLogs = (listener: ApiLogListener): (() => void) => {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
};

const notifyLog = (log: ApiLog) => {
  logListeners.forEach((fn) => fn(log));
};

export class BssApiClient {
  private static tokenKey = 'onebss_token';
  private static baseUrlKey = 'onebss_base_url';

  static getBaseUrl(): string {
    return localStorage.getItem(this.baseUrlKey) || DEFAULT_API_BASE;
  }

  static setBaseUrl(url: string): void {
    localStorage.setItem(this.baseUrlKey, url.replace(/\/+$/, ''));
  }

  static getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  static setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  static removeToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  private static async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const token = this.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const startTime = performance.now();
    let responseStatus = 0;
    let responseData: any = null;

    const parseBodySafely = (body?: BodyInit | null) => {
      if (!body || typeof body !== 'string') return undefined;
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      responseStatus = response.status;
      const text = await response.text();

      try {
        responseData = text ? JSON.parse(text) : {};
      } catch {
        responseData = { message: text || 'Non-JSON response received' };
      }

      const durationMs = Math.round(performance.now() - startTime);

      notifyLog({
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString(),
        method: (options.method as any) || 'GET',
        url,
        status: responseStatus,
        durationMs,
        requestBody: parseBodySafely(options.body),
        responseBody: responseData,
        success: response.ok && responseData?.success !== false,
      });

      if (!response.ok) {
        throw new Error(responseData?.message || `HTTP Error ${response.status}: ${response.statusText}`);
      }

      return responseData as ApiResponse<T>;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      if (responseStatus === 0) {
        // Network or CORS error
        notifyLog({
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          method: (options.method as any) || 'GET',
          url,
          status: 0,
          durationMs,
          requestBody: parseBodySafely(options.body),
          responseBody: { error: err.message },
          success: false,
        });
      }
      throw err;
    }
  }

  // 1. Login API: POST /login.php
  static async login(credentials: LoginRequest): Promise<LoginResponse> {
    const res = await this.request<any>('/login.php', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    const loginRes = res as unknown as LoginResponse;
    if (loginRes.token) {
      this.setToken(loginRes.token);
    }
    return loginRes;
  }

  // 2. List Partners: GET /partner.php?role=operator|admin
  static async getPartners(role?: string): Promise<Partner[]> {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    const res = await this.request<Partner[]>(`/partner.php${query}`, {
      method: 'GET',
    });
    return (res.data || []) as Partner[];
  }

  // 3. Get Partner Details: GET /partner.php?id=...
  static async getPartnerById(id: number | string): Promise<Partner> {
    const res = await this.request<Partner>(`/partner.php?id=${encodeURIComponent(id)}`, {
      method: 'GET',
    });
    return res.data as Partner;
  }

  // 4. Create Partner: POST /partner.php
  static async createPartner(payload: CreatePartnerPayload): Promise<ApiResponse> {
    return await this.request('/partner.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // 5. Update Partner: PUT /partner.php?id=...
  static async updatePartner(
    id: number | string,
    payload: UpdatePartnerPayload
  ): Promise<ApiResponse> {
    return await this.request(`/partner.php?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  // 6. Sync Internet Plans: POST /internet_plan_sync.php
  static async syncInternetPlans(partnerId?: number | string): Promise<PlanSyncResponse> {
    const query = partnerId ? `?partner_id=${encodeURIComponent(partnerId)}` : '';
    const res = await this.request<any>(`/internet_plan_sync.php${query}`, {
      method: 'POST',
      body: '',
    });
    return res as unknown as PlanSyncResponse;
  }

  // 7. Get Internet Plan Mapping: GET /internet_plan_mapping.php?partner_id=...
  static async getInternetPlanMapping(partnerId: number | string): Promise<InternetPlan[]> {
    const res = await this.request<InternetPlan[]>(
      `/internet_plan_mapping.php?partner_id=${encodeURIComponent(partnerId)}`,
      {
        method: 'GET',
      }
    );
    return (res.data || []) as InternetPlan[];
  }

  // 8. Save Internet Plan Mapping: POST /internet_plan_mapping.php
  static async saveInternetPlanMapping(
    payload: SaveInternetPlanMappingPayload
  ): Promise<ApiResponse> {
    return await this.request('/internet_plan_mapping.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // 9. Sync IPTV Plans: POST /iptv_plan_sync.php?partner_id=...
  static async syncIptvPlans(partnerId: number | string): Promise<PlanSyncResponse> {
    const res = await this.request<any>(
      `/iptv_plan_sync.php?partner_id=${encodeURIComponent(partnerId)}`,
      {
        method: 'POST',
        body: '',
      }
    );
    return res as unknown as PlanSyncResponse;
  }

  // 10. Get IPTV Plan Mapping: GET /iptv_plan_mapping.php?partner_id=...
  static async getIptvPlanMapping(partnerId: number | string): Promise<IptvPlan[]> {
    const res = await this.request<IptvPlan[]>(
      `/iptv_plan_mapping.php?partner_id=${encodeURIComponent(partnerId)}`,
      {
        method: 'GET',
      }
    );
    return (res.data || []) as IptvPlan[];
  }

  // 11. Save IPTV Plan Mapping: POST /iptv_plan_mapping.php
  static async saveIptvPlanMapping(
    payload: SaveIptvPlanMappingPayload
  ): Promise<ApiResponse> {
    return await this.request('/iptv_plan_mapping.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Helper to decode JWT token
  static decodeJwt(token: string) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}
