export const AUTH_COOKIE = "fct_admin_token";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 8, // 8h, matches the API's JWT_EXPIRES_IN default
};
