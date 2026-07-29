import { cookies } from "next/headers";

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7;

export function getCookieName(): string {
  const name = process.env.COOKIE_NAME;
  if (!name) {
    throw new Error("COOKIE_NAME environment variable is not set");
  }
  return name;
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS_IN_SECONDS,
  });
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(getCookieName());
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(getCookieName())?.value;
}
