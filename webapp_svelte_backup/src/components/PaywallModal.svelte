<script lang="ts">
  import { onMount } from 'svelte';
  import MockCheckoutGateway from '../MockCheckoutGateway.svelte';
  import type { User } from 'firebase/auth';
  import { getRegionalPricing } from '../services/PricingService';
  import type { RegionalPricing, PlanId } from '../services/PricingService';

  export let usedGB: number;
  export let user: User | null;
  export let onActivated: () => void;
  export let onClose: () => void;

  let showMockCheckout: PlanId | null = null;
  let pricing: RegionalPricing | null = null;

  onMount(async () => {
    pricing = await getRegionalPricing();
  });

  $: plans = pricing ? [
    {
      id: '15gb' as PlanId,
      label: '15GB Boost Pass',
      price: `${pricing.currencySymbol}${pricing.prices['15gb']}`,
      desc: 'One-time upgrade. Expand your cap to 15.00 GB.',
      icon: '🔋',
      highlight: false,
    },
    {
      id: '24hour' as PlanId,
      label: '24-Hour Pass',
      price: `${pricing.currencySymbol}${pricing.prices['24hour']}`,
      desc: 'Full unlimited access for 24 hours. Perfect for a one-time migration.',
      icon: '⚡',
      highlight: false,
    },
    {
      id: 'lifetime' as PlanId,
      label: 'Lifetime Unlimited',
      price: `${pricing.currencySymbol}${pricing.prices['lifetime']}`,
      desc: 'Pay once, use forever. No limits, no expiry, all future updates included.',
      icon: '♾️',
      highlight: true,
    },
  ] : [];
</script>

<div class="modal-overlay">
  <div class="glass-strong animate-fade-in-up" style="max-width: {showMockCheckout ? 400 : 800}px; width: 100%; border-radius: 28px; padding: {showMockCheckout ? '20px' : '44px 40px'}; transition: all 0.3s ease;">
    {#if showMockCheckout && user && pricing}
      <MockCheckoutGateway 
        userUid={user.uid}
        planId={showMockCheckout}
        pricing={pricing}
        onSuccess={onActivated} 
        onCancel={() => showMockCheckout = null} 
      />
    {:else}
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="font-size: 48px; margin-bottom: 12px;">🚀</div>
        <h1 style="color: var(--text); font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 10px;">
          Free Limit Reached
        </h1>
        <p style="color: var(--muted); font-size: 0.95rem; line-height: 1.6;">
          You've processed <strong style="color: var(--yellow);">{usedGB.toFixed(1)} GB</strong> of
          your free quota. Upgrade to continue processing.
        </p>
      </div>

      <!-- Pricing cards -->
      {#if !pricing}
        <div style="text-align: center; padding: 40px; color: var(--muted);">Loading regional pricing...</div>
      {:else}
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px;">
          {#each plans as plan}
            <div class="glass" style="background: {plan.highlight ? 'var(--glow)' : 'var(--surface)'}; border: {plan.highlight ? '2px solid var(--accent)' : '1px solid var(--border)'}; border-radius: 18px; padding: 24px 20px; position: relative;">
              {#if plan.highlight}
                <div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 4px 14px; border-radius: 50px; letter-spacing: 0.08em; white-space: nowrap; box-shadow: 0 4px 12px rgba(99,102,241,0.4);">BEST VALUE</div>
              {/if}
              <div style="font-size: 28px; margin-bottom: 8px; text-align: center;">{plan.icon}</div>
              <div style="font-weight: 700; color: var(--text); font-size: 1rem; margin-bottom: 4px; text-align: center;">
                {plan.label}
              </div>
              <div class="gradient-text" style="font-size: 1.5rem; font-weight: 800; margin-bottom: 10px; text-align: center;">
                {plan.price}
              </div>
              <div style="color: var(--muted); font-size: 0.82rem; line-height: 1.5; margin-bottom: 18px; text-align: center; min-height: 60px;">
                {plan.desc}
              </div>
              {#if user}
                <button
                  on:click={() => showMockCheckout = plan.id}
                  class={plan.highlight ? "btn-primary" : "btn-secondary"}
                  style="width: 100%;"
                >
                  Select Plan →
                </button>
              {:else}
                <p style="text-align: center; color: var(--red); font-size: 0.8rem; font-weight: 600;">Please sign in to purchase.</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <button on:click={onClose} style="background: transparent; border: none; color: var(--muted); width: 100%; padding: 12px; margin-top: 10px; cursor: pointer; font-size: 0.85rem; font-weight: 600;">
        Close
      </button>
    {/if}
  </div>
</div>
