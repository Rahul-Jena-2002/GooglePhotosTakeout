<script lang="ts">
  import { doc, updateDoc } from 'firebase/firestore';
  import { db } from './firebase';
  import type { PlanId, RegionalPricing } from './services/PricingService';

  export let userUid: string;
  export let planId: PlanId;
  export let pricing: RegionalPricing;
  export let onSuccess: () => void;
  export let onCancel: () => void;

  let loading = false;
  let success = false;

  async function simulatePayment() {
    loading = true;
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const updateData: any = { licenseType: planId };
      if (planId === '24hour') {
        updateData.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      }
      
      await updateDoc(doc(db, 'users', userUid), updateData);
      success = true;
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (error) {
      console.error("Payment update failed:", error);
      alert("Payment failed or network error.");
      loading = false;
    }
  }

  $: priceStr = `${pricing.currencySymbol}${pricing.prices[planId]} ${pricing.currencyCode}`;
  
  const planNames: Record<PlanId, string> = {
    '15gb': '15GB Boost Pass',
    '24hour': '24-Hour Unlimited Pass',
    'lifetime': 'Lifetime Unlimited Access'
  };
</script>

{#if success}
  <div style="text-align: center; padding: 40px 20px;">
    <div style="font-size: 4rem; margin-bottom: 20px;">✅</div>
    <h2 style="color: #4ade80; margin-bottom: 10px;">Payment Successful!</h2>
    <p style="color: var(--muted);">Your account has been instantly upgraded.</p>
  </div>
{:else}
  <div style="padding: 20px;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="font-size: 1.2rem; font-weight: 700;">Secure Checkout</h2>
      <span style="color: var(--muted); font-size: 0.85rem;">Powered by <b>Stripe (Mock)</b></span>
    </div>

    <div class="glass glass-3d" style="padding: 20px; margin-bottom: 20px; background: var(--surface2);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span style="color: var(--text);">{planNames[planId]}</span>
        <span style="font-weight: 700;">{priceStr}</span>
      </div>
      <div style="height: 1px; background: var(--border); margin: 10px 0;"></div>
      <div style="display: flex; justify-content: space-between;">
        <span style="font-weight: 700;">Total</span>
        <span style="font-weight: 800; color: var(--green);">{priceStr}</span>
      </div>
    </div>

    <p style="font-size: 0.8rem; color: var(--muted); margin-bottom: 20px;">
      This is a simulated payment gateway. Clicking the button below will mimic a successful credit card charge and automatically upgrade your Firebase account on the spot.
    </p>

    <div style="display: flex; gap: 10px;">
      <button 
        on:click={onCancel} 
        class="btn-secondary" 
        style="flex: 1;"
        disabled={loading}
      >
        Cancel
      </button>
      <button 
        on:click={simulatePayment} 
        class="btn-primary" 
        style="flex: 2; display: flex; justify-content: center; align-items: center; gap: 8px;"
        disabled={loading}
      >
        {#if loading}
          <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></span>
        {:else}
          💳 Simulate Purchase
        {/if}
      </button>
    </div>
  </div>
{/if}
