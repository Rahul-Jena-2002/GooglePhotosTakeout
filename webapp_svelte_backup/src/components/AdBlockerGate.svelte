<script lang="ts">
  function reload() {
    window.location.reload();
  }
</script>

<div
  style="
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(4, 6, 20, 0.97);
    backdrop-filter: blur(32px);
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; padding: 24px;
  "
>
  <div style="
    max-width: 480px; text-align: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(239,68,68,0.35);
    border-radius: 24px; padding: 48px 40px;
    box-shadow: 0 0 60px rgba(239,68,68,0.15);
  ">
    <div style="font-size: 56px; margin-bottom: 20px;">🚫</div>
    <h1 style="
      color: #f87171; font-size: 1.6rem; font-weight: 800;
      margin-bottom: 12px; letter-spacing: -0.02em;
    ">
      Ad Blocker Detected
    </h1>
    <p style="
      color: rgba(200,210,255,0.75); font-size: 1rem;
      line-height: 1.7; margin-bottom: 28px;
    ">
      GT Metadata Merger is <strong style="color: #a5b4fc;">100% free</strong> to use.
      Ads are how we keep the lights on and fund new features.
      <br /><br />
      Please <strong style="color: #fbbf24;">whitelist this site</strong> in your
      ad blocker, then refresh the page.
    </p>

    <div style="
      background: rgba(251,191,36,0.08);
      border: 1px solid rgba(251,191,36,0.25);
      border-radius: 12px; padding: 16px 20px;
      margin-bottom: 28px; text-align: left;
    ">
      <p style="color: #fbbf24; font-weight: 700; margin-bottom: 8px; font-size: 0.9rem;">
        How to whitelist:
      </p>
      <ol style="color: rgba(200,210,255,0.7); font-size: 0.85rem; padding-left: 18px; line-height: 2;">
        <li>Click your ad blocker icon in the browser toolbar</li>
        <li>Select <strong>"Pause on this site"</strong> or <strong>"Whitelist"</strong></li>
        <li>Reload the page</li>
      </ol>
    </div>

    <button
      on:click={reload}
      style="
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff; border: none; border-radius: 12px;
        padding: 14px 32px; font-size: 1rem; font-weight: 700;
        cursor: pointer; width: 100%;
        box-shadow: 0 8px 30px rgba(99,102,241,0.4);
      "
    >
      I've Whitelisted — Reload
    </button>
    <p style="color: rgba(200,210,255,0.4); font-size: 0.75rem; margin-top: 16px;">
      🔒 We use Google AdSense. No trackers, no crypto miners, no malware.
    </p>
  </div>
</div>
