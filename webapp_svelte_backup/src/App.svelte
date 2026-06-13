<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { detectAdBlock } from './services/AdBlockDetector';
  import { getLicenseState, isQuotaExceeded } from './services/LicenseService';
  import type { LicenseState } from './services/LicenseService';
  import type { User } from 'firebase/auth';
  import { findMatchingJsonName, safeParseJson, extractTimestamp, isAllowedMediaFile, sanitizeFilename } from './services/MetadataMatcher';
  import { injectExifDate, isJpeg } from './services/ExifRestorer';
  
  import AdBlockerGate from './components/AdBlockerGate.svelte';
  // Use dynamic imports where needed
  let AdminPanel: any;
  let UserPanel: any;
  let PaywallModal: any;

  interface LogEntry { level: 'info' | 'success' | 'warn' | 'error'; msg: string; }
  interface Stats { matched: number; unmatched: number; total: number; done: number; }

  // ─── Ad Slot Component (Inline logic for Svelte) ───
  function initAdSlot(node: HTMLElement) {
    try { (window as any).adsbygoogle = (window as any).adsbygoogle || []; (window as any).adsbygoogle.push({}); } catch { /* ignore */ }
  }

  // ─── Recursive directory scanner ───
  async function scanDirectory(dirHandle: FileSystemDirectoryHandle): Promise<{ mediaFiles: FileSystemFileHandle[]; dirHandle: FileSystemDirectoryHandle; allNames: Set<string>; relativePath: string[] }[]> {
    const results: { mediaFiles: FileSystemFileHandle[]; dirHandle: FileSystemDirectoryHandle; allNames: Set<string>; relativePath: string[] }[] = [];

    async function walk(handle: FileSystemDirectoryHandle, path: string[]) {
      const allNames = new Set<string>();
      const mediaFiles: FileSystemFileHandle[] = [];

      for await (const [name, entry] of (handle as any)) {
        const safeName = sanitizeFilename(name);
        if (!safeName) continue;
        allNames.add(safeName);
        if (entry.kind === 'file' && isAllowedMediaFile(safeName)) {
          mediaFiles.push(entry as FileSystemFileHandle);
        } else if (entry.kind === 'directory') {
          await walk(entry as FileSystemDirectoryHandle, [...path, safeName]);
        }
      }
      if (mediaFiles.length > 0) {
        results.push({ mediaFiles, dirHandle: handle, allNames, relativePath: path });
      }
    }

    await walk(dirHandle, []);
    return results;
  }

  // State
  let adBlocked = false;
  let activeView: 'tool' | 'admin' = 'tool';
  let showPaywall = false;
  let showAdminToolModal = false;
  let showUser = false;
  let showMobileMenu = false;
  let licenseState: LicenseState = getLicenseState();

  let inputHandle: FileSystemDirectoryHandle | null = null;
  let outputHandle: FileSystemDirectoryHandle | null = null;
  let injectExif = true;

  let running = false;
  let paused = false;
  let done = false;
  let logs: LogEntry[] = [];
  let stats: Stats = { matched: 0, unmatched: 0, total: 0, done: 0 };
  let user: User | null = null;
  let theme: 'dark' | 'light' = 'dark';
  
  // Refs
  let cancelRef = false;
  let pauseRef = false;
  let logRef: HTMLDivElement;

  $: isAdmin = user?.email === 'rahuljenasonu@gmail.com';

  let windowWidth = window?.innerWidth || 1024;
  
  function handleResize() { windowWidth = window.innerWidth; }

  $: showSideAds = windowWidth >= 1100;
  $: showExtraSideAds = windowWidth >= 1450;

  $: {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  $: { pauseRef = paused; }

  async function scrollToBottom() {
    await tick();
    if (logRef) logRef.scrollTop = logRef.scrollHeight;
  }

  let now = Date.now();
  $: {
    if (logs.length) scrollToBottom();
  }

  onMount(() => {
    const timeInterval = setInterval(() => { now = Date.now(); }, 1000);
    window.addEventListener('resize', handleResize);
    
    let unsub: any;
    const loadFirebase = async () => {
      const { auth, onAuthStateChanged, initUser } = await import('./firebase');
      unsub = onAuthStateChanged(auth, async (u) => {
        user = u;
        if (u) {
          const record = await initUser(u);
          licenseState = { ...licenseState, type: record.licenseType, usedBytes: record.usedBytes, expiresAt: record.expiresAt };
          if (record.role === 'admin') activeView = 'admin';
        } else {
          licenseState = getLicenseState();
        }
      });
      
      // Preload lazy components
      AdminPanel = (await import('./AdminPanel.svelte')).default;
      UserPanel = (await import('./UserPanel.svelte')).default;
      PaywallModal = (await import('./components/PaywallModal.svelte')).default;
    };
    
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(loadFirebase, { timeout: 3000 });
    } else {
      setTimeout(loadFirebase, 4000);
    }

    // AdBlock Check: Defer until page is fully loaded to ensure perfect performance
    const runAdBlockCheck = async () => {
      adBlocked = await detectAdBlock();
    };
    if (document.readyState === 'complete') {
      setTimeout(runAdBlockCheck, 2500);
    } else {
      window.addEventListener('load', () => setTimeout(runAdBlockCheck, 2500));
    }

    // Lazy load AdSense
    const loadAds = () => {
      if (document.getElementById('adsense-script')) return;
      const script = document.createElement('script');
      script.id = 'adsense-script';
      script.async = true;
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7628736172233995';
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    };

    const events = ['scroll', 'mousemove', 'touchstart', 'click', 'keydown'];
    const initAds = () => {
      loadAds();
      events.forEach(e => window.removeEventListener(e, initAds));
    };

    events.forEach(e => window.addEventListener(e, initAds, { once: true }));

    return () => {
      clearInterval(timeInterval);
      window.removeEventListener('resize', handleResize);
      if (unsub) unsub();
      events.forEach(e => window.removeEventListener(e, initAds));
    };
  });

  function addLog(level: LogEntry['level'], msg: string) {
    logs = [...logs.slice(-400), { level, msg }];
  }

  function refreshLicense() {
    licenseState = getLicenseState();
    showPaywall = false;
  }

  async function browseInput() { try { inputHandle = await (window as any).showDirectoryPicker({ mode: 'read' }); } catch {} }
  async function browseOutput() { try { outputHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' }); } catch {} }

  async function getOrCreateDir(root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> {
    let current = root;
    for (const part of parts) {
      const safe = sanitizeFilename(part);
      if (!safe) continue;
      current = await current.getDirectoryHandle(safe, { create: true });
    }
    return current;
  }

  async function startExtraction() {
    if (!inputHandle || !outputHandle) return;
    if (isQuotaExceeded()) { showPaywall = true; return; }

    running = true;
    paused = false;
    done = false;
    logs = [];
    stats = { matched: 0, unmatched: 0, total: 0, done: 0 };
    cancelRef = false;
    pauseRef = false;

    let sessionUsedBytes = licenseState.usedBytes || 0;

    addLog('info', '🔍 Scanning input folder…');

    try {
      const groups = await scanDirectory(inputHandle);
      const totalFiles = groups.reduce((s, g) => s + g.mediaFiles.length, 0);
      stats.total = totalFiles;
      addLog('info', `📁 Found ${totalFiles} media files across ${groups.length} folder(s).`);

      let matched = 0, unmatched = 0;
      let jobBytes = 0;

      for (const group of groups) {
        if (cancelRef) break;
        const { mediaFiles, dirHandle, allNames, relativePath } = group;
        let groupBytes = 0;
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
        let maxC = navigator.hardwareConcurrency || 4;
        
        if (isMobile) {
          maxC = Math.max(2, Math.floor(maxC * 0.5));
        } else {
          maxC = Math.max(4, Math.floor(maxC * 0.8));
        }
        
        if ('deviceMemory' in navigator) {
          const mem = (navigator as any).deviceMemory;
          if (mem < 4) maxC = Math.max(1, Math.min(maxC, Math.floor(mem)));
        }
        const CONCURRENCY = maxC;
        
        for (let i = 0; i < mediaFiles.length; i += CONCURRENCY) {
          if (cancelRef) break;
          while (pauseRef && !cancelRef) await new Promise(r => setTimeout(r, 200));
          const batch = mediaFiles.slice(i, i + CONCURRENCY);
          
          await Promise.all(batch.map(async (fileHandle) => {
            if (cancelRef) return;
            const safeName = sanitizeFilename(fileHandle.name);
            try {
              const file = await fileHandle.getFile();

              let maxQuota = 5 * 1024 * 1024 * 1024;
              if (licenseState.type === '15gb') maxQuota = 15 * 1024 * 1024 * 1024;
              const isExp24h = licenseState.type === '24hour' && licenseState.expiresAt && Date.now() > licenseState.expiresAt;
              const hasPaid = licenseState.type === 'lifetime' || (licenseState.type === '24hour' && !isExp24h);

              if (!hasPaid && (sessionUsedBytes + file.size) > maxQuota) {
                const { addCloudUsage } = await import('./firebase');
                await addCloudUsage(user, groupBytes);
                groupBytes = 0;
                showPaywall = true;
                cancelRef = true;
                return;
              }

              groupBytes += file.size;
              sessionUsedBytes += file.size;
              jobBytes += file.size;
              
              if (user) {
                licenseState.usedBytes += file.size;
              }

              const jsonName = findMatchingJsonName(safeName, allNames);
              let epochSec: number | null = null;
              if (jsonName) {
                try {
                  const jsonHandle = await dirHandle.getFileHandle(jsonName);
                  const jsonFile = await jsonHandle.getFile();
                  const parsed = safeParseJson(await jsonFile.text());
                  if (parsed) epochSec = extractTimestamp(parsed);
                } catch {}
              }
              const rawBuffer = await file.arrayBuffer();
              let mediaBytes: Uint8Array = new Uint8Array(rawBuffer);
              if (injectExif && epochSec && isJpeg(safeName)) {
                try { mediaBytes = injectExifDate(rawBuffer, epochSec); } catch {}
              }
              const baseFolder = (jsonName && epochSec) ? 'restored' : 'unmatched';
              const outSubDir = await getOrCreateDir(outputHandle, [baseFolder, ...relativePath]);
              const outHandle = await outSubDir.getFileHandle(safeName, { create: true });
              const writable = await (outHandle as any).createWritable();
              await writable.write(mediaBytes);
              await writable.close();
              
              if (jsonName && epochSec) { matched++; addLog('success', `[RESTORED]  ${safeName}`); }
              else { unmatched++; addLog('warn', `[UNMATCHED] ${safeName}`); }
            } catch (err: unknown) {
              unmatched++;
              addLog('error', `[ERROR]     ${safeName}  ➜  ${err instanceof Error ? err.message : 'Unknown'}`);
            }
            stats = { ...stats, matched, unmatched, done: stats.done + 1 };
          }));
        }
        if (user && groupBytes > 0) {
          const { addCloudUsage } = await import('./firebase');
          await addCloudUsage(user, groupBytes);
        }
      }
      if (!cancelRef) { 
        addLog('info', `🎉 Done! Matched: ${matched}, Unmatched: ${unmatched}`); 
        if (user && jobBytes > 0) {
          const { logExtractionEvent } = await import('./firebase');
          await logExtractionEvent(user, jobBytes, matched, totalFiles);
        }
        done = true; 
      }
    } catch (err: unknown) { 
      addLog('error', `Fatal error: ${err instanceof Error ? err.message : String(err)}`); 
    }
    finally { 
      running = false; 
      if (!user) {
        licenseState = getLicenseState(); 
      }
    }
  }

  function cancelExtraction() { cancelRef = true; paused = false; addLog('warn', '⛔ Cancelled by user.'); running = false; }
  function toggleTheme() { theme = theme === 'dark' ? 'light' : 'dark'; }
  async function login() {
    const { auth, googleProvider, signInWithPopup } = await import('./firebase');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      alert('Login failed. Please try again.');
    }
  }
  async function logout() {
    const { auth, signOut } = await import('./firebase');
    await signOut(auth);
  }

  $: maxQuotaGB = licenseState.type === '15gb' ? 15 : 5;
  $: isExpired24h = licenseState.type === '24hour' && licenseState.expiresAt && now > licenseState.expiresAt;
  $: isPaid = licenseState.type === 'lifetime' || (licenseState.type === '24hour' && !isExpired24h);
  $: isExpiringSoon = licenseState.type === '24hour' && licenseState.expiresAt && (licenseState.expiresAt - now) < 3600000 && (licenseState.expiresAt - now) > 0;
  $: usedGB = licenseState.usedBytes / (1024 ** 3);

  function formatTimeLeft(expiresAt: number | null) {
    if (!expiresAt) return '24h Pass ⚡';
    const diff = Math.max(0, expiresAt - now);
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff / (1000 * 60)) % 60);
    const s = Math.floor((diff / 1000) % 60);
    return `⚡ ${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}m:${s.toString().padStart(2, '0')}s`;
  }
  $: quotaPct = Math.min(100, (licenseState.usedBytes / (maxQuotaGB * 1024 ** 3)) * 100);
