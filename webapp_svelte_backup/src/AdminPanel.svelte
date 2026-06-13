<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { db } from './firebase';
  import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';



  let users: any[] = [];
  let logs: any[] = [];
  let loading = false;
  let now = Date.now();
  let timer: any;
  let activeTab: 'overview' | 'users' | 'logs' | 'settings' = 'overview';

  async function loadLogs() {
    try {
      const q = query(collection(db, 'usage_logs'), orderBy('timestamp', 'desc'), limit(50));
      const snap = await getDocs(q);
      logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.error(e);
    }
  }

  async function loadUsers() {
    loading = true;
    try {
      const snap = await getDocs(collection(db, 'users'));
      users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      await loadLogs();
    } catch (e) {
      console.error(e);
      alert("Error loading users. Ensure Firestore security rules allow admin access.");
    }
    loading = false;
  }

  onMount(() => {
    loadUsers();
    timer = setInterval(() => { now = Date.now() }, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function formatTimeLeft(expiresAt: number | null) {
    if (!expiresAt) return '24h Pass ⚡';
    const diff = Math.max(0, expiresAt - now);
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return `⚡ ${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m:${s.toString().padStart(2, '0')}s`;
  }

  async function grantLifetime(uid: string) {
    await updateDoc(doc(db, 'users', uid), { licenseType: 'lifetime', expiresAt: null });
    loadUsers();
  }

  async function grant24h(uid: string) {
    await updateDoc(doc(db, 'users', uid), { licenseType: '24hour', expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    loadUsers();
  }

  async function grant15gb(uid: string) {
    await updateDoc(doc(db, 'users', uid), { licenseType: '15gb', expiresAt: null });
    loadUsers();
  }

  async function revokeLicense(uid: string) {
    if (!window.confirm('Are you sure you want to revoke this user\'s license?')) return;
    await updateDoc(doc(db, 'users', uid), { licenseType: 'free', expiresAt: null });
    loadUsers();
  }

  async function resetQuota(uid: string) {
    if (!window.confirm('Reset this user\'s free quota back to 0 bytes?')) return;
    const u = users.find(x => x.id === uid);
    if (!u) return;
    const lifetime = u.lifetimeBytes !== undefined ? u.lifetimeBytes : (u.usedBytes || 0);
    
    await updateDoc(doc(db, 'users', uid), { 
      usedBytes: 0,
      lifetimeBytes: lifetime
    });
    loadUsers();
  }

  $: totalStorage = users.reduce((acc, u) => acc + (u.lifetimeBytes || u.usedBytes || 0), 0) / (1024**3);
  $: paidUsers = users.filter(u => u.licenseType === 'lifetime' || u.licenseType === '24hour' || u.licenseType === '15gb').length;
</script>

<div class="admin-dashboard-container animate-fade-in-up" style="display: flex; gap: 32px; width: 100%; max-width: 1200px; margin: 0 auto; min-height: 600px;">
  
  <!-- SIDEBAR -->
  <aside style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;">
    <h1 class="gradient-text" style="font-size: 1.5rem; margin-bottom: 24px; padding-left: 16px; line-height: 1.2;">Admin Panel</h1>
    
    <button class="sidebar-tab {activeTab === 'overview' ? 'active' : ''}" on:click={() => activeTab = 'overview'}>
      📊 Dashboard Overview
    </button>
    <button class="sidebar-tab {activeTab === 'users' ? 'active' : ''}" on:click={() => activeTab = 'users'}>
      👥 User Management
    </button>
    <button class="sidebar-tab {activeTab === 'logs' ? 'active' : ''}" on:click={() => activeTab = 'logs'}>
      📜 Audit Logs
    </button>
    <button class="sidebar-tab {activeTab === 'settings' ? 'active' : ''}" on:click={() => activeTab = 'settings'}>
      ⚙️ System Settings
    </button>
  </aside>

  <!-- MAIN AREA -->
  <section class="glass glass-3d" style="flex: 1; padding: 32px; border-radius: 24px; display: flex; flex-direction: column; max-height: 800px; overflow-y: auto;">
    
    <!-- OVERVIEW TAB -->
    {#if activeTab === 'overview'}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <h2 style="margin: 0; font-size: 1.8rem; font-weight: 700;">Dashboard Overview</h2>
        <button class="btn-primary" on:click={loadUsers} disabled={loading} style="padding: 8px 16px; font-size: 0.9rem;">
          {#if loading}Loading...{:else}Refresh Data{/if}
        </button>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; text-align: center; border: 1px solid rgba(255,255,255,0.02);">
          <div style="font-size: 2rem; font-weight: 800; color: #a5b4fc;">{users.length}</div>
          <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Total Users</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; text-align: center; border: 1px solid rgba(255,255,255,0.02);">
          <div style="font-size: 2rem; font-weight: 800; color: #34d399;">{paidUsers}</div>
          <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Active Passes</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 16px; text-align: center; border: 1px solid rgba(255,255,255,0.02);">
          <div style="font-size: 2rem; font-weight: 800; color: #fca5a5;">{totalStorage.toFixed(2)} GB</div>
          <div style="font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Total Data Processed</div>
        </div>
      </div>
      <p style="color: var(--muted); font-size: 0.9rem;">Welcome to the GT Metadata Merger Admin Dashboard. Use the sidebar to manage users, review processing history, and adjust system settings.</p>

    <!-- USERS TAB -->
    {:else if activeTab === 'users'}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <h2 style="margin: 0; font-size: 1.8rem; font-weight: 700;">User Management</h2>
        <button class="btn-primary" on:click={loadUsers} disabled={loading} style="padding: 8px 16px; font-size: 0.9rem;">
          {#if loading}Loading...{:else}Refresh Users{/if}
        </button>
      </div>

      <div style="display: grid; gap: 10px;">
        {#if users.length === 0 && !loading}
          <p style="color: var(--muted); text-align: center; padding: 40px; background: rgba(0,0,0,0.2); border-radius: 12px;">No users found.</p>
        {/if}
        {#each users as u (u.id)}
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.02);">
            <div>
              <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 4px;">{u.email || u.id}</div>
              <div style="font-size: 0.85rem; color: var(--muted);">
                Quota Used: {(u.usedBytes / (1024**3)).toFixed(2)} GB
                <span style="margin: 0 8px; opacity: 0.5;">|</span>
                Total Ever: {((u.lifetimeBytes || u.usedBytes || 0) / (1024**3)).toFixed(2)} GB
                {#if u.licenseType === 'lifetime'}
                  <span style="color: #a5b4fc; margin-left: 8px;">• Lifetime</span>
                {/if}
                {#if u.licenseType === '15gb'}
                  <span style="color: #a5b4fc; margin-left: 8px;">• 15GB Boost</span>
                {/if}
                {#if u.licenseType === '24hour'}
                  {@const isExpiringSoon = u.expiresAt && (u.expiresAt - now) < 3600000 && (u.expiresAt - now) > 0}
                  {@const isExpired = u.expiresAt && now > u.expiresAt}
                  {#if isExpired}
                    <span style="color: var(--muted); margin-left: 8px;">• Expired Pass</span>
                  {:else}
                    <span style="color: {isExpiringSoon ? '#f87171' : '#34d399'}; margin-left: 8px; font-variant-numeric: tabular-nums;">
                      • {formatTimeLeft(u.expiresAt)}
                    </span>
                  {/if}
                {/if}
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button on:click={() => resetQuota(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem;">♻️ Reset</button>
              {#if u.licenseType === 'lifetime' || u.licenseType === '24hour'}
                <button on:click={() => revokeLicense(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; border-color: #f87171; color: #f87171;">Revoke</button>
              {:else if u.licenseType === '15gb'}
                <button on:click={() => grant24h(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; color: #34d399; border-color: rgba(52,211,153,0.5);">24h Pass</button>
                <button on:click={() => grantLifetime(u.id)} class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">Lifetime</button>
                <button on:click={() => revokeLicense(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; border-color: #f87171; color: #f87171;">Revoke</button>
              {:else}
                <button on:click={() => grant15gb(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; color: #a5b4fc; border-color: rgba(165,180,252,0.5);">15GB</button>
                <button on:click={() => grant24h(u.id)} class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; color: #34d399; border-color: rgba(52,211,153,0.5);">24h Pass</button>
                <button on:click={() => grantLifetime(u.id)} class="btn-primary" style="padding: 8px 16px; font-size: 0.85rem;">Lifetime</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>

    <!-- LOGS TAB -->
    {:else if activeTab === 'logs'}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <h2 style="margin: 0; font-size: 1.8rem; font-weight: 700;">Audit Logs</h2>
        <button class="btn-secondary" on:click={loadLogs} disabled={loading} style="padding: 8px 16px; font-size: 0.9rem;">
          ↻ Refresh Logs
        </button>
      </div>
      <div style="display: grid; gap: 10px;">
        {#if logs.length === 0 && !loading}
          <p style="color: var(--muted); text-align: center; padding: 40px; background: rgba(0,0,0,0.2); border-radius: 12px;">No history logs yet.</p>
        {/if}
        {#each logs as log (log.id)}
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 16px 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.02);">
            <div>
              <div style="font-weight: 600; font-size: 1.0rem; margin-bottom: 4px;">{log.email}</div>
              <div style="font-size: 0.85rem; color: var(--muted);">
                {new Date(log.timestamp).toLocaleString()}
                <span style="margin: 0 8px; opacity: 0.5;">|</span>
                {(log.bytesProcessed / (1024**2)).toFixed(2)} MB Processed
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 600; font-size: 1.0rem; color: #a5b4fc;">{log.filesMatched} / {log.filesTotal}</div>
              <div style="font-size: 0.8rem; color: var(--muted);">Files Matched</div>
            </div>
          </div>
        {/each}
      </div>

    <!-- SETTINGS TAB -->
    {:else if activeTab === 'settings'}
      <div style="margin-bottom: 32px;">
        <h2 style="margin: 0 0 8px 0; font-size: 1.8rem; font-weight: 700;">System Settings</h2>
        <p style="color: var(--muted); margin: 0;">Configure global application rules and integrations.</p>
      </div>

      <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 24px;">
        <h3 style="margin: 0 0 16px 0; font-size: 1.2rem; color: var(--text);">Security & Roles</h3>
        <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 24px;">
          Currently, user roles and admin privileges are hardcoded in Firebase Firestore rules. To add a new administrator, manually assign <code>role: 'admin'</code> to their user document in the Firebase Console.
        </p>

        <h3 style="margin: 0 0 16px 0; font-size: 1.2rem; color: var(--text);">Global Limitations</h3>
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(0,0,0,0.2); border-radius: 12px;">
          <div>
            <div style="font-weight: 600;">Free Tier Quota</div>
            <div style="font-size: 0.85rem; color: var(--muted);">Default 5 GB storage limit for new free accounts.</div>
          </div>
          <button class="btn-secondary" style="opacity: 0.5; cursor: not-allowed;">Edit (Locked)</button>
        </div>
      </div>
    {/if}

  </section>
</div>

<style>
  .sidebar-tab {
    text-align: left;
    padding: 14px 20px;
    border-radius: 12px;
    background: transparent;
    border: 1px solid transparent;
    color: var(--muted);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .sidebar-tab:hover {
    background: rgba(255,255,255,0.03);
    color: var(--text);
  }
  .sidebar-tab.active {
    background: rgba(99, 102, 241, 0.1);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.2);
  }
</style>
