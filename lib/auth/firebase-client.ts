"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from "firebase/app-check";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { establishBrowserSession } from "@/lib/mascot-generation/client";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseWebConfigured() {
  return Object.values(firebaseConfig).every(Boolean) && Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY);
}

function firebaseApp() {
  if (!isFirebaseWebConfigured()) throw new Error("A autenticação do Puleiro ainda não foi configurada.");
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let appCheck: AppCheck | undefined;

function firebaseAppCheck() {
  if (!appCheck) {
    appCheck = initializeAppCheck(firebaseApp(), {
      provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY!),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheck;
}

export async function signInAndCreateSession(email: string, password: string) {
  const auth = getAuth(firebaseApp());
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const [idToken, appCheck] = await Promise.all([
    credential.user.getIdToken(true),
    getToken(firebaseAppCheck(), false),
  ]);
  await establishBrowserSession(idToken, appCheck.token);
  return credential.user;
}

export async function refreshBrowserSession() {
  const auth = getAuth(firebaseApp());
  await auth.authStateReady();
  if (!auth.currentUser) return null;
  const [idToken, appCheck] = await Promise.all([
    auth.currentUser.getIdToken(),
    getToken(firebaseAppCheck(), false),
  ]);
  await establishBrowserSession(idToken, appCheck.token);
  return auth.currentUser;
}

export async function endBrowserSession() {
  await fetch("/api/auth/session", { method: "DELETE" });
  await signOut(getAuth(firebaseApp()));
}
