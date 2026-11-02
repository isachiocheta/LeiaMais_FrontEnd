import { normalizeApiBaseUrl } from './api-url.js';
import { createHttpClient } from './http-client.js';

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env ? import.meta.env.VITE_API_BASE_URL : undefined);
export const api = createHttpClient({ baseUrl: API_BASE_URL });
