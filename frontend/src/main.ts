const viewContainer = document.getElementById('view-container')!;
const viewTitle = document.getElementById('view-title')!;
const navItems = document.querySelectorAll('.nav-item');

const NOTION_TEMPLATE_URL = "https://www.notion.so/MyTemplate-327be71560b58093b711eeb16ad4e5d3?source=copy_link";
let keyStatus: Record<string, boolean> = {};

// ─── Theme Toggle ──────────────────────────────────────────────
function applyTheme(theme: 'dark' | 'light') {
  const btn = document.getElementById('theme-toggle') as HTMLButtonElement;
  if (theme === 'light') {
    document.body.classList.add('light');
    if (btn) btn.textContent = '🌙 Dark';
  } else {
    document.body.classList.remove('light');
    if (btn) btn.textContent = '☀️ Light';
  }
  localStorage.setItem('theme', theme);
}

// Persist user preference
const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
applyTheme(savedTheme);

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const isLight = document.body.classList.contains('light');
  applyTheme(isLight ? 'dark' : 'light');
});

const views: Record<string, () => string> = {
  dashboard: () => `
    <div class="dashboard-home">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
        <div>
          <h2 style="font-size:1rem;font-weight:600;">Content Orchestration Overview</h2>
          <p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.2rem;">Powered by Gemini 2.5 Flash · Google Cloud Run · Cloud Scheduler</p>
        </div>
        <span style="background:rgba(16,124,16,0.15);color:#6dda6d;border:1px solid rgba(16,124,16,0.3);font-size:0.7rem;font-weight:600;padding:4px 12px;border-radius:999px;letter-spacing:0.04em;">● LIVE</span>
      </div>

      <div class="metric-row">
        <div class="metric-card">
          <div class="metric-label">Service Status</div>
          <div class="metric-value green" style="margin:4px 0;">Online</div>
          <div class="metric-sub">Cloud Run — us-central1</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Poll Frequency</div>
          <div class="metric-value blue" style="margin:4px 0;">60s</div>
          <div class="metric-sub">Cloud Scheduler trigger</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">AI Model</div>
          <div class="metric-value purple" style="margin:4px 0;">Flash 2.5</div>
          <div class="metric-sub">Text + Image generation</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Image Storage</div>
          <div class="metric-value blue" style="margin:4px 0;">GCS</div>
          <div class="metric-sub">Public · devrel-empire-images</div>
        </div>
      </div>

      <p class="section-title">Connected Platforms</p>
      <div class="platform-grid">
        <div class="platform-card">
          <h3><i data-lucide="file-code-2" class="platform-icon"></i> DEV.to <span class="badge auto">Auto-Publish</span></h3>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;">Publishes articles automatically with AI cover images when status is set to "Publish Now".</p>
        </div>
        <div class="platform-card">
          <h3><i data-lucide="link" class="platform-icon"></i> Hashnode <span class="badge draft">Draft Mode</span></h3>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;">Creates draft articles in your Hashnode publication automatically for review.</p>
        </div>
        <div class="platform-card">
          <h3><i data-lucide="book-open" class="platform-icon"></i> Medium <span class="badge draft">Draft Mode</span></h3>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;">Creates draft stories in your Medium account automatically for review.</p>
        </div>
        <div class="platform-card">
          <h3><i data-lucide="briefcase" class="platform-icon"></i> LinkedIn <span class="badge draft">Draft Mode</span></h3>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;">AI-generated post draft appears in Notion for review and one-click copy-paste.</p>
        </div>
        <div class="platform-card">
          <h3><i data-lucide="twitter" class="platform-icon"></i> Twitter / X <span class="badge draft">Draft Mode</span></h3>
          <p style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem;">AI-generated thread draft appears in Notion for review and one-click copy-paste.</p>
        </div>
      </div>

      <p class="section-title">Workflow Steps</p>
      <div style="display:flex;gap:0;flex-wrap:wrap;">
        ${['<i data-lucide="clipboard-list" class="sm-icon"></i> Create in Notion', '<i data-lucide="sparkles" class="sm-icon"></i> Generate AI Content', '<i data-lucide="search" class="sm-icon"></i> Pending Review', '<i data-lucide="rocket" class="sm-icon"></i> Publish Now', '<i data-lucide="check-circle-2" class="sm-icon"></i> Published'].map((s, i) => `
          <div style="display:flex;align-items:center;gap:0;">
            <div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:6px;padding:0.5rem 0.875rem;font-size:0.78rem;color:var(--text-dim);">${s}</div>
            ${i < 4 ? '<div style="padding:0 0.4rem;color:var(--text-faint);font-size:0.75rem;">→</div>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `,

  settings: () => `
    <div class="settings-view" id="settings-root">
      <div style="display:flex;align-items:center;gap:0.5rem;color:var(--text-dim);font-size:0.85rem;margin-bottom:1.5rem;">
        <i data-lucide="loader-2" style="animation:spin 1s linear infinite;"></i> Loading configuration...
      </div>
    </div>
  `,

  integration: () => `
    <div class="integration-view">
      <h2>Integration Guide</h2>
      <p style="color:var(--text-dim);font-size:0.85rem;margin-top:0.25rem;margin-bottom:1.5rem;">Connect your Notion workspace to DevRel Empire in 4 steps.</p>

      <div class="instruction-box">
        <strong>Step 1 — Duplicate the Notion Template</strong>
        <p style="margin-top:0.5rem;">Add the pre-built Articles DB to your workspace with all the right columns and status options.</p>
        <a href="${NOTION_TEMPLATE_URL}" target="_blank" class="notion-link">📋 Duplicate Template →</a>
      </div>

      <div class="instruction-box">
        <strong>Step 2 — Create a Notion Integration</strong>
        <ol style="margin-top:0.5rem;">
          <li>Go to <a href="https://www.notion.so/profile/integrations" target="_blank">Notion → Settings → Integrations</a></li>
          <li>Click <strong>New Integration</strong>, set Read/Write Content permissions</li>
          <li>Copy the <strong>Internal Integration Secret</strong> and paste in <em>API Keys</em> above</li>
        </ol>
      </div>

      <div class="instruction-box">
        <strong>Step 3 — Share Database with Integration</strong>
        <ol style="margin-top:0.5rem;">
          <li>Open the duplicated database in Notion</li>
          <li>Click the <strong>"..." menu</strong> → <strong>Connections</strong> → Select your integration</li>
        </ol>
      </div>

      <div class="instruction-box">
        <strong>Step 4 — Start Publishing</strong>
        <ul style="margin-top:0.5rem;">
          <li>Set Status → <code style="background:rgba(0,120,212,0.2);padding:2px 6px;border-radius:4px;font-size:0.82rem;">Generate AI Content</code> → AI writes drafts + creates cover image</li>
          <li>Review in Notion, then set Status → <code style="background:rgba(16,124,16,0.2);padding:2px 6px;border-radius:4px;font-size:0.82rem;">Publish Now</code> → Goes live!</li>
        </ul>
      </div>
    </div>
  `,

  faq: () => `
    <div class="faq-view">
      <h2>Frequently Asked Questions</h2>
      ${[
        ['Are my API keys safe?', 'Yes. Keys are submitted via HTTPS POST and stored server-side in memory only. They are <strong>never logged, never returned</strong> to the browser, and never stored in cookies or localStorage. Fields always appear blank after saving.'],
        ['Why are LinkedIn/Twitter in draft mode?', 'LinkedIn and Twitter require OAuth 2.0 with complex user consent flows. We generate AI-quality drafts in Notion so you can review and copy-paste with one click — no complex setup needed.'],
        ['What is Draft Mode for Hashnode and Medium?', 'When Hashnode or Medium keys are set, the app automatically creates a <strong>draft</strong> (not published) on those platforms. You review and publish from those platforms directly.'],
        ['How fast is the workflow?', 'Cloud Scheduler triggers every <strong>60 seconds</strong>. After you change a Notion page status, expect drafts to appear within 1–2 minutes.'],
        ['Can I edit the AI drafts before publishing?', "Yes! Phase 1 creates all drafts in Notion. Edit freely, then set status to 'Publish Now' when you're happy."],
        ['What AI model is used?', '<strong>Gemini 2.5 Flash</strong> for text generation and <strong>Gemini 2.5 Flash Image</strong> for cover image generation.'],
        ['What happens to AI-generated images?', 'Images are uploaded to your Google Cloud Storage bucket as a public URL and set automatically as both the Notion page cover and the DEV.to article cover image.'],
      ].map(([q, a]) => `
        <div class="faq-item">
          <div class="faq-question" onclick="this.parentElement.classList.toggle('open')">
            <span>${q}</span><span class="faq-chevron">▾</span>
          </div>
          <div class="faq-answer">${a}</div>
        </div>
      `).join('')}
    </div>
  `
};

function switchView(viewName: string) {
  navItems.forEach(item => item.classList.toggle('active', item.getAttribute('data-view') === viewName));
  viewTitle.innerText = ({
    dashboard: 'Dashboard',
    settings: 'API Keys',
    integration: 'Integration Guide',
    faq: 'FAQ'
  }[viewName] ?? viewName);
  const fn = views[viewName];
  if (fn) {
    viewContainer.innerHTML = fn();
    if (viewName === 'settings') bindSettingsEvents();
  }
  setTimeout(() => {
    if ((window as any).lucide) {
      (window as any).lucide.createIcons();
    }
  }, 0);
}

async function bindSettingsEvents() {
  // Fetch current state from backend
  let serverState: Record<string, boolean> = {
    enableDev: true, enableHashnode: true, enableMedium: true,
    hasDevKey: false, hasHashnodeKey: false, hasMediumKey: false,
    hasNotionToken: false, hasGeminiKey: false
  };
  try {
    const r = await fetch('/api/settings');
    if (r.ok) serverState = await r.json();
  } catch {}

  // Sync key indicators from server
  if (serverState.hasNotionToken) keyStatus['notionToken'] = true;
  if (serverState.hasGeminiKey) keyStatus['geminiKey'] = true;
  if (serverState.hasDevKey) keyStatus['devKey'] = true;
  if (serverState.hasHashnodeKey) keyStatus['hashnodeKey'] = true;
  if (serverState.hasMediumKey) keyStatus['mediumKey'] = true;

  const root = document.getElementById('settings-root')!;

  const toggle = (id: string, enabled: boolean) => `
    <label class="toggle-wrap" title="${enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}">
      <input type="checkbox" id="${id}" class="platform-toggle" ${enabled ? 'checked' : ''}>
      <span class="toggle-track"><span class="toggle-thumb"></span></span>
      <span class="toggle-label">${enabled ? 'Enabled' : 'Disabled'}</span>
    </label>`;

  const keyBadge = (k: string, label = 'API Key') =>
    keyStatus[k]
      ? `<span class="key-set"><i data-lucide="check" class="sm-icon"></i> ${label} set</span>`
      : label;

  root.innerHTML = `
    <div class="security-banner">
      <i data-lucide="shield-check" style="color:#10b981;flex-shrink:0;"></i>
      <span>Keys are <strong>server-side only</strong> — never returned or logged. Leave inputs blank to keep existing values.</span>
    </div>

    <p class="section-title" style="margin-top:0;">Core Configuration</p>
    <div class="platform-grid">
      <div class="field">
        <label>Notion API Token ${keyBadge('notionToken','Token')}</label>
        <input type="password" id="notionToken" placeholder="ntn_..." autocomplete="new-password">
      </div>
      <div class="field">
        <label>Notion Database ID</label>
        <input type="text" id="notionDb" placeholder="xxxxxxxx">
      </div>
      <div class="field">
        <label>Gemini API Key ${keyBadge('geminiKey','Key')}</label>
        <input type="password" id="geminiKey" placeholder="AIza..." autocomplete="new-password">
      </div>
      <div class="field">
        <label>GCS Bucket Name</label>
        <input type="text" id="gcsBucket" placeholder="devrel-empire-images">
      </div>
    </div>

    <p class="section-title">Publishing Platforms
      <span style="font-size:0.7rem;font-weight:400;color:var(--text-dim);margin-left:0.5rem;text-transform:none;letter-spacing:0;">
        Toggle platforms without deleting their keys
      </span>
    </p>
    <div class="platform-grid">

      <div class="platform-card ${serverState.enableDev ? '' : 'platform-disabled'}">
        <div class="card-header-row">
          <div class="card-header-left">
            <div class="card-platform-name"><i data-lucide="file-code-2" class="platform-icon"></i> DEV.to</div>
            <span class="badge auto">Auto-Publish</span>
          </div>
          ${toggle('enableDev', serverState.enableDev)}
        </div>
        <div class="field" style="margin-top:1rem;">
          <label>${keyBadge('devKey','API Key')}</label>
          <input type="password" id="devKey" placeholder="HFaz..." autocomplete="new-password">
        </div>
      </div>

      <div class="platform-card ${serverState.enableHashnode ? '' : 'platform-disabled'}">
        <div class="card-header-row">
          <div class="card-header-left">
            <div class="card-platform-name"><i data-lucide="link" class="platform-icon"></i> Hashnode</div>
            <span class="badge draft">Draft Mode</span>
          </div>
          ${toggle('enableHashnode', serverState.enableHashnode)}
        </div>
        <div class="field" style="margin-top:1rem;">
          <label>${keyBadge('hashnodeKey','API Key')}</label>
          <input type="password" id="hashnodeKey" placeholder="hashnode_pat_..." autocomplete="new-password">
        </div>
        <div class="field">
          <label>Publication ID</label>
          <input type="text" id="hashnodePubId" placeholder="xxxxxxxx">
        </div>
      </div>

      <div class="platform-card ${serverState.enableMedium ? '' : 'platform-disabled'}">
        <div class="card-header-row">
          <div class="card-header-left">
            <div class="card-platform-name"><i data-lucide="book-open" class="platform-icon"></i> Medium</div>
            <span class="badge draft">Draft Mode</span>
          </div>
          ${toggle('enableMedium', serverState.enableMedium)}
        </div>
        <div class="field" style="margin-top:1rem;">
          <label>${keyBadge('mediumKey','Token')}</label>
          <input type="password" id="mediumKey" placeholder="2_xxx..." autocomplete="new-password">
        </div>
      </div>

      <div class="platform-card" style="opacity:0.65;">
        <h3><i data-lucide="briefcase" class="platform-icon"></i> LinkedIn</h3>
        <p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.5rem;line-height:1.5;">AI draft auto-appended to Notion page. No key needed.</p>
      </div>
      <div class="platform-card" style="opacity:0.65;">
        <h3><i data-lucide="twitter" class="platform-icon"></i> Twitter / X</h3>
        <p style="color:var(--text-dim);font-size:0.8rem;margin-top:0.5rem;line-height:1.5;">AI thread auto-appended to Notion page. No key needed.</p>
      </div>
    </div>

    <button class="btn-save" id="save-settings">
      <i data-lucide="lock" style="width:1.1em;height:1.1em;vertical-align:text-bottom;"></i>
      Save Settings
    </button>
    <p style="color:var(--text-dim);font-size:0.72rem;margin-top:0.5rem;">API key fields left blank keep their current values unchanged.</p>
  `;

  if ((window as any).lucide) (window as any).lucide.createIcons();

  // Live dim/brighten card when toggle is flipped
  ['enableDev','enableHashnode','enableMedium'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const card = (e.target as HTMLInputElement).closest('.platform-card') as HTMLElement;
      if (card) card.classList.toggle('platform-disabled', !checked);
      const label = (e.target as HTMLInputElement).nextElementSibling?.nextElementSibling as HTMLElement;
      if (label) label.textContent = checked ? 'Enabled' : 'Disabled';
    });
  });

  const saveBtn = document.getElementById('save-settings')!;
  saveBtn.addEventListener('click', async () => {
    saveBtn.setAttribute('disabled', 'true');
    saveBtn.innerHTML = '<i data-lucide="loader-2" style="animation:spin 1s linear infinite;width:1em;height:1em;vertical-align:text-bottom;"></i> Saving...';
    if ((window as any).lucide) (window as any).lucide.createIcons();

    const textFields = ['notionToken','notionDb','geminiKey','gcsBucket','devKey','hashnodeKey','hashnodePubId','mediumKey'];
    const payload: Record<string, string | boolean> = {};

    textFields.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el?.value.trim()) payload[id] = el.value.trim();
    });

    // Always send toggle states
    (['enableDev','enableHashnode','enableMedium'] as const).forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement;
      if (el) payload[id] = el.checked;
    });

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        textFields.forEach(k => { if (payload[k]) keyStatus[k] = true; });
        switchView('settings');
      } else {
        alert('Failed to save. Please try again.');
        saveBtn.removeAttribute('disabled');
        saveBtn.innerHTML = '<i data-lucide="lock"></i> Save Settings';
      }
    } catch {
      alert('Network error.');
      saveBtn.removeAttribute('disabled');
      saveBtn.innerHTML = '<i data-lucide="lock"></i> Save Settings';
    }
  });
}

navItems.forEach(item => item.addEventListener('click', () => {
  const v = item.getAttribute('data-view');
  if (v) switchView(v);
}));

switchView('dashboard');
