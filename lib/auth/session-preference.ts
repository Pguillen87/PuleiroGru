"use client";

const preferenceKey = "puleiro-session-preference";
const cookieName = "puleiro_session_mode";

export function saveSessionPreference(remember: boolean) {
  const mode = remember ? "persistent" : "session";
  window.localStorage.setItem(preferenceKey, mode);
  document.cookie = `${cookieName}=${mode}; Path=/; SameSite=Lax${remember ? "; Max-Age=31536000" : ""}${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function shouldEndSessionAfterBrowserClose() {
  return window.localStorage.getItem(preferenceKey) === "session" && !readCookie(cookieName);
}

export function defaultPersistentSessionPreference() {
  if (window.localStorage.getItem(preferenceKey)) return;
  saveSessionPreference(true);
}

export function clearSessionPreference() {
  window.localStorage.removeItem(preferenceKey);
  document.cookie = `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0${location.protocol === "https:" ? "; Secure" : ""}`;
}

function readCookie(name: string) {
  return document.cookie.split("; ").some((entry) => entry.startsWith(`${name}=`));
}
