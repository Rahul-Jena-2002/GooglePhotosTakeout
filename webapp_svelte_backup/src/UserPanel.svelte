<script lang="ts">
  import type { User } from 'firebase/auth';
  import type { LicenseState } from './services/LicenseService';

  export let user: User;
  export let license: LicenseState;

  export let onClose: () => void;
  export let onSignOut: () => void;
  export let onUpgrade: () => void;

  import { onMount } from 'svelte';

  let now = Date.now();
  onMount(() => {
    const intv = setInterval(() => now = Date.now(), 1000);
    return () => clearInterval(intv);
  });

  $: maxQuota = license.type === '15gb' ? 15 : 5;
  $: isExpired24h = license.type === '24hour' && license.expiresAt && now > license.expiresAt;
  $: isPaid = license.type === 'lifetime' || (license.type === '24hour' && !isExpired24h);
  $: isExpiringSoon = license.type === '24hour' && license.expiresAt && (license.expiresAt - now) < 3600000 && (license.expiresAt - now) > 0;

  function formatTimeLeft(expiresAt: number | null) {
    if (!expiresAt) return '24h Pass ⚡';
    const diff = Math.max(0, expiresAt - now);
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return `⚡ ${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m:${s.toString().padStart(2, '0')}s`;
  }
  
  $: usedGB = (license.usedBytes / (1024 ** 3)).toFixed(2);
  $: quotaPct = Math.min(100, (license.usedBytes / (maxQuota * 1024 ** 3)) * 100);

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-overlay" on:click={handleBackdropClick} style="align-items: flex-start; padding-top: 80px; z-index: 100;">
  <div class="glass-strong animate-fade-in-up" style="
    width: 340px; padding: 24px; border-radius: 24px; margin-right: 20px; margin-left: auto;
    box-shadow: 0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1);
  ">
    
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      {#if user.photoURL}
        <img src={user.photoURL} alt="Profile" style="width: 56px; height: 56px; border-radius: 28px; border: 2px solid rgba(255,255,255,0.1);" />
      {:else}
        <div style="width: 56px; height: 56px; border-radius: 28px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
          👤
        </div>
      {/if}
      <div style="overflow: hidden;">
        <h2 style="margin: 0; font-size: 1.1rem; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">{user.displayName || 'User'}</h2>
        <p style="margin: 0; font-size: 0.85rem; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">{user.email}</p>
      </div>
    </div>

    <div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 16px; margin-bottom: 24px; border: 1px solid rgba(255,255,255,0.05);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <span style="font-size: 0.85rem; color: var(--muted);">Current Plan</span>
        <span style="font-size: 0.85rem; font-weight: 700; font-variant-numeric: tabular-nums; color: {isPaid ? (isExpiringSoon ? '#f87171' : '#34d399') : '#a5b4fc'};">
          {#if isPaid}
            {license.type === 'lifetime' ? 'Lifetime ♾️' : formatTimeLeft(license.expiresAt)}
          {:else}
            {license.type === '15gb' ? '15GB Tier' : 'Free Tier'}
          {/if}
        </span>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span style="font-size: 0.85rem; color: var(--muted);">Storage Used</span>
        <span style="font-size: 0.85rem; font-weight: 600; color: {quotaPct > 90 ? '#f87171' : 'inherit'};">
          {usedGB} GB {#if !isPaid}/ {maxQuota} GB{/if}
        </span>
      </div>
      
      {#if !isPaid}
        <div class="progress-track" style="height: 6px;">
          <div class="quota-bar-fill" style="width: {quotaPct}%; height: 100%; border-radius: 3px; background: {quotaPct > 90 ? '#ef4444' : '#6366f1'};"></div>
        </div>
      {/if}
    </div>

    {#if license.type !== 'lifetime'}
      <button class="btn-primary" on:click={() => { onClose(); onUpgrade(); }} style="width: 100%; margin-bottom: 12px; display: flex; justify-content: center; gap: 8px;">
        ✨ Upgrade Plan
      </button>
    {/if}

    <button class="btn-secondary" on:click={() => { onSignOut(); onClose(); }} style="width: 100%;">
      Sign Out
    </button>
  </div>
</div>
