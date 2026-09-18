export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  expires_in?: number;
}

export interface DecodedJwt {
  partner_id?: number;
  partner_name?: string;
  company_name?: string;
  mobile?: string;
  role?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export interface InternetMapping {
  internet_base_url?: string | null;
  internet_token?: string | null;
  internet_partner_id?: string | null;
  internet_branch_id?: string | null;
}

export interface IptvMapping {
  iptv_base_url?: string | null;
  iptv_key?: string | null;
  iptv_operator_id?: string | number | null;
}

export interface PartnerCredentials {
  username: string;
  password: string;
  role: 'operator' | 'admin' | string;
}

export interface Partner {
  partner_id: number;
  partner_name: string;
  company_name: string;
  partner_mobile: string;
  partner_email: string;
  partner_region: string;
  status?: string;
  created_by?: number;
  account_username?: string;
  account_role?: 'operator' | 'admin' | string;
  
  // Flattened mapping returned from list API
  internet_base_url?: string | null;
  internet_token?: string | null;
  internet_partner_id?: string | null;
  internet_branch_id?: string | null;
  iptv_base_url?: string | null;
  iptv_key?: string | null;
  iptv_operator_id?: string | number | null;
}

export interface CreatePartnerPayload {
  partner_name: string;
  company_name: string;
  partner_mobile: string;
  partner_email: string;
  partner_region: string;
  login: PartnerCredentials;
  internet_mapping: InternetMapping;
  iptv_mapping: IptvMapping;
}

export interface UpdatePartnerPayload {
  partner_name: string;
  company_name: string;
  partner_mobile: string;
  partner_email: string;
  partner_region: string;
  internet_mapping: InternetMapping;
  iptv_mapping: IptvMapping;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface ApiLog {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  status: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  success: boolean;
}
