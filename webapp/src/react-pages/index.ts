/**
 * TakeoutFix React Feature Modules Barrel
 * 
 * Provides unified, human-readable exports for all feature modules
 * categorized into clean subdirectories:
 * - admin/     : Admin center panels and operations
 * - auth/      : Sign-in modal, authentication page, and desktop bridge
 * - tool/      : Core metadata restoration workspace
 * - user/      : Customer dashboard, profile, and checkout
 * - marketing/ : Public landing, pricing, download, and review pages
 * - support/   : Support ticket help desk and feedback
 * - legal/     : Privacy policy and terms of service
 */

// ── 1. Admin Center Modules ──────────────────────────────────────────────────
export { default as AdminAudit } from "./admin/AdminAudit";
export { default as AdminDashboard } from "./admin/AdminDashboard";
export { default as AdminDev } from "./admin/AdminDev";
export { default as AdminKeys } from "./admin/AdminKeys";
export { default as AdminMonetization } from "./admin/AdminMonetization";
export { default as AdminPaymentGateway } from "./admin/AdminPaymentGateway";
export { default as AdminPlanThresholds } from "./admin/AdminPlanThresholds";
export { default as AdminReviews } from "./admin/AdminReviews";
export { default as AdminSettings } from "./admin/AdminSettings";
export { default as AdminStatistics } from "./admin/AdminStatistics";
export { default as AdminSupport } from "./admin/AdminSupport";
export { default as AdminTeam } from "./admin/AdminTeam";
export { default as AdminTierFeatures } from "./admin/AdminTierFeatures";
export { default as AdminTransactions } from "./admin/AdminTransactions";
export { default as AdminUserDashboard } from "./admin/AdminUserDashboard";
export { default as AdminUsers } from "./admin/AdminUsers";

// ── 2. Authentication Modules ────────────────────────────────────────────────
export { default as AuthModal } from "./auth/AuthModal";
export { default as AuthPage } from "./auth/AuthPage";
export { default as DesktopAuthBridge } from "./auth/DesktopAuthBridge";

// ── 3. Core Tool Module ──────────────────────────────────────────────────────
export { default as ToolWorkspace, ToolWorkspaceContent } from "./tool/ToolWorkspace";

// ── 4. User Account Modules ──────────────────────────────────────────────────
export { default as DashboardPage } from "./user/DashboardPage";
export { default as ProfilePage } from "./user/ProfilePage";
export { default as CheckoutPage } from "./user/CheckoutPage";

// ── 5. Marketing & Public Modules ────────────────────────────────────────────
export { default as LandingPage } from "./marketing/LandingPage";
export { default as PricingPage } from "./marketing/PricingPage";
export { default as DownloadPage } from "./marketing/DownloadPage";
export { default as HowItWorksPage } from "./marketing/HowItWorksPage";
export { default as ReviewsPage } from "./marketing/ReviewsPage";
export { default as SeoLandingPage } from "./marketing/SeoLandingPage";

// ── 6. Support & Feedback ────────────────────────────────────────────────────
export { default as SupportPage } from "./support/SupportPage";

// ── 7. Legal Documentation ───────────────────────────────────────────────────
export { default as PrivacyPage } from "./legal/PrivacyPage";
export { default as TermsPage } from "./legal/TermsPage";
