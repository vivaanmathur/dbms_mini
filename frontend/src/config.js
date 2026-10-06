// The backend this build talks to. Override with VITE_API_URL if the API
// runs somewhere other than port 8000.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
