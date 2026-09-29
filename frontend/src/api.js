/*
 * Talking to the backend. Every request carries the saved token; a 401 signs
 * the person out, and a request made before a first-login password change is
 * sent to the change-password screen.
 */
import { API_BASE_URL } from "./config.js";

const TOKEN_KEY = "continuity.token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private window */ }
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;

  let payload;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(API_BASE_URL + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
  const detail = data && data.detail;

  if (response.status === 401 && token) {
    clearToken();
    window.dispatchEvent(new Event("continuity:signed-out"));
  }
  if (response.status === 403 && detail === "PASSWORD_CHANGE_REQUIRED") {
    window.dispatchEvent(new Event("continuity:password-change"));
  }
  if (!response.ok) {
    throw new ApiError(response.status, typeof detail === "string" ? detail : "Something went wrong.");
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body: body ?? {} }),
  put: (path, body) => request(path, { method: "PUT", body: body ?? {} }),
  del: (path) => request(path, { method: "DELETE" }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", form: { username: email, password } }),
};
