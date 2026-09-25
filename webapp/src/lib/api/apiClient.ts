import axios from "axios";
import { getApiUrl } from "./apiUrl";

/**
 * Pre-configured Axios instance for TakeoutFix API calls.
 * Automatically resolves relative paths (e.g. `/api/dev-log`) to the Cloudflare backend.
 */
export const apiClient = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Interceptor to automatically route relative `/api/...` endpoints through getApiUrl()
apiClient.interceptors.request.use((config) => {
  if (config.url && (config.url.startsWith("/api/") || config.url.startsWith("api/"))) {
    config.url = getApiUrl(config.url);
  }
  return config;
});

export default apiClient;
