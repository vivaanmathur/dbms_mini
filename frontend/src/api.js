// Small helper so every page does not repeat the fetch() code.
import { API_BASE_URL } from "./config.js";

export function getToken() { return localStorage.getItem("authToken"); }
export function getMyName() { return localStorage.getItem("myName") || ""; }
export function getMyFacultyId() { return Number(localStorage.getItem("myFacultyId")); }

export function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("myName");
  localStorage.removeItem("myFacultyId");
}

async function request(path, options = {}) {
  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken(),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401) {
    logout();
    window.location.href = "/login";
    return null;
  }

  // 204 and friends have no body to read
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error((data && data.detail) || "Something went wrong");
  }
  return data;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, body) {
  return request(path, { method: "POST", body: JSON.stringify(body || {}) });
}

export function apiDelete(path) {
  return request(path, { method: "DELETE" });
}
