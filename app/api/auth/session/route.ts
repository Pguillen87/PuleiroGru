import { NextResponse } from "next/server";
import { authErrorResponse, createBrowserSession, FIREBASE_SESSION_COOKIE } from "@/lib/auth/browser-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { sessionCookie } = await createBrowserSession(
      request.headers.get("authorization"),
      request.headers.get("x-firebase-appcheck"),
    );
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set({
      name: FIREBASE_SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 5,
    });
    return response;
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ message: "Não foi possível iniciar a sessão.", code: "SESSION_FAILED" }, { status: 503 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set({ name: FIREBASE_SESSION_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
