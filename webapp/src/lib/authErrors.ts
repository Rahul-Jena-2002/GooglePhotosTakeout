/**
 * Centralized Authentication Error Formatter
 * 
 * Provides warm, client-friendly feedback to end users without exposing
 * technical Firebase error strings or stack traces in client UI.
 * Logs full technical details to browser console for developer inspection.
 */

export interface AuthErrorFeedback {
  message: string;
  title: string;
  type: "error" | "info" | "warning";
  isCancelled: boolean;
}

/**
 * Check if the error represents an intentional cancellation by the user
 */
export function isAuthCancelled(err: any): boolean {
  if (!err) return false;
  const str = (err?.code || err?.message || String(err)).toLowerCase();
  return (
    str.includes("cancelled") ||
    str.includes("closed") ||
    str.includes("popup-closed-by-user") ||
    str.includes("user-cancelled")
  );
}

/**
 * Format auth error into client-friendly or admin-detailed feedback
 */
export function getFriendlyAuthMessage(err: any, isAdmin = false): AuthErrorFeedback {
  // Always log full technical error object to console for developers
  console.error("[Auth System Error Details]:", err);

  const rawCode = err?.code || "";
  const rawMessage = err?.message || String(err || "");

  // Cancellation
  if (isAuthCancelled(err)) {
    return {
      title: "Sign-In Cancelled",
      message: "The Google sign-in window was closed.",
      type: "info",
      isCancelled: true,
    };
  }

  // Admin route / SuperAdmin view: provide technical error code for debugging
  if (isAdmin) {
    return {
      title: "Admin Auth Error",
      message: `[Technical Error]: ${rawCode || rawMessage}`,
      type: "error",
      isCancelled: false,
    };
  }

  // Client-friendly mapping (No raw technical codes)
  const codeLower = (rawCode || rawMessage).toLowerCase();

  if (codeLower.includes("popup-blocked")) {
    return {
      title: "Pop-Up Blocked",
      message: "Your browser blocked the sign-in window. Please allow pop-ups for TakeoutFix and try again.",
      type: "warning",
      isCancelled: false,
    };
  }

  if (codeLower.includes("network-request-failed") || codeLower.includes("network_error")) {
    return {
      title: "Connection Lost",
      message: "Unable to connect to the authentication server. Please check your internet connection and try again.",
      type: "error",
      isCancelled: false,
    };
  }

  if (codeLower.includes("too-many-requests")) {
    return {
      title: "Please Wait a Moment",
      message: "Too many sign-in attempts have been made recently. Please wait a few seconds before trying again.",
      type: "warning",
      isCancelled: false,
    };
  }

  if (codeLower.includes("user-disabled")) {
    return {
      title: "Account Disabled",
      message: "This account has been deactivated. Please reach out to our support desk for assistance.",
      type: "error",
      isCancelled: false,
    };
  }

  if (codeLower.includes("api-key-not-valid") || codeLower.includes("invalid-api-key")) {
    return {
      title: "Service Updating",
      message: "The authentication service is temporarily updating. Please refresh and try again.",
      type: "warning",
      isCancelled: false,
    };
  }

  // General graceful fallback for clients
  return {
    title: "Sign-In Notice",
    message: "We couldn't complete the sign-in at this moment. Please try again.",
    type: "error",
    isCancelled: false,
  };
}
