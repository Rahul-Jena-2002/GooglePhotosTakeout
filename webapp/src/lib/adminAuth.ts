/**
 * Centralized Super Admin Helper Module
 * Reads super admin email dynamically from environment variable
 * PUBLIC_SUPER_ADMIN_EMAIL (set in Cloudflare Pages / .env) with fallback.
 */

export const getSuperAdminEmail = (): string => {
  const envEmail = (
    import.meta.env?.PUBLIC_SUPER_ADMIN_EMAIL ||
    import.meta.env?.SUPER_ADMIN_EMAIL ||
    'rahuljena.dev@gmail.com'
  );
  return envEmail.trim().toLowerCase();
};

export const isSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === getSuperAdminEmail();
};

export const isVerifiedSuperAdmin = (user?: { email?: string | null; emailVerified?: boolean } | null): boolean =>
  user?.emailVerified === true && isSuperAdminEmail(user.email);

export const isEmulatorDevelopment = (env: { DEV?: boolean; PUBLIC_FIREBASE_USE_LIVE?: string } = import.meta.env): boolean =>
  env?.DEV === true && env.PUBLIC_FIREBASE_USE_LIVE !== 'true';
