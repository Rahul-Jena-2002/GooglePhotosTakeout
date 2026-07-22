/**
 * Centralized Super Admin Helper Module
 * Reads super admin email dynamically from environment variable
 * PUBLIC_SUPER_ADMIN_EMAIL (set in Cloudflare Pages / .env) with fallback.
 */

export const getSuperAdminEmail = (): string => {
  const envEmail = (
    import.meta.env.PUBLIC_SUPER_ADMIN_EMAIL ||
    import.meta.env.SUPER_ADMIN_EMAIL ||
    'rahuljena.dev@gmail.com'
  );
  return envEmail.trim().toLowerCase();
};

export const isSuperAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return email.trim().toLowerCase() === getSuperAdminEmail();
};
