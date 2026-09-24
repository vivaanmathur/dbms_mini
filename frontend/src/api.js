// Small helper so every page does not have to repeat the fetch() code.
import { API_BASE_URL } from "./config.js";

export function getToken() {
  return localStorage.getItem("authToken");
}

export function getMyName() {
  return localStorage.getItem("myName") || "";
}

// The faculty_id of the teacher who is logged in. We need it to know which
// boxes on the timetable are "my" lectures (only those can be cancelled).
export function getMyFacultyId() {
  return Number(localStorage.getItem("myFacultyId"));
}

export function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("myName");
  localStorage.removeItem("myFacultyId");
}

// GET something from the backend
export async function apiGet(path) {
  const response = await fetch(API_BASE_URL + path, {
    headers: { Authorization: "Bearer " + getToken() },
  });
  if (response.status === 401) {
    logout();
    window.location.href = "/login";
    return null;
  }
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Could not load data");
  }
  return data;
}

// POST something to the backend
export async function apiPost(path, body) {
  const response = await fetch(API_BASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken(),
    },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Something went wrong");
  }
  return data;
}
