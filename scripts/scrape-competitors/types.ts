export type RequestConfig = {
  method?: "GET" | "POST";
  latParam: string;
  lngParam: string;
  radiusParam: string;
  radiusValue: number;
  radiusUnit?: "mi" | "km" | "m";
  extraParams?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Detected platform identifier (e.g. "stockist", "storepoint"). */
  platform?: string;
  /** When true, the API returns all locations in one call — skip the grid sweep. */
  singleCall?: boolean;
  /** Stored for UI/reference; not used by the scraper. */
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
  /** Dotted path to stores array. Empty string = response is the array itself. */
  storesJsonPath: string;
  /** Dotted path or key name of the unique ID field within each store object. */
  externalIdField?: string;
  fieldMappings: FieldMappings;
  /**
   * Optional hint that the `address` field is a single concatenated
   * "street, city, state, zip, country" string that should be split.
   */
  addressFormat?: "street-city-state-zip-country";
  /**
   * Response format. "json" (default) — parse body as JSON directly.
   * "jsonp" — body is wrapped in a `callback(...)` function call; the scraper
   * strips the wrapper before parsing.
   */
  responseFormat?: "json" | "jsonp";
};

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
};

export type GridPoint = {
  lat: number;
  lng: number;
};

export type StandardStore = {
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
  raw_json: unknown;
};

export type ScrapeStats = {
  grid_points: number;
  total_requests: number;
  unique_stores: number;
  error_count: number;
  matched_customers?: number;
};
