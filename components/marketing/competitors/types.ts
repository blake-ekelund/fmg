export type Competitor = {
  id: string;
  name: string;
  base_url: string;
  endpoint_path: string;
  request_config: RequestConfig;
  response_config: ResponseConfig;
  rate_limit_ms: number;
  user_agent: string;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestConfig = {
  method?: "GET" | "POST";
  latParam: string;
  lngParam: string;
  radiusParam: string;
  radiusValue: number;
  radiusUnit?: "mi" | "km" | "m";
  extraParams?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  platform?: string;
  singleCall?: boolean;
  originalLocatorUrl?: string;
};

export type FieldMappings = {
  store_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  latitude?: string;
  longitude?: string;
};

export type ResponseConfig = {
  storesJsonPath: string;
  externalIdField?: string;
  fieldMappings: FieldMappings;
  addressFormat?: "street-city-state-zip-country";
  responseFormat?: "json" | "jsonp";
};

export type ScrapeRun = {
  id: string;
  competitor_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed" | "aborted";
  grid_points: number;
  total_requests: number;
  unique_stores: number;
  error_count: number;
  matched_customers: number;
  notes: string | null;
};

export type CompetitorStore = {
  id: string;
  run_id: string;
  competitor_id: string;
  external_id: string | null;
  store_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  matched_customer_id: string | null;
  matched_customer_name: string | null;
  match_score: number | null;
  match_source: "billing" | "shipping" | null;
  scraped_at: string;
};

