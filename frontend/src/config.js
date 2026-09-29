// The backend this build talks to. The restructure branch runs its own API on
// port 8001 so that main, on 8000, keeps working untouched.
export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
