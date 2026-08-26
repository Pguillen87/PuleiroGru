"use client";

const preferenceKey = "puleiro-session-preference";
const cookieName = "puleiro_session_mode";

export function clearSessionPreference() {
  window.localStorage.removeItem(preferenceKey);
  window.sessionStorage.removeItem(preferenceKey);
  document.cookie = `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0${location.protocol === "https:" ? "; Secure" : ""}`;
}