</script>

  {#if adBlocked}
    <AdBlockerGate />
  {/if}
  {#if showPaywall && !adBlocked && PaywallModal}
    <svelte:component this={PaywallModal} {usedGB} {user} onActivated={refreshLicense} onClose={() => showPaywall = false} />
  {/if}

  <header class="app-header">
    <a href="/" style="text-decoration: none;">
      <div style="font-size: 1.4rem; font-weight: 800; display: flex; align-items: center; gap: 10px; color: var(--text); margin: 0;">
        📸 <span class="gradient-text">GT Metadata Merger</span>
      </div>
    </a>

    <!-- Desktop Nav -->
    <div class="desktop-nav">
      <button on:click={toggleTheme} aria-label="Toggle Theme" style="background: none; border: none; font-size: 1.2rem; cursor: pointer;">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      
      {#if user}
        <button on:click={() => showUser = true} style="display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 4px 12px 4px 4px; cursor: pointer;">
          <img src={user.photoURL || ''} alt="" style="width: 24px; height: 24px; border-radius: 50%;" />
          <span style="font-size: 0.85rem; color: var(--text); font-weight: 600;">{user.displayName?.split(' ')[0] || 'User'}</span>
        </button>
      {:else}
        <button on:click={login} class="btn-secondary">Sign In / Sign Up</button>
      {/if}

      {#if isAdmin}
        <div style="display: flex; gap: 8px;">
          <button on:click={() => activeView = activeView === 'admin' ? 'tool' : 'admin'} class={activeView === 'admin' ? 'btn-primary' : 'btn-secondary'} style="padding: 6px 12px; font-size: 0.85rem;">
            <span style="margin-right: 6px;">{activeView === 'admin' ? '🛠️' : '⚙️'}</span> {activeView === 'admin' ? 'Open Tool' : 'Dashboard'}
          </button>
        </div>
      {:else if !isPaid}
        <button on:click={() => showPaywall = true} class="tag" style="cursor: pointer; background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.5);">
          {licenseState.type === '15gb' ? '15GB Tier' : 'Free Tier'} ▾
        </button>
      {:else}
        <div class="tag" style="background: {isExpiringSoon ? 'rgba(239,68,68,0.2)' : 'rgba(52,211,153,0.2)'}; color: {isExpiringSoon ? '#f87171' : '#34d399'}; border: 1px solid {isExpiringSoon ? 'rgba(239,68,68,0.5)' : 'rgba(52,211,153,0.5)'}; font-variant-numeric: tabular-nums;">
          {licenseState.type === '24hour' ? formatTimeLeft(licenseState.expiresAt) : 'Lifetime ♾️'}
        </div>
      {/if}
    </div>

    <!-- Mobile Nav Toggle -->
    <button class="mobile-nav-toggle" aria-label="Toggle Mobile Menu" on:click={() => showMobileMenu = !showMobileMenu}>
      {#if user}
        <img src={user.photoURL || ''} alt="User Profile" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--border);" />
      {:else}
        <div style="font-size: 1.8rem; padding: 0 8px; color: var(--text);">☰</div>
      {/if}
    </button>

    <!-- Mobile Dropdown Menu -->
    {#if showMobileMenu}
      <div class="mobile-dropdown glass glass-3d">
        <button on:click={() => { toggleTheme(); showMobileMenu = false; }} class="btn-secondary">
          {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        {#if user}
          <div style="display: flex; justify-content: center; gap: 10px;">
            <button on:click={() => { showUser = true; showMobileMenu = false; }} class="btn-secondary">👤 Profile</button>
            {#if isAdmin}
              <button on:click={() => { activeView = activeView === 'admin' ? 'tool' : 'admin'; showMobileMenu = false; }} class="btn-secondary" style="border-color: rgba(52,211,153,0.5); color: #34d399;">
                {activeView === 'admin' ? '🛠️ Open Tool' : '⚙️ Dashboard'}
              </button>
            {/if}
          </div>
        {:else}
          <button on:click={() => { login(); showMobileMenu = false; }} class="btn-secondary">Sign In / Sign Up</button>
        {/if}
      </div>
    {/if}
  </header>

  <!-- ── FULL WIDTH MAIN CONTENT ── -->
  <main class="app-main">
    {#if activeView === 'admin' && AdminPanel}
      <svelte:component this={AdminPanel} />
    {:else}
      <!-- TOP AD FOR MOBILE -->
      {#if !showSideAds && !running}
        <div style="margin-bottom: 20px; border-radius: 16px; overflow: hidden;">
          <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 90px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
            <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="7318748661" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
          </div>
        </div>
      {/if}

      <div style="display: flex; gap: 40px; justify-content: center; align-items: flex-start;">
        
        <!-- ── LEFT AD(S) ── -->
        {#if showSideAds}
          <div style="display: flex; gap: 24px;">
            {#if showExtraSideAds}
              <div class="side-ad-container">
                <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 600px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
                  <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="8405129857" data-ad-format="vertical" data-full-width-responsive="true"></ins>
                </div>
              </div>
            {/if}
            <div class="side-ad-container">
              <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 600px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
                <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="8405129857" data-ad-format="vertical" data-full-width-responsive="true"></ins>
              </div>
            </div>
          </div>
        {/if}

        <!-- ── MAIN CENTER COLUMN ── -->
        <div style="flex: 1; max-width: 800px;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 class="gradient-text animate-fade-in-up" style="font-size: clamp(2.5rem, 6vw, 3.8rem); margin-bottom: 16px; line-height: 1.1;">
              Restore Takeout Data
            </h1>
            <p style="color: var(--muted); font-size: 1.1rem; max-width: 600px; margin: 0 auto;">
              100% private. Re-links Google Takeout JSON metadata back into your media files locally within your browser.
            </p>
          </div>

          <div style="display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); margin-bottom: 20px;">
            <div class="glass glass-3d" style="padding: 24px;">
              <h2 style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 16px;">Input Folder</h2>
              <button class="btn-secondary" on:click={browseInput} style="width: 100%;">📂 {inputHandle ? inputHandle.name : 'Browse...'}</button>
              <div class="checkbox-row" style="margin-top: 20px;">
                <input type="checkbox" id="injectExifCheckbox" bind:checked={injectExif} />
                <label for="injectExifCheckbox" style="font-size: 0.85rem; cursor: pointer;">Inject EXIF into JPEGs</label>
              </div>
            </div>
            <div class="glass glass-3d" style="padding: 24px;">
              <h2 style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 16px;">Output Folder</h2>
              <button class="btn-secondary" on:click={browseOutput} style="width: 100%;">💾 {outputHandle ? outputHandle.name : 'Browse...'}</button>
            </div>
          </div>

          <div class="glass glass-3d" style="padding: 24px; margin-bottom: 20px;">
            {#if !running}
              <button class="btn-primary" on:click={startExtraction} disabled={!user || !inputHandle || !outputHandle} style="width: 100%;">
                {!user ? '🔒 Sign In to Start' : 'Start Restoration'}
              </button>
            {:else}
              <div style="display: flex; gap: 12px;">
                <button class="btn-primary" on:click={() => paused = !paused} style="flex: 1;">{paused ? 'Resume' : 'Pause'}</button>
                <button class="btn-secondary" on:click={cancelExtraction} style="flex: 1;">Cancel</button>
              </div>
            {/if}
          </div>

          {#if running || done}
            <div class="glass glass-3d" style="padding: 24px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <span style="color: var(--muted);">
                  Live Log
                  {#if stats.total > 0}
                    <span style="margin-left: 12px; color: #a5b4fc; font-size: 0.9em;">{stats.done} / {stats.total} files ({Math.floor((stats.done / stats.total) * 100)}%)</span>
                  {/if}
                </span>
                <button on:click={() => logs = []} style="background: none; border: none; color: var(--muted2);">Clear</button>
              </div>
              <div class="log-console" bind:this={logRef} style="background: rgba(0,0,0,0.5); padding: 16px; border-radius: 8px;">
                {#each logs as l}
                  <div style="color: {l.level === 'error' ? '#f87171' : '#a5b4fc'};">{l.msg}</div>
                {/each}
              </div>
            </div>
          {/if}

          {#if !isPaid}
            <div class="glass glass-3d" style="padding: 16px 24px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.82rem;">
                <span style="color: var(--muted); font-weight: 600;">Free Quota Used {user ? '☁️' : ''}</span>
                <div style="display: flex; gap: 10px;">
                  <span style="color: {quotaPct > 80 ? '#f87171' : '#a5b4fc'}; font-weight: 700;">
                    {Math.min(maxQuotaGB, usedGB).toFixed(2)} / {maxQuotaGB.toFixed(2)} GB
                  </span>
                </div>
              </div>
              <div class="progress-track">
                <div class="quota-bar-fill" style="
                  width: {quotaPct}%;
                  background: {quotaPct > 80 ? 'linear-gradient(90deg,#f97316,#ef4444)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)'};
                  height: 100%; border-radius: 99px;
                  box-shadow: 0 0 10px {quotaPct > 80 ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.4)'};
                "></div>
              </div>
              {#if quotaPct > 60}
                <p style="color: var(--muted); font-size: 0.78rem; margin-top: 8px;">
                  Running low? <button on:click={() => showPaywall = true} style="background: none; border: none; color: #a5b4fc; cursor: pointer; font-weight: 700; text-decoration: underline;">Upgrade for unlimited →</button>
                </p>
              {/if}
            </div>
          {/if}

          <!-- ── BOTTOM AD ── -->
          {#if !running}
            <div style="margin-bottom: 20px; border-radius: 16px; overflow: hidden;">
              <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 90px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
                <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="7318748661" data-ad-format="horizontal" data-full-width-responsive="true"></ins>
              </div>
            </div>
          {/if}

          <!-- ── INFO CARDS ── -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
            {#each [
              { icon: '🔒', title: 'No Uploads', body: 'Everything runs in your browser. Your files never leave your device.' },
              { icon: '⚡', title: 'Parallel Processing', body: 'Dynamically scales to your device\'s CPU cores for blazing-fast results.' },
              { icon: '🖼️', title: 'Deep EXIF Injection', body: 'Embeds the original date permanently into the JPEG binary header.' },
              { icon: '🛡️', title: 'Secure by Design', body: 'Strict CSP, prototype-pollution protection, and filename sanitization.' },
            ] as card, i}
              <div class="glass glass-3d animate-fade-in-up info-card" style="padding: 20px 18px; animation-delay: {i * 0.15}s;">
                <div class="info-icon" style="font-size: 1.8rem; margin-bottom: 10px;">{card.icon}</div>
                <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 6px;">{card.title}</div>
                <div style="color: var(--muted); font-size: 0.82rem; line-height: 1.6;">{card.body}</div>
              </div>
            {/each}
          </div>
        </div>

        <!-- ── RIGHT AD(S) ── -->
        {#if showSideAds}
          <div style="display: flex; gap: 24px;">
            <div class="side-ad-container">
              <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 600px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
                <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="8405129857" data-ad-format="vertical" data-full-width-responsive="true"></ins>
              </div>
            </div>
            {#if showExtraSideAds}
              <div class="side-ad-container">
                <div style="background: rgba(255,255,255,0.02); border-radius: 12px; min-height: 600px; display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,0.1);">
                  <ins class="adsbygoogle" use:initAdSlot style="display: block; width: 100%; height: 100%;" data-ad-client="ca-pub-7628736172233995" data-ad-slot="8405129857" data-ad-format="vertical" data-full-width-responsive="true"></ins>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </main>

  <footer style="margin-top: 60px; padding: 40px; text-align: center; opacity: 0.7; border-top: 1px solid rgba(255,255,255,0.05);">
    <p style="font-size: 0.85rem;">
      &copy; {new Date().getFullYear()} GT Metadata Merger. All rights reserved.<br />
      Open source & processing strictly local to your browser.
    </p>
  </footer>

  {#if showUser && user && UserPanel}
    <svelte:component this={UserPanel} {user} license={licenseState} onClose={() => showUser = false} onSignOut={logout} onUpgrade={() => { showUser = false; showPaywall = true; }} />
  {/if}

