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
      return new Response(JSON.stringify({ success: false, reason: "Assessment is not configured" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    const expectedAction = action || "submit";
    const assessmentUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${PROJECT_ID}/assessments?key=${apiKey}`;
    const assessmentRes = await fetch(assessmentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: {
          token,
          expectedAction,
          siteKey: RECAPTCHA_SITE_KEY
        }
      })
    });

    if (!assessmentRes.ok) {
      const errText = await assessmentRes.text();
      console.warn("[reCAPTCHA Enterprise Assessment Error]", errText);
      return new Response(JSON.stringify({ success: false, reason: "Assessment unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await assessmentRes.json();
    const tokenProps = result.tokenProperties || {};
    const riskAnalysis = result.riskAnalysis || {};

    const isValid = tokenProps.valid === true && tokenProps.action === expectedAction;

    return new Response(JSON.stringify({
      success: isValid,
      score: riskAnalysis.score,
      reasons: riskAnalysis.reasons || [],
      action: tokenProps.action
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("[reCAPTCHA Assessment Exception]", err);
    return new Response(JSON.stringify({ success: false, reason: "Assessment error" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }
};
