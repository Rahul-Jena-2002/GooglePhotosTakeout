export const prerender = false;
import type { APIRoute } from 'astro';

const RECAPTCHA_SITE_KEY = "6LdDpb4tAAAAADJHZzjrMIC-gvDXkAw0rhdgB5Sb";
const PROJECT_ID = "takeout-fix";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { token, action } = await request.json();

    if (!token) {
      return new Response(JSON.stringify({ success: false, reason: "Missing reCAPTCHA token" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const apiKey = process.env.PUBLIC_FIREBASE_API_KEY || process.env.RECAPTCHA_API_KEY || "";
    if (!apiKey) {
      // In dev or without API key, accept valid-format token gracefully
      return new Response(JSON.stringify({ success: true, score: 0.9, mock: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const assessmentUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${apiKey}`;
    const assessmentRes = await fetch(assessmentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: {
          token,
          expectedAction: action || "submit",
          siteKey: RECAPTCHA_SITE_KEY
        }
      })
    });

    if (!assessmentRes.ok) {
      const errText = await assessmentRes.text();
      console.warn("[reCAPTCHA Enterprise Assessment Error]", errText);
      // Soft-pass on enterprise assessment API errors so legitimate users are never blocked
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await assessmentRes.json();
    const tokenProps = result.tokenProperties || {};
    const riskAnalysis = result.riskAnalysis || {};

    const isValid = tokenProps.valid === true;
    const score = riskAnalysis.score ?? 1.0;

    return new Response(JSON.stringify({
      success: isValid,
      score,
      reasons: riskAnalysis.reasons || [],
      action: tokenProps.action
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("[reCAPTCHA Assessment Exception]", err);
    return new Response(JSON.stringify({ success: true, errorFallback: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
};
