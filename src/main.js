import { storage } from './storage';
import { getRecommendation } from './engine';
import { cardPresets } from './presets';

// App state
let cards = [];
let payments = [];
let userPresets = [];
let rewardTierCount = 0;
let presetRewardTierCount = 0;
let lastNotifiedTransactionCount = 0;
let onboardingCompleted = false;

// Utility: Detect iOS - Used for PWA install instructions
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Utility: Detect Apple Devices (iOS and macOS) for Shortcuts support
function isApple() {
    return isIOS() || /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent);
}

// Utility: Detect Safari Browser (includes macOS and iOS)
function isSafari() {
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

// Utility: Check if running in standalone mode (installed PWA)
function isStandalone() {
    // Strictly detect if the app is running in its own dedicated window
    const matchesStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    console.debug('[PWA] Standalone check:', {
        isStandaloneMode: !!matchesStandalone,
        isMediaStandalone: window.matchMedia('(display-mode: standalone)').matches,
        isSafariStandalone: window.navigator.standalone === true
    });

    return !!matchesStandalone;
}

// Utility: Detect mobile device - Optimized to avoid forced reflows
const mobileMediaQuery = window.matchMedia('(max-width: 768px)');
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        mobileMediaQuery.matches ||
        (navigator.maxTouchPoints > 0 && /Macintosh/.test(navigator.userAgent));
}

// Initialize app
async function init() {
    await loadData();
    // Debug: log onboarding sources so we can diagnose resume issues
    try {
        storage.get('onboardingCompleted').then(v => console.debug('[debug] storage.onboardingCompleted =>', v));
    } catch (e) { console.debug('[debug] storage.get failed', e); }
    try { console.debug('[debug] localStorage.onboardingCompleted =>', localStorage.getItem('onboardingCompleted')); } catch (e) { console.debug('[debug] localStorage read failed', e); }

    // If onboarding was previously completed (stored in IndexedDB), make sure
    // any pre-rendered skeleton overlay is removed and the helper class cleared.
    if (onboardingCompleted) {
        document.documentElement.classList.remove('show-onboarding');
        document.documentElement.classList.add('onboarded');
        const preOverlay = document.getElementById('onboardingOverlay');
        if (preOverlay) {
            try { preOverlay.remove(); } catch (e) { preOverlay.style.display = 'none'; }
        }

        const biometricEnabled = await storage.get('biometricEnabled');
        if (biometricEnabled) {
            showLockoutScreen();
        } else {
            await startApp();
            // Initial check for file updates
            await checkSyncStatus();
        }
        return;
    }

    // Otherwise, show the onboarding experience
    // Also handle deep links early so import modals appear even if onboarding skeleton is present
    try { checkDeepLinkImport(); } catch (e) { console.error('deep link check failed', e); }
    showOnboarding();
}

async function startApp() {
    // Primary Render
    renderCards();
    renderPayments();
    updatePaymentCardOptions();
    updateStats();

    // Secondary/Background Tasks
    const secondaryTasks = async () => {
        renderPresetsLibrary();
        await storage.requestPersistence();
        updateStorageHealthUI();
        updateBackupStatusUI();
        registerServiceWorker();
        checkDeepLinkImport();
        addRewardTier();

        // Set up events that don't need to be immediate
        document.getElementById('addRewardBtn').addEventListener('click', addRewardTier);
        document.getElementById('cardForm').addEventListener('submit', handleCardSubmit);
        document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
        document.getElementById('recommendationForm').addEventListener('submit', handleRecommendationSubmit);
        document.getElementById('exportBtn')?.addEventListener('click', () => storage.exportData());
        document.getElementById('vaultExportBtn')?.addEventListener('click', () => storage.exportData());
        document.getElementById('vaultImportFile')?.addEventListener('change', handleImport);
        document.getElementById('addPresetRewardBtn').addEventListener('click', () => addPresetRewardTier());

        // Shortcut Automation Toggle Initialization
        const automationToggle = document.getElementById('shortcutAutomationToggle');
        if (automationToggle) {
            const enabled = await storage.get('enableShortcutsAutomation') !== false;
            automationToggle.checked = enabled;
            automationToggle.addEventListener('change', async (e) => {
                await storage.set('enableShortcutsAutomation', e.target.checked);
                console.log('[Shortcut] Automation enabled:', e.target.checked);
            });
        }
    };

    if (window.requestIdleCallback) {
        requestIdleCallback(() => secondaryTasks());
    } else {
        setTimeout(secondaryTasks, 100);
    }
    document.getElementById('presetForm').addEventListener('submit', handlePresetSubmit);

    // Backup & Sync listeners
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'linkBackupBtn') {
            const handle = await storage.linkBackupFile();
            if (handle) {
                // If it's a native handle (Chrome), we should also pull once
                if (!handle.isFallback) {
                    await storage.pullFromLinkedFile();
                }

                // Refresh everything
                await loadData();
                renderCards();
                renderPayments();
                updateStats();
                updateBackupStatusUI();
            }
        }
        if (e.target.id === 'unlinkVaultBtn') {
            if (confirm('Unlink this backup file? You will no longer have automatic live sync.')) {
                await storage.unlinkBackupFile();
                updateBackupStatusUI();
            }
        }
        if (e.target.id === 'importFromClipboardBtn') {
            await handleClipboardImport();
        }

        // Tab Switching Logic
        if (e.target.classList.contains('tab-btn')) {
            const targetTab = e.target.getAttribute('data-tab');
            switchTab(targetTab);
        }
        if (e.target.id === 'resetAppBtn') {
            if (confirm('CRITICAL: This will PERMANENTLY DELETE all local cards, payments, and settings. Your linked backup file will NOT be touched. Are you sure you want to proceed?')) {
                await storage.clearAllData();
                try { localStorage.removeItem('onboardingCompleted'); } catch (e) { }
                window.location.reload();
            }
        }
        if (e.target.id === 'requestPersistenceBtn') {
            const success = await storage.requestPersistence();
            if (success) {
                alert('Storage persistence granted! Your data is now safer from system eviction.');
            } else {
                alert('Persistence request was denied or is not supported. Try adding the app to your Home Screen.');
            }
            updateStorageHealthUI();
        }
        if (e.target.id === 'mobileShareBackupBtn') {
            await handleMobileShareBackup();
        }
        const syncBtn = e.target.closest('#syncBackupBtn');
        if (syncBtn) {
            const result = await storage.syncToLinkedFile();
            if (result.success) {
                updateBackupStatusUI();
                if (result.isManual) {
                    alert('Backup file generated! Please save it to your local folder, overwriting the old one if needed.');
                }
            } else {
                alert('Sync failed: ' + result.error);
            }
        }

        const pullBtn = e.target.closest('#pullSyncBtn');
        if (pullBtn) {
            // SYNC check for API support to maintain user gesture context for Safari
            if (storage.supportsFileSystemApi()) {
                // For Chrome/Edge, we can use the async pull logic
                const result = await storage.pullFromLinkedFile();
                if (result.success) {
                    await loadData();
                    renderCards();
                    renderPayments();
                    updateStats();
                    updateBackupStatusUI();
                    alert('Success: Data pulled from linked file.');
                } else {
                    alert('Pull failed: ' + result.error);
                }
            } else {
                // For Safari/Firefox, trigger the hidden import input IMMEDIATELY
                // Awaiting anything before this can break Safari's security rules for file inputs
                document.getElementById('vaultImportFile').click();
            }
        }

        if (e.target.closest('#viewShortcutGuideBtn')) {
            showShortcutGuide();
        }
    });

    // Special handler for the vault import file to ensure it refreshes the UI properly
    document.getElementById('vaultImportFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                await storage.importData(file);
                await loadData();
                renderCards();
                renderPayments();
                updateStats();
                updateBackupStatusUI();
                alert('Import successful! Your dashboard has been updated.');
            } catch (err) {
                alert('Import failed: ' + err.message);
            }
            e.target.value = ''; // Reset
        }
    });

    // Check for external file changes when app returns to focus
    window.addEventListener('focus', () => {
        checkSyncStatus();
    });
}

// Check if the linked file has been modified externally and prompt to pull
async function checkSyncStatus() {
    const hasChanges = await storage.checkForExternalChanges();
    if (hasChanges) {
        const info = await storage.getBackupStatus();
        if (confirm(`A newer version of your vault (${info.fileName}) was detected. Would you like to sync those changes into your app?`)) {
            const result = await storage.pullFromLinkedFile();
            if (result.success) {
                // Refresh local data
                await loadData();
                renderCards();
                renderPayments();
                updateStats();
                updateBackupStatusUI();
                alert('Sync complete! Your data is now up-to-date with your linked file.');
            } else {
                alert('Sync failed: ' + result.error);
            }
        }
    }
}

function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // Update panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === tabId);
    });
}

async function loadData() {
    cards = await storage.get('cards') || [];
    payments = await storage.get('payments') || [];
    userPresets = await storage.get('userPresets') || [];
    onboardingCompleted = await storage.get('onboardingCompleted') || false;
}

function handleImport(e) {
    const file = e.target.files[0];
    if (file) {
        if (!confirm('CRITICAL: This will PERMANENTLY REPLACE your current local cards and transaction history with the data from this backup file. Continue?')) {
            e.target.value = '';
            return;
        }

        storage.importData(file).then(async () => {
            if (confirm('Restoration successful! Your local data has been updated.\n\nWould you like to LINK this file for "Universal Live Sync" as well? This ensures future changes are saved to it automatically.')) {
                await storage.linkBackupFile();
            }
            window.location.reload();
        }).catch(err => {
            alert('Error importing data: ' + err.message);
        });
    }
}

function addRewardTier() {
    rewardTierCount++;
    const container = document.getElementById('rewardsContainer');
    const tierDiv = document.createElement('div');
    tierDiv.className = 'reward-tier';
    tierDiv.id = `reward-tier-${rewardTierCount}`;
    tierDiv.innerHTML = `
        <div class="reward-tier-header">
            <span class="tier-number">Tier ${rewardTierCount}</span>
            <button type="button" class="remove-tier-btn" data-id="${rewardTierCount}">×</button>
        </div>
        <div class="tier-grid">
            <div class="tier-rate-input">
                <label class="inline-label">Rate</label>
                <input type="number" step="0.1" placeholder="3.0" class="tier-rate" required style="width: 100%;">
                <span class="rate-suffix">%</span>
            </div>
            <div>
                <label class="inline-label">Category / Merchant</label>
                <input type="text" placeholder="e.g., Dining, Apple Store, Travel" class="tier-category" required>
            </div>
        </div>
        <div class="condition-method-grid">
            <div>
                <label for="tier-method-${rewardTierCount}" class="inline-label">Payment Method</label>
                <select id="tier-method-${rewardTierCount}" class="tier-method">
                    <option value="any">Any method</option>
                    <option value="apple-pay">Apple Pay required</option>
                    <option value="google-pay">Google Pay required</option>
                    <option value="physical-card">Physical card only</option>
                    <option value="tap">Tap/contactless only</option>
                    <option value="online">Online only</option>
                </select>
            </div>
            <div>
                <label for="tier-merchants-${rewardTierCount}" class="inline-label">Specific Merchants (Optional)</label>
                <input type="text" id="tier-merchants-${rewardTierCount}" placeholder="e.g., Apple, Nike, Uber" class="tier-merchants">
            </div>
        </div>
        <div class="condition-method-grid" style="margin-top: 12px;">
            <div>
                <label for="tier-cap-${rewardTierCount}" class="inline-label">Spending Cap</label>
                <input type="number" id="tier-cap-${rewardTierCount}" step="0.01" placeholder="e.g., 2500" class="tier-cap">
            </div>
            <div>
                <label for="tier-cap-period-${rewardTierCount}" class="inline-label">Cap Period</label>
                <select id="tier-cap-period-${rewardTierCount}" class="tier-cap-period">
                    <option value="none">No cap (unlimited)</option>
                    <option value="quarterly">Per Quarter</option>
                    <option value="annual">Per Year</option>
                    <option value="monthly">Per Month</option>
                    <option value="statement">Per Statement Period</option>
                </select>
            </div>
        </div>
        <div class="form-group" style="margin-top: 12px; margin-bottom: 0;">
            <label class="inline-label">
                <input type="checkbox" class="tier-combined-cap" style="width: auto; margin-right: 8px; display: inline-block;">
                Combined cap with other tiers
            </label>
        </div>
    `;
    container.appendChild(tierDiv);

    tierDiv.querySelector('.remove-tier-btn').addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        removeTier(id);
    });
}

function removeTier(tierId) {
    const tier = document.getElementById(`reward-tier-${tierId}`);
    if (tier) {
        tier.style.animation = 'scaleOut 0.3s ease-out';
        setTimeout(() => tier.remove(), 300);
    }
}

async function handleCardSubmit(e) {
    e.preventDefault();
    const rewards = [];
    document.querySelectorAll('.reward-tier').forEach(tier => {
        const rate = tier.querySelector('.tier-rate').value;
        const category = tier.querySelector('.tier-category').value;
        if (rate && category) {
            rewards.push({
                rate: parseFloat(rate),
                category: category.trim(),
                method: tier.querySelector('.tier-method').value,
                merchants: tier.querySelector('.tier-merchants').value.trim(),
                spendingCap: parseFloat(tier.querySelector('.tier-cap').value) || null,
                capPeriod: tier.querySelector('.tier-cap-period').value,
                combinedCap: tier.querySelector('.tier-combined-cap').checked
            });
        }
    });

    const card = {
        id: Date.now(),
        name: document.getElementById('cardName').value,
        issuer: document.getElementById('cardIssuer').value,
        rewards: rewards,
        perks: document.getElementById('cardPerks').value
    };

    cards.push(card);
    await storage.set('cards', cards);
    renderCards();
    updatePaymentCardOptions();
    e.target.reset();
    document.getElementById('rewardsContainer').innerHTML = '';
    rewardTierCount = 0;
    addRewardTier();
}

function renderCards() {
    const container = document.getElementById('cardsList');
    if (cards.length === 0) {
        container.innerHTML = '<div class="empty-state">No cards added yet.</div>';
        return;
    }
    container.innerHTML = cards.map(card => `
        <div class="card-item">
            <div class="card-item-header">
                <div>
                    <div class="card-name">${card.name}</div>
                    <div class="card-issuer">${card.issuer}</div>
                </div>
                <button class="delete-btn" data-id="${card.id}">×</button>
            </div>
            <div class="card-categories">
                ${card.rewards.map(r => `<span class="category-badge">${r.rate}% ${r.category}</span>`).join('')}
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = Number(e.target.getAttribute('data-id'));
            if (confirm('Delete this card?')) {
                cards = cards.filter(c => c.id !== id);
                await storage.set('cards', cards);
                renderCards();
                renderPresetsLibrary();
                updatePaymentCardOptions();
            }
        });
    });
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    const cardId = Number(document.getElementById('paymentCard').value);
    const card = cards.find(c => c.id === cardId);
    if (!card) return;

    const payment = {
        id: Date.now(),
        amount: parseFloat(document.getElementById('paymentAmount').value),
        category: document.getElementById('paymentCategory').value,
        cardId: cardId,
        cardName: card.name,
        method: document.getElementById('paymentMethod').value,
        date: new Date().toISOString()
    };

    payments.unshift(payment);
    await storage.set('payments', payments);
    renderPayments();
    updateStats();
    e.target.reset();
}

function renderPayments() {
    const container = document.getElementById('paymentsList');
    if (payments.length === 0) {
        container.innerHTML = '<div class="empty-state">No payments yet.</div>';
        return;
    }
    container.innerHTML = payments.slice(0, 5).map(p => `
        <div class="payment-item">
            <div class="payment-info">
                <div class="payment-amount">$${p.amount.toFixed(2)}</div>
                <div class="payment-details">${p.category} • ${p.cardName}</div>
            </div>
            <button class="delete-btn" data-id="${p.id}">×</button>
        </div>
    `).join('');

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = Number(e.target.getAttribute('data-id'));
            payments = payments.filter(p => p.id !== id);
            await storage.set('payments', payments);
            renderPayments();
            updateStats();
        });
    });
}

function updatePaymentCardOptions() {
    const select = document.getElementById('paymentCard');
    select.innerHTML = '<option value="">Select a card...</option>' +
        cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function updateStats() {
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    document.getElementById('totalSpent').textContent = `$${total.toFixed(2)}`;
    document.getElementById('totalPayments').textContent = payments.length;
    updateSecurityUI(); // Update security section
    updateStorageHealthUI(); // Update health when data changes
    updateBackupStatusUI(); // Update backup status (nudge if needed)
}

async function updateSecurityUI() {
    const container = document.getElementById('securityStatusArea');
    if (!container) return;

    const enabled = await storage.get('biometricEnabled');
    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); padding: 16px; border-radius: 12px; border: 1px solid var(--border);">
            <div>
                <div style="font-weight: 600; color: var(--text-primary);">Biometric Unlock</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${enabled ? 'FaceID / TouchID is active' : 'Disabled'}</div>
            </div>
            <button id="toggleBiometricsBtn" class="${enabled ? 'btn-danger' : 'btn'}" style="padding: 8px 20px; font-size: 0.9rem;">
                ${enabled ? 'Disable' : 'Enable'}
            </button>
        </div>
    `;

    document.getElementById('toggleBiometricsBtn').onclick = async () => {
        if (enabled) {
            if (confirm('Disable biometric security? Anyone with access to your device will be able to see your cards.')) {
                await storage.set('biometricEnabled', false);
                updateSecurityUI();
            }
        } else {
            // Trigger registration flow again
            const success = await registerBiometrics();
            if (success) updateSecurityUI();
        }
    };
}

async function registerBiometrics() {
    try {
        const available = await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!available) {
            alert('Biometric authentication is not supported or enabled on this device.');
            return false;
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge,
                rp: { name: "OptimalSwipe" },
                user: {
                    id: new Uint8Array(16),
                    name: "local-user",
                    displayName: "Local User"
                },
                pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                authenticatorSelection: {
                    userVerification: "required",
                    authenticatorAttachment: "platform"
                }
            }
        });

        if (credential) {
            await storage.set('biometricEnabled', true);
            alert('Biometric security enabled successfully!');
            return true;
        }
    } catch (error) {
        console.error('Biometric registration failed:', error);
        alert('Could not enable biometrics.');
    }
    return false;
}

async function updateStorageHealthUI() {
    const healthContainer = document.getElementById('storageHealth');
    if (!healthContainer) return;

    const status = await storage.getStorageStatus();
    const isSafe = status.persisted;
    const usageMB = (status.usage / (1024 * 1024)).toFixed(2);
    const quotaMB = status.quota > 0 ? (status.quota / (1024 * 1024)).toFixed(0) : 'SYSTEM';
    const percent = status.quota > 0 ? Math.max(2, status.percentage) : 2;

    healthContainer.innerHTML = `
        <div class="health-status">
            <span class="status-pill ${isSafe ? 'status-safe' : 'status-warning'}">
                ${isSafe ? '✓ PERSISTENT (SAFE)' : '⚠ BEST EFFORT (EVICTABLE)'}
            </span>
        </div>
        <div class="quota-bar-container" title="${usageMB} MB used of ${quotaMB} MB">
            <div class="quota-bar" style="width: ${percent}%"></div>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: 'IBM Plex Mono', monospace;">
            ${usageMB} MB / ${quotaMB} MB MAX
        </div>
    `;

    const pwaStatus = document.getElementById('pwaStatus');
    if (pwaStatus) {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        const isSecure = window.isSecureContext;

        let statusHtml = '';
        if (isStandalone) {
            statusHtml += '<div style="color: var(--accent-emerald); margin-bottom: 4px;">✓ Running in Standalone PWA Mode</div>';
        } else {
            statusHtml += '<div style="color: var(--accent-ruby); margin-bottom: 4px;">⚠ Running in Safari (Not Standalone)</div>';
            statusHtml += '<div style="font-size: 0.75rem; margin-bottom: 8px;">To enable true sync & standalone mode, use "Add to Home Screen".</div>';
        }

        if (!isSecure) {
            statusHtml += '<div style="color: var(--accent-ruby); font-size: 0.75rem; border: 1px dashed var(--accent-ruby); padding: 8px; border-radius: 4px;">';
            statusHtml += '<strong>Security Alert:</strong> You are on an insecure connection (HTTP). ';
            statusHtml += 'iOS disables "Storage Persistence" and "PWA Standalone Linking" on non-HTTPS sites. ';
            statusHtml += 'Use a real domain or <code>localhost</code> (not IP) if possible.';
            statusHtml += '</div>';
        }

        pwaStatus.innerHTML = statusHtml;
    }
}

async function updateBackupStatusUI() {
    const container = document.getElementById('backupStatus');
    const vaultContainer = document.getElementById('vaultSyncArea');

    const status = await storage.getBackupStatus();
    const timeAgo = status.lastBackupTime ? getTimeAgo(status.lastBackupTime) : 'Never';
    const isNudgeNeeded = status.pendingTransactions >= 5 || (Date.now() - status.lastBackupTime > 7 * 24 * 60 * 60 * 1000 && status.lastBackupTime > 0);

    // iOS Specific UI
    if (container) {
        container.innerHTML = `
            <div class="backup-status">
                <div class="backup-info">
                    <div class="backup-time">Last Wallet Sync: ${status.lastWalletSyncTime ? getTimeAgo(status.lastWalletSyncTime) : 'Never'}</div>
                    <div style="margin-top: 12px; padding: 12px; background: rgba(244, 196, 48, 0.1); border-radius: 8px; border-left: 3px solid var(--accent-gold);">
                        <div style="font-weight: 600; margin-bottom: 8px; color: var(--accent-gold);">📋 How to Sync from Apple Wallet:</div>
                        <ol style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: var(--text-secondary);">
                            <li>Run your iOS Shortcut to copy wallet data</li>
                            <li>Return to this app</li>
                            <li>Tap the button below to import</li>
                        </ol>
                    </div>
                    <button id="importFromClipboardBtn" class="btn" style="width: 100%; margin-top: 12px;">
                        📋 Import from Clipboard
                    </button>
                </div>
            </div>
        `;
    }

    // Universal Detailed Vault UI
    if (vaultContainer) {
        let vaultHtml = `
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div id="syncStatusBadge" class="backup-status" style="margin-top: 0;">
                    <div class="backup-info">
                        <div class="backup-time">Last File Backup: ${timeAgo}</div>
                        ${isNudgeNeeded ? `<div class="backup-nudge">⚠ ${status.pendingTransactions} unsynced items</div>` : ''}
                    </div>
                </div>
                <div style="font-size: 0.85rem; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
                    <strong>Mode:</strong> ${status.isLinked ? `Linked to <span style="color: var(--accent-emerald)">${status.fileName}</span>` : 'Stand-alone mode'}
                </div>
        `;

        if (status.isLinked) {
            if (status.isNative) {
                // CHROME/EDGE: True Automatic Sync
                vaultHtml += `
                    <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid var(--accent-emerald); border-radius: 8px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; color: var(--accent-emerald); font-weight: 600; font-size: 0.85rem;">
                            <span>✨ Live Sync Active</span>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Your linked file is updated instantly in the background.</p>
                    </div>
                    <button id="syncBackupBtn" class="btn" style="width: 100%;">🔄 Sync Now (${status.pendingTransactions} pending)</button>
                    <div style="margin-top: 12px; text-align: center;">
                        <button id="unlinkVaultBtn" class="btn-danger" style="font-size: 0.8rem; padding: 6px 16px;">Unlink Vault</button>
                    </div>
                `;
            } else {
                // SAFARI/FIREFOX: Managed Backup (Manual Push/Pull)
                const pullTimeText = status.lastPullTime ? getTimeAgo(status.lastPullTime) : 'Never';
                vaultHtml += `
                    <div style="padding: 12px; background: rgba(255, 255, 255, 0.03); border: 1px dashed var(--border); border-radius: 8px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; color: var(--accent-gold); font-weight: 600; font-size: 0.85rem;">
                            <span>💡 Pro Tip</span>
                            <span style="font-size: 0.7rem; font-weight: normal; color: var(--text-muted);">Refreshed: ${pullTimeText}</span>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">Tap <strong>Pull Updates</strong> after mobile purchases to sync your iCloud data.</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="syncBackupBtn" class="btn" style="flex: 1; font-size: 0.8rem;">📤 Push Changes</button>
                        <button id="pullSyncBtn" class="btn-secondary" style="flex: 1; font-size: 0.8rem;">📥 Pull Updates</button>
                    </div>
                    <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 12px; text-align: center;">
                        <span class="icon">ℹ️</span> Safari/Firefox: Choose "Replace" when saving to overwrite.
                    </p>
                    <div style="margin-top: 8px; text-align: center;">
                        <button id="unlinkVaultBtn" class="btn-danger" style="font-size: 0.8rem; padding: 6px 16px;">Unlink Vault</button>
                    </div>
                `;
            }
        } else {
            // Enable linking for all desktop browsers (even those without native API via fallback)
            vaultHtml += `
                <button id="linkBackupBtn" class="btn-secondary" style="width: 100%;">Link Local Backup File</button>
            `;
        }
        vaultHtml += `</div>`;
        vaultContainer.innerHTML = vaultHtml;
    }
}

async function sendBackupNotification(pendingCount) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
    }

    if (Notification.permission === 'granted') {
        new Notification('OptimalSwipe: Backup Recommended', {
            body: `${pendingCount} new transactions since your last backup. Sync now to protect your data!`,
            icon: '/pwa-192x192.png',
            badge: '/favicon.ico'
        });
    }
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && !window.location.host.includes('localhost')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(registration => {
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateBanner();
                            }
                        });
                    });
                });
        });
    }
}

function showUpdateBanner() {
    const banner = document.getElementById('updateBanner');
    const reloadBtn = document.getElementById('reloadBtn');
    if (banner && reloadBtn) {
        banner.style.display = 'flex';
        reloadBtn.onclick = () => {
            window.location.reload();
        };
    }
}

async function handleRecommendationSubmit(e) {
    e.preventDefault();
    const resultContainer = document.getElementById('recommendationResult');
    resultContainer.innerHTML = '<div class="loading"></div>';

    const purchaseDetails = {
        category: document.getElementById('recCategory').value,
        amount: parseFloat(document.getElementById('recAmount').value),
        paymentMethod: document.getElementById('recPaymentMethod').value,
        merchant: document.getElementById('recMerchant').value,
        context: document.getElementById('recContext').value
    };

    const options = await getRecommendation(cards, payments, purchaseDetails);

    if (options.error) {
        resultContainer.innerHTML = `<div class="empty-state">${options.error}</div>`;
        return;
    }

    if (options.length === 0) {
        resultContainer.innerHTML = '<div class="empty-state">No eligible cards found.</div>';
        return;
    }

    const best = options[0];
    resultContainer.innerHTML = `
        <div class="recommendation-card">
            <div class="recommendation-title">${best.card.name}</div>
            <div class="recommendation-reason">
                Earns <strong>$${best.cashbackValue.toFixed(2)}</strong> cashback (${best.effectiveRate.toFixed(2)}%) on this purchase.
            </div>
            <div class="recommendation-benefits">
                <span class="benefit-badge">$${best.cashbackValue.toFixed(2)} cashback</span>
                <span class="benefit-badge">${best.effectiveRate.toFixed(2)}% rate</span>
                <span class="benefit-badge">${best.capStatus}</span>
            </div>
        </div>
    `;

    // Run iOS Shortcut if on an Apple device and enabled
    const enableShortcutsAutomation = await storage.get('enableShortcutsAutomation') !== false;
    if (isApple() && enableShortcutsAutomation) {
        const amount = purchaseDetails.amount || 0;
        const category = purchaseDetails.category || '';
        // Construct input exactly as user requested: amount=X%26category=Y
        const shortcutUrl = `shortcuts://run-shortcut?name=RecommendCard&input=amount=${amount}%26category=${encodeURIComponent(category)}`;

        console.log('[Shortcut] Triggering:', shortcutUrl);
        // Use a slight delay to ensure UI renders before app switch
        setTimeout(() => {
            window.location.href = shortcutUrl;
        }, 300);
    }
}

async function checkDeepLinkImport() {
    const params = new URLSearchParams(window.location.search);
    const importData = params.get('import');
    if (!importData) return;

    try {
        let batch = JSON.parse(decodeURIComponent(importData));
        // Normalize to array if it's a single object
        if (!Array.isArray(batch)) {
            batch = [batch];
        }

        if (batch.length > 0) {
            handleBatchImport(batch);
        }
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e) {
        console.error('Failed to parse import data:', e);
    }
}

function handleBatchImport(batch) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // Ensure modal appears above any onboarding skeleton (onboarding uses z-index:20000)
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '30001';

    let itemsHtml = batch.map(item => `
        <div class="import-item">
            <div class="info">
                <div style="font-weight: 600;">${item.merch || 'Unknown Merchant'}</div>
                <div class="details">${item.card || 'Default Card'} • ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="amount">+$${parseFloat(item.amt).toFixed(2)}</div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="modal-content">
            <h3>Sync from Wallet</h3>
            <p style="color: var(--text-secondary); margin-bottom: 16px;">
                Found <strong>${batch.length}</strong> new transactions. Apply these to your spending caps?
            </p>
            <div class="import-list">${itemsHtml}</div>
            <div class="modal-actions">
                <button id="cancelImport" class="btn-secondary" style="flex: 1;">Cancel</button>
                <button id="confirmImport" class="btn" style="flex: 1;">Apply All</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('cancelImport').onclick = () => overlay.remove();
    document.getElementById('confirmImport').onclick = async () => {
        await processBatchImport(batch);
        overlay.remove();
    };
}

async function handleClipboardImport() {
    try {
        let clipboardText = '';

        // Check if Clipboard API is available
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                clipboardText = await navigator.clipboard.readText();
            } catch (clipError) {
                // Clipboard API failed, fall back to prompt
                console.warn('Clipboard API not available, using prompt fallback');
                clipboardText = null;
            }
        }

        // Fallback for iOS PWA: Use prompt
        if (!clipboardText) {
            clipboardText = prompt(
                'Paste the transaction data from your Shortcut:\n\n' +
                '(After running your iOS Shortcut, the data should be copied. ' +
                'Long-press in the box below and tap "Paste")'
            );
        }

        if (!clipboardText || clipboardText.trim() === '') {
            alert('No data provided. Please copy transaction data from your iOS Shortcut first.');
            return;
        }

        // Try to parse as JSON
        let batch;
        try {
            batch = JSON.parse(clipboardText);
        } catch (e) {
            alert('Invalid data format. Please ensure the iOS Shortcut copied valid JSON data.');
            return;
        }

        // Normalize to array
        if (!Array.isArray(batch)) {
            batch = [batch];
        }

        if (batch.length === 0) {
            alert('No transactions found in the data.');
            return;
        }

        // Validate data structure
        const isValid = batch.every(item =>
            item && typeof item === 'object' &&
            (item.amt !== undefined || item.amount !== undefined)
        );

        if (!isValid) {
            alert('Invalid transaction data format. Each transaction must have an amount.');
            return;
        }

        // Use existing batch import UI
        handleBatchImport(batch);

    } catch (error) {
        console.error('Clipboard import error:', error);
        alert('Failed to import: ' + error.message);
    }
}

async function processBatchImport(batch) {

    for (const item of batch) {
        // Find card by name (partial match)
        const card = cards.find(c => c.name.toLowerCase().includes((item.card || '').toLowerCase())) || cards[0];

        const newPayment = {
            id: Date.now() + Math.random(),
            amount: parseFloat(item.amt),
            category: item.category || 'General',
            cardId: card ? card.id : null,
            cardName: card ? card.name : 'Unknown',
            method: 'apple-pay',
            merchant: item.merch || 'Unknown Merchant',
            date: new Date().toISOString()
        };

        // Simple deduplication: Check if same merchant/amount/date exists
        const exists = payments.some(p =>
            p.amount === newPayment.amount &&
            p.merchant === newPayment.merchant &&
            new Date(p.date).toDateString() === new Date(newPayment.date).toDateString()
        );

        if (!exists) {
            payments.unshift(newPayment);
        }
    }

    await storage.set('payments', payments);
    await storage.updateWalletSyncTime();
    renderPayments();
    updateStats();
}

async function showOnboarding() {
    let overlay = document.getElementById('onboardingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay';
        overlay.id = 'onboardingOverlay';
        document.body.appendChild(overlay);
    }

    const isMobile = isMobileDevice();
    const isStandaloneMode = isStandalone();
    let currentStep = await storage.get('onboardingCurrentStep') || 1;

    // Auto-advance if we just opened the standalone app for the first time
    if (isStandalone() && currentStep === 1) {
        console.log('[PWA] Standalone detected on load. Advancing.');
        currentStep = 2;
        await storage.set('onboardingCurrentStep', 2);
    }

    // Auto-check standalone status while on Step 1 to handle timing issues
    const standalonePoll = setInterval(() => {
        if (currentStep === 1 && isStandalone()) {
            console.log('[PWA] Standalone detected via polling. Advancing.');
            currentStep = 2;
            storage.set('onboardingCurrentStep', 2);
            if (typeof updateWizardUI === 'function') updateWizardUI();
            clearInterval(standalonePoll);
        }
        if (onboardingCompleted || currentStep > 1) {
            clearInterval(standalonePoll);
        }
    }, 1000);

    // Force back to step 1 if we're in a browser and haven't bridged yet
    if (!isStandalone() && currentStep > 1) {
        currentStep = 1;
        await storage.set('onboardingCurrentStep', 1);
    }

    let hasExported = false;
    let hasLinked = false;
    const selectedPresets = new Set();
    const allPresets = [...cardPresets, ...userPresets];

    // Load previously selected cards if any
    const savedSelections = await storage.get('onboardingSelections') || [];
    savedSelections.forEach(id => selectedPresets.add(id));

    const presetsHtml = allPresets.map(preset => `
        <div class="preset-item" data-id="${preset.id}">
            <div class="preset-card-mini" style="background: ${preset.color}; border: 1px solid ${preset.color === '#f5f5f7' ? '#d1d1d6' : 'transparent'};"></div>
            <div class="preset-name">${preset.name}</div>
            <div class="preset-issuer">${preset.issuer}</div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="onboarding-scroll-area">
        <div class="onboarding-content">
            <div class="onboarding-header">
                <h1>Welcome to OptimalSwipe</h1>
                <div class="onboarding-stepper">
                    <div class="step-indicator active" data-step="1">
                        <div class="dot">1</div>
                        <span>Install</span>
                    </div>
                    <div class="step-indicator" data-step="2">
                        <div class="dot">2</div>
                        <span>Setup Wallet</span>
                    </div>
                    ${!isMobile ? `
                    <div class="step-indicator" data-step="3">
                        <div class="dot">3</div>
                        <span>Establish Vault</span>
                    </div>
                    <div class="step-indicator" data-step="4">
                        <div class="dot">4</div>
                        <span>Sync</span>
                    </div>
                    ` : ''}
                    <div class="step-indicator" data-step="5">
                        <div class="dot">${isMobile ? '3' : '5'}</div>
                        <span>Secure</span>
                    </div>
                </div>
            </div>
            
            <!-- Step 1: PWA Installation -->
            <div class="step-view active" data-step="1">
                <div class="onboarding-action-card">
                    <span class="icon-large">📲</span>
                    <h2>Install OptimalSwipe</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px; text-align: center;">
                        For the best experience, persistent storage, and full-screen mode, please install OptimalSwipe to your home screen or dock.
                    </p>
                    
                    <div id="onboardingInstallArea" style="width: 100%; margin-bottom: 24px;">
                        <button id="onboardingInstallBtn" class="btn" style="width: 100%;">
                            📲 Install App
                        </button>
                    </div>

                    <div id="onboardingBrowserAdvice" style="margin-bottom: 24px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); width: 100%; font-size: 0.85rem;">
                        ${storage.supportsFileSystemApi() ? `
                            <div style="display: flex; align-items: center; gap: 10px; color: var(--accent-emerald);">
                                <span style="font-size: 1.2rem;">🚀</span>
                                <p style="margin: 0;"><strong>Automatic Sync Active:</strong> Your browser supports seamless, background file saving for the best experience.</p>
                            </div>
                        ` : `
                            <div style="display: flex; align-items: flex-start; gap: 10px; color: var(--text-secondary);">
                                <span style="font-size: 1.2rem;">⚠️</span>
                                <p style="margin: 0; line-height: 1.4;">
                                    <strong>Manual Sync Only:</strong> Safari and mobile browsers do not support direct file access. You will need to manually save your data. ${!isMobile ? 'For <strong>Automatic Live Sync</strong>, we recommend Chrome or Edge on desktop.' : ''}
                                </p>
                            </div>
                        `}
                    </div>

                    <div id="onboardingInstalledMessage" style="display: none; text-align: center; background: rgba(0, 255, 127, 0.1); padding: 16px; border-radius: 12px; margin-bottom: 24px; cursor: pointer;" onclick="currentStep = 2; updateWizardUI();">
                        <p style="color: #00ff7f; font-weight: 600; margin: 0;">✓ App Already Installed & Ready</p>
                        <p style="color: #00ff7f; font-size: 0.75rem; margin-top: 4px; opacity: 0.8;">Click here if not auto-advancing</p>
                    </div>

                    <ul class="instruction-list">
                        <li><strong>Persistent Storage</strong>: PWAs have more reliable local storage.</li>
                        <li><strong>Offline Access</strong>: Access your wallet even without internet.</li>
                        <li><strong>Full Screen</strong>: Enjoy a beautiful, immersive app experience.</li>
                    </ul>

                    <div style="padding: 12px 16px; background: rgba(244, 196, 48, 0.05); border-radius: 12px; border: 1px solid rgba(244, 196, 48, 0.1); width: 100%;">
                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin: 0; line-height: 1.5; text-align: left;">
                            <span style="color: var(--accent-gold); font-weight: 700;">Note:</span> To prevent data fragmentation, please install from your <strong>primary browser only</strong>. Each browser install maintains its own private, local storage.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Step 2: Card Selection -->
            <div class="step-view" data-step="2">
                <p class="tagline" style="text-align: center; margin-bottom: 30px;">SELECT YOUR CARDS TO GET STARTED</p>
                <div id="onboardingPresetGrid" class="preset-grid">
                    <div class="loading-shimmer" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                        Loading recommended cards...
                    </div>
                </div>
            </div>

            <!-- Step 3: Establish Vault -->
            <div class="step-view" data-step="3">
                <div class="onboarding-action-card">
                    <span class="icon-large">💾</span>
                    <h2>Establish Your Data Vault</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">
                        OptimalSwipe works 100% locally. To ensure your data is safe and portable, we'll create your first encrypted backup file.
                    </p>
                    <button id="onboardingExportBtn" class="btn" style="width: 100%;">
                        Download Initial Backup
                    </button>
                    <div style="margin-top: 12px;">
                        <button id="onboardingHaveBackupBtn" class="btn-secondary" style="width: 100%; border: none; background: transparent; color: var(--accent-gold); text-decoration: underline;">
                            I already have a backup file
                        </button>
                    </div>
                    <ul class="instruction-list">
                        <li>Download the JSON backup file</li>
                        <li>Save it in a secure location (e.g., iCloud Drive)</li>
                        <li>This file will hold all your cards and history</li>
                    </ul>
                </div>
            </div>

            <!-- Step 4: Live Sync -->
            <div class="step-view" data-step="4">
                <div class="onboarding-action-card">
                    <span class="icon-large">🔄</span>
                    <h2>Enable Universal Live Sync</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px; text-align: center;">
                        Establish a live link to your backup file. Once linked, every change you make will be automatically saved directly to your linked file!
                    </p>
                    ${storage.supportsFileSystemApi() ? `
                    <button id="onboardingLinkBtn" class="btn" style="width: 100%;">
                        Link My Backup File
                    </button>
                    ` : `
                    <div class="info-box" style="margin-bottom: 24px;">
                        <span class="icon">ℹ️</span>
                        <p style="font-size: 0.9rem;">Automatic file linking is not supported by your current browser (common on Safari and Mobile). You can still use manual backups.</p>
                    </div>
                    <button class="btn-secondary" style="width: 100%;" onclick="document.getElementById('nextStep').click()">Continue Without Sync</button>
                    `}
                    <ul class="instruction-list">
                        <li>Select the file you just downloaded</li>
                        <li>Grant "Write Access" if your browser asks to save changes</li>
                        <li>Save to a cloud folder (like iCloud) for multi-device sync</li>
                    </ul>
                </div>
            </div>

            <!-- Step 5: Security Setup -->
            <div class="step-view" data-step="5">
                <div class="onboarding-action-card">
                    <span class="icon-large">🔐</span>
                    <h2>Secure Your Wallet</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px; text-align: center;">
                        Enable Biometric Unlock (FaceID/TouchID) to keep your wallet private. Your biometric data never leaves your device's secure enclave.
                    </p>
                    <div id="biometricSetupArea" style="width: 100%;">
                        <button id="enableBiometricsBtn" class="btn" style="width: 100%; margin-bottom: 12px;">
                            Enable FaceID / TouchID
                        </button>
                    </div>

                    <ul class="instruction-list">
                        <li>Instant access with your face or fingerprint</li>
                        <li>Protects your data if your device is unlocked</li>
                        <li>100% private and local authentication</li>
                    </ul>
                </div>
            </div>
        </div>
        </div> <!-- End of scroll area -->

        <div class="onboarding-footer">
            <button id="prevStep" class="btn-secondary">Back</button>
            <div class="footer-spacer" style="flex: 1;"></div>
            <button id="nextStep" class="btn">Continue</button>
        </div>
    `;

    if (!document.body.contains(overlay)) {
        document.body.appendChild(overlay);
    }

    const updateWizardUI = () => {
        const standalone = isStandalone();

        // AGGRESSIVE ENFORCEMENT: If in browser, you CANNOT stay past Step 1.
        if (!standalone && currentStep > 1) {
            console.warn('[PWA] Browser tab detected. Forcing back to Step 1 for installation.');
            currentStep = 1;
            storage.set('onboardingCurrentStep', 1);
        }

        // AGGRESSIVE ENFORCEMENT: If in standalone, you SHOULD NOT stay on Step 1.
        if (standalone && currentStep === 1) {
            currentStep = 2;
            storage.set('onboardingCurrentStep', 2);
        }

        // Update views
        overlay.querySelectorAll('.step-view').forEach(view => {
            view.classList.toggle('active', parseInt(view.getAttribute('data-step')) === currentStep);
        });

        // Update indicators
        overlay.querySelectorAll('.step-indicator').forEach(ind => {
            const stepNum = parseInt(ind.getAttribute('data-step'));
            ind.classList.toggle('active', stepNum === currentStep);
            ind.classList.toggle('completed', stepNum < currentStep);
        });

        // Update footer buttons
        const prevBtn = document.getElementById('prevStep');
        const nextBtn = document.getElementById('nextStep');

        prevBtn.style.display = currentStep === 1 ? 'none' : 'block';

        if (currentStep === 1) {
            const standalone = isStandalone();
            if (standalone) {
                nextBtn.innerText = 'Continue to Setup';
                nextBtn.disabled = false;
            } else {
                nextBtn.innerText = 'Waiting for App Launch...';
                nextBtn.disabled = true;
            }
        } else if (currentStep === 2) {
            nextBtn.innerText = isMobile ? 'Continue to Security' : 'Go to Vault Setup';
            nextBtn.disabled = false;
        } else if (currentStep === 3) {
            nextBtn.innerText = 'Go to Sync Setup';
            nextBtn.disabled = !hasExported;
        } else if (currentStep === 4) {
            nextBtn.innerText = 'Go to Security';
            nextBtn.disabled = storage.supportsFileSystemApi() ? !hasLinked : false;
        } else if (currentStep === 5) {
            nextBtn.innerText = 'Complete Setup';
            nextBtn.disabled = false;
        }
    };

    // Render presets asynchronously to keep the main thread fluid
    const renderOnboardingPresets = () => {
        const grid = document.getElementById('onboardingPresetGrid');
        if (!grid) return;

        requestAnimationFrame(() => {
            const presetsHtml = allPresets.map(preset => `
                <div class="preset-item ${selectedPresets.has(preset.id) ? 'selected' : ''}" data-id="${preset.id}">
                    <div class="preset-card-mini" style="background: ${preset.color}; border: 1px solid ${preset.color === '#f5f5f7' ? '#d1d1d6' : 'transparent'};"></div>
                    <div class="preset-name">${preset.name}</div>
                    <div class="preset-issuer">${preset.issuer}</div>
                </div>
            `).join('');
            grid.innerHTML = presetsHtml;
        });
    };

    // Card selection event
    overlay.querySelector('.preset-grid').addEventListener('click', async (e) => {
        const item = e.target.closest('.preset-item');
        if (!item) return;

        const id = item.getAttribute('data-id');
        if (selectedPresets.has(id)) {
            selectedPresets.delete(id);
            item.classList.remove('selected');
        } else {
            selectedPresets.add(id);
            item.classList.add('selected');
        }

        // Persist selections to IndexedDB
        await storage.set('onboardingSelections', Array.from(selectedPresets));
    });

    document.getElementById('onboardingExportBtn').onclick = async () => {
        // Add selected cards first so export has something
        const cardsToAdd = Array.from(selectedPresets).map(id => {
            const preset = [...cardPresets, ...userPresets].find(p => p.id === id);
            return { ...preset, presetId: preset.id, id: Date.now() + Math.random() };
        });
        cards = cardsToAdd;
        await storage.set('cards', cards);

        await storage.exportData();
        hasExported = true;
        document.getElementById('onboardingExportBtn').innerText = '✓ Backup Created';
        document.getElementById('onboardingExportBtn').classList.add('btn-secondary');
        updateWizardUI();
        alert('Initial backup downloaded! Now proceed to the final step.');
    };

    document.getElementById('onboardingHaveBackupBtn').onclick = () => {
        hasExported = true;
        currentStep++;
        updateWizardUI();
    };

    const linkBtn = document.getElementById('onboardingLinkBtn');
    if (linkBtn) {
        linkBtn.onclick = async () => {
            const handle = await storage.linkBackupFile();
            if (handle) {
                // Pull data immediately so onboarding reflects the backup
                await storage.pullFromLinkedFile();
                await loadData();

                hasLinked = true;
                linkBtn.innerText = '✓ Vault Linked & Restored';
                linkBtn.classList.add('btn-secondary');
                updateWizardUI();
                alert('Vault linked and data restored successfully!');
            }
        };
    }

    document.getElementById('enableBiometricsBtn').onclick = async () => {
        try {
            // Check if biometric auth is available
            const available = await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable();
            if (!available) {
                alert('Biometric authentication is not supported or enabled on this device.');
                return;
            }

            // WebAuthn Registration (Local-Only)
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: "OptimalSwipe" },
                    user: {
                        id: new Uint8Array(16),
                        name: "local-user",
                        displayName: "Local User"
                    },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }],
                    authenticatorSelection: {
                        userVerification: "required",
                        authenticatorAttachment: "platform"
                    }
                }
            });

            if (credential) {
                await storage.set('biometricEnabled', true);
                document.getElementById('enableBiometricsBtn').innerText = '✓ Biometrics Enabled';
                document.getElementById('enableBiometricsBtn').classList.add('btn-secondary');
                document.getElementById('enableBiometricsBtn').disabled = true;
                alert('Biometric security enabled successfully!');
            }
        } catch (error) {
            console.error('Biometric registration failed:', error);
            alert('Could not enable biometrics. Please ensure your device supports FaceID/TouchID and try again.');
        }
    };

    // PWA Install click handler for onboarding
    const onboardingInstallBtn = document.getElementById('onboardingInstallBtn');
    if (onboardingInstallBtn) {
        onboardingInstallBtn.onclick = async () => {
            if (isSafari()) {
                showSafariInstallGuide();
                return;
            }
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to onboarding install prompt: ${outcome}`);
                deferredPrompt = null;
                updateInstallButtonsVisibility();
            } else {
                showChromeInstallGuide();
            }
        };
    }

    // Determine initial visibility for install button in onboarding
    updateInstallButtonsVisibility();

    document.getElementById('prevStep').onclick = async () => {
        if (currentStep > 1) {
            if (isMobile && currentStep === 5) {
                currentStep = 2; // Jump back from Security to Wallet Setup
            } else {
                currentStep--;
            }
            await storage.set('onboardingCurrentStep', currentStep);
            updateWizardUI();
        }
    };

    document.getElementById('nextStep').onclick = async () => {
        if (currentStep === 1) {
            currentStep++;
            await storage.set('onboardingCurrentStep', currentStep);
            updateWizardUI();
        } else if (currentStep === 2) {
            if (selectedPresets.size === 0) {
                if (!confirm("You haven't selected any cards. Are you sure you want to add manually later?")) return;
            }
            // Skip vault/sync steps on mobile
            currentStep = isMobile ? 5 : 3;
            updateWizardUI();
        } else if (currentStep === 3) {
            currentStep++;
            await storage.set('onboardingCurrentStep', currentStep);
            updateWizardUI();
        } else if (currentStep === 4) {
            currentStep++;
            await storage.set('onboardingCurrentStep', currentStep);
            updateWizardUI();
        } else if (currentStep === 5) {
            onboardingCompleted = true;
            await storage.set('onboardingCompleted', true);
            await storage.delete('onboardingCurrentStep'); // Clear step persistence
            try { localStorage.setItem('onboardingCompleted', 'true'); } catch (e) { }
            await storage.set('onboardingSelections', []); // Clear saved selections
            // Ensure any pre-rendered overlay or helper classes are cleaned up
            document.documentElement.classList.remove('show-onboarding');
            document.documentElement.classList.add('onboarded');
            overlay.remove();
            startApp();
        }
    };

    console.log('App Initializing - v1.1.5');
    updateWizardUI();
    renderOnboardingPresets();
}


function renderPresetsLibrary() {
    const grid = document.getElementById('presetLibraryGrid');
    if (!grid) return;

    const allPresets = [...cardPresets, ...userPresets];
    grid.innerHTML = allPresets.map(preset => {
        const isAdded = cards.some(c => c.presetId === preset.id);
        return `
            <div class="preset-item ${isAdded ? 'added' : ''}" data-id="${preset.id}">
                <div class="preset-card-mini" style="background: ${preset.color}; border: 1px solid ${preset.color === '#f5f5f7' ? '#d1d1d6' : 'transparent'};"></div>
                <div class="preset-name">${preset.name}</div>
                <div class="preset-issuer">${preset.issuer}</div>
                <button class="btn-secondary add-from-preset" 
                        style="margin-top: 12px; width: 100%; padding: 8px;" 
                        onclick="${isAdded ? '' : `addCardFromPreset('${preset.id}')`}"
                        ${isAdded ? 'disabled' : ''}>
                    ${isAdded ? '✓ Added to Wallet' : 'Add to Wallet'}
                </button>
            </div>
        `;
    }).join('');
}

window.addCardFromPreset = async function (presetId) {
    const allPresets = [...cardPresets, ...userPresets];
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;

    const newCard = {
        ...preset,
        presetId: preset.id,
        id: Date.now() + Math.random()
    };

    cards = [...cards, newCard];
    await storage.set('cards', cards);
    renderCards();
    renderPresetsLibrary();
    updatePaymentCardOptions();
    updateStats();
    switchTab('my-cards');
    alert(`${preset.name} added to your wallet!`);
};

function addPresetRewardTier() {
    const container = document.getElementById('presetRewardTiers');
    const id = ++presetRewardTierCount;

    const tierDiv = document.createElement('div');
    tierDiv.className = 'reward-tier-form';
    tierDiv.id = `preset-tier-${id}`;
    tierDiv.innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>Category</label>
                <input type="text" class="preset-reward-category" placeholder="e.g. Dining" required>
            </div>
            <div class="form-group" style="flex: 0.5;">
                <label>Rate (%)</label>
                <input type="number" step="0.1" class="preset-reward-rate" placeholder="3.0" required>
            </div>
            <button type="button" class="delete-btn" onclick="document.getElementById('preset-tier-${id}').remove()" style="margin-top: 25px;">×</button>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Method</label>
                <select class="preset-reward-method">
                    <option value="any">Any</option>
                    <option value="apple-pay">Apple Pay</option>
                    <option value="other">Physical/Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Annual Cap ($0 for none)</label>
                <input type="number" class="preset-reward-cap" value="0">
            </div>
        </div>
    `;
    container.appendChild(tierDiv);
}

async function handlePresetSubmit(e) {
    e.preventDefault();

    const tiers = [];
    document.querySelectorAll('.reward-tier-form').forEach(tier => {
        tiers.push({
            category: tier.querySelector('.preset-reward-category').value,
            rate: parseFloat(tier.querySelector('.preset-reward-rate').value),
            method: tier.querySelector('.preset-reward-method').value,
            spendingCap: parseFloat(tier.querySelector('.preset-reward-cap').value) || 0,
            capPeriod: parseFloat(tier.querySelector('.preset-reward-cap').value) > 0 ? 'annual' : 'none',
            combinedCap: false
        });
    });

    const newPreset = {
        id: 'user-' + Date.now(),
        name: document.getElementById('presetName').value,
        issuer: document.getElementById('presetIssuer').value,
        color: document.getElementById('presetColor').value,
        rewards: tiers,
        perks: "User defined preset"
    };

    userPresets = [...userPresets, newPreset];
    await storage.set('userPresets', userPresets);

    renderPresetsLibrary();
    e.target.reset();
    document.getElementById('presetRewardTiers').innerHTML = '<div class="reward-tier-header">Reward Categories</div>';
    presetRewardTierCount = 0;

    switchTab('show-presets');
    alert('New preset added to library!');
}
async function showLockoutScreen() {
    const lockout = document.createElement('div');
    lockout.className = 'lockout-overlay';
    lockout.innerHTML = `
        <div class="lockout-content">
            <span class="lock-icon">🔐</span>
            <h1>Wallet Locked</h1>
            <p style="color: var(--text-secondary); margin-bottom: 30px;">
                OptimalSwipe is locked for your privacy.
            </p>
            <button id="unlockBtn" class="btn" style="min-width: 240px;">
                Unlock with Biometrics
            </button>
        </div>
    `;
    document.body.appendChild(lockout);

    document.getElementById('unlockBtn').onclick = async () => {
        const success = await unlockApp();
        if (success) {
            lockout.remove();
            startApp();
        }
    };

    // Auto-trigger on click anywhere too
    lockout.onclick = (e) => {
        if (e.target.id === 'unlockBtn') return;
        document.getElementById('unlockBtn').click();
    };

    // Auto-trigger on load
    setTimeout(() => {
        document.getElementById('unlockBtn').click();
    }, 500);
}

async function unlockApp() {
    try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const assertion = await navigator.credentials.get({
            publicKey: {
                challenge,
                timeout: 60000,
                userVerification: "required"
            }
        });

        return !!assertion;
    } catch (error) {
        console.error('Biometric unlock failed:', error);
        return false;
    }
}

// Mobile Backup Share Function
async function handleMobileShareBackup() {
    try {
        const allKeys = ['cards', 'payments', 'userPresets', 'biometricEnabled', 'onboardingCompleted'];
        const data = {
            version: '2.0.0',
            exportDate: new Date().toISOString()
        };

        for (const key of allKeys) {
            data[key] = await storage.get(key) || [];
        }

        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const fileName = `optimalswipe_backup_${new Date().toISOString().split('T')[0]}.json`;

        // Check if Web Share API is available
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], fileName, { type: 'application/json' });

            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'OptimalSwipe Backup',
                    text: 'Save this backup to iCloud Drive or Files app'
                });

                await storage.updateBackupInfo(data.payments.length);
                updateBackupStatusUI();
                return;
            }
        }

        // Fallback: Traditional download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await storage.updateBackupInfo(data.payments.length);
        updateBackupStatusUI();

    } catch (error) {
        console.error('Mobile backup share error:', error);
        alert('Failed to share backup. Try using "One-Time Export" instead.');
    }
}

// Shortcut Guide Modal
function showShortcutGuide() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10000';

    overlay.innerHTML = `
        <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3 style="margin-bottom: 16px;">🍎 iOS Shortcut Setup</h3>
            
            <div style="background: rgba(244, 196, 48, 0.1); padding: 16px; border-radius: 8px; border-left: 4px solid var(--accent-gold); margin-bottom: 20px;">
                <strong>What this does:</strong> Auto-imports transactions from Apple Wallet
            </div>

            <div style="margin-bottom: 24px;">
                <h4 style="color: var(--accent-gold); margin-bottom: 12px; font-size: 1rem;">Step 1: Create Automation</h4>
                <ol style="padding-left: 20px; color: var(--text-secondary); line-height: 1.8; font-size: 0.9rem;">
                    <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong></li>
                    <li>Tap <strong>+</strong> → Search <strong>"Wallet"</strong></li>
                    <li>Select <strong>"When I tap"</strong></li>
                    <li>Choose <strong>Any Card</strong>, <strong>When: Sent</strong></li>
                    <li>Set <strong>"Run Immediately"</strong></li>
                    <li>Turn <strong>OFF</strong> "Notify When Run"</li>
                </ol>
            </div>

            <div style="margin-bottom: 24px;">
                <h4 style="color: var(--accent-gold); margin-bottom: 12px; font-size: 1rem;">Step 2: Add Actions</h4>
                <ol style="padding-left: 20px; color: var(--text-secondary); line-height: 1.8; font-size: 0.9rem;">
                    <li>Add <strong>Text</strong> action with:
                        <pre style="background: var(--bg-primary); padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 0.75rem; margin: 8px 0;">{"amt": [Amount], "merch": "[Merchant]"}</pre>
                        <small style="color: var(--text-muted);">Replace with Shortcut Input variables</small>
                    </li>
                    <li>Add <strong>URL Encode</strong> → Use Text above</li>
                    <li>Add <strong>URL</strong>: <code style="background: var(--bg-primary); padding: 2px 6px; border-radius: 3px; font-size: 0.75rem;">${window.location.origin}/?import=</code></li>
                    <li>After <code>=</code>, insert <strong>Encoded Text</strong></li>
                    <li>Add <strong>Open URLs</strong></li>
                </ol>
            </div>

            <div style="background: rgba(80, 200, 120, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid var(--accent-emerald); margin-bottom: 16px; font-size: 0.85rem;">
                <strong>💡 Test:</strong> Tap Play in Shortcuts. If this app opens with a transaction popup, it works!
            </div>

            <div class="modal-actions">
                <button id="closeGuideBtn" class="btn" style="width: 100%;">Got It!</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('closeGuideBtn').onclick = () => overlay.remove();
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

// Custom PWA Installation Logic
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

function updateInstallButtonsVisibility() {
    const isSafariBrowser = isSafari();
    const isInstalled = isStandalone();

    console.debug('[PWA] updateInstallButtonsVisibility:', { isSafariBrowser, isInstalled, hasPrompt: !!deferredPrompt });

    // Ensure we show the install button if not installed
    const show = !!deferredPrompt || !isInstalled;

    if (installBtn) {
        installBtn.style.display = show ? 'block' : 'none';
        if (isSafariBrowser && !isInstalled) {
            installBtn.innerHTML = '<span class="icon">📲</span> Install Guide';
        } else if (!!deferredPrompt) {
            installBtn.innerHTML = '<span class="icon">📲</span> Install App';
        } else if (!isInstalled) {
            installBtn.innerHTML = '<span class="icon">📲</span> Install Guide';
        }
    }
    const onboardingInstallArea = document.getElementById('onboardingInstallArea');
    const onboardingInstalledMessage = document.getElementById('onboardingInstalledMessage');

    if (onboardingInstallArea || onboardingInstalledMessage) {
        if (isInstalled) {
            if (onboardingInstallArea) onboardingInstallArea.style.display = 'none';
            if (onboardingInstalledMessage) onboardingInstalledMessage.style.display = 'block';
        } else {
            // Not installed, show the installation area/instructions
            if (onboardingInstallArea) onboardingInstallArea.style.display = 'block';
            if (onboardingInstalledMessage) onboardingInstalledMessage.style.display = 'none';

            const onboardingBtn = document.getElementById('onboardingInstallBtn');
            if (onboardingBtn) {
                if (isSafariBrowser) {
                    onboardingBtn.innerHTML = `📲 How to Install on ${isIOS() ? 'iOS' : 'Safari'}`;
                } else if (!!deferredPrompt) {
                    onboardingBtn.innerHTML = '📲 Install OptimalSwipe';
                } else {
                    onboardingBtn.innerHTML = '📲 Manual Install Guide';
                }
            }
        }

        // If we just detected a transition to standalone mode, refresh UI
        if (isInstalled && typeof updateWizardUI === 'function') {
            updateWizardUI();
        }
    }
}

function showSafariInstallGuide() {
    const isIos = isIOS();
    const overlay = document.createElement('div');
    overlay.className = 'safari-install-overlay';
    overlay.style = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #1a2032;
        padding: 32px 24px 64px 24px;
        border-radius: 24px 24px 0 0;
        z-index: 100000;
        box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        text-align: center;
        border-top: 2px solid var(--accent-gold);
    `;

    const instruction1 = isIos
        ? `Tap the <strong>Share</strong> button <span style="font-size: 1.2rem; vertical-align: middle;">⎋</span> in Safari's bottom toolbar.`
        : `Tap the <strong>Share</strong> button <span style="font-size: 1.2rem; vertical-align: middle;">⎋</span> (top right) or go to <strong>File</strong> in the menu bar.`;

    const instruction2 = isIos
        ? `Scroll down and select <strong>"Add to Home Screen"</strong> <span style="font-size: 1.2rem; vertical-align: middle;">⊞</span>.`
        : `Select <strong>"Add to Dock..."</strong> <span style="font-size: 1.2rem; vertical-align: middle;">⊞</span> to install it as an app.`;

    overlay.innerHTML = `
        <div style="margin-bottom: 24px;">
            <div style="font-size: 2.5rem; margin-bottom: 16px;">📲</div>
            <h2 style="font-family: 'Playfair Display', serif; color: var(--accent-gold); margin-bottom: 12px;">Install OptimalSwipe</h2>
            <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6;">
                For the best experience, install OptimalSwipe to your ${isIos ? 'home screen' : 'dock'}. This enables full-screen mode and persistent storage.
            </p>
        </div>
        
        <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: left;">
            <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
                <div style="background: var(--accent-gold); color: #000; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 800;">1</div>
                <p style="color: var(--text-primary); font-size: 0.9rem;">${instruction1}</p>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 16px;">
                <div style="background: var(--accent-gold); color: #000; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 800;">2</div>
                <p style="color: var(--text-primary); font-size: 0.9rem;">${instruction2}</p>
            </div>
        </div>
        
        <button id="closeSafariGuide" class="btn" style="width: 100%;">Got It!</button>
        <div style="position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); width: 40px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px;"></div>
    `;

    const blurEffect = document.createElement('div');
    blurEffect.style = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.4);
        backdrop-filter: blur(4px);
        z-index: 99999;
        animation: fadeIn 0.3s ease;
    `;

    document.body.appendChild(blurEffect);
    document.body.appendChild(overlay);

    const close = () => {
        overlay.style.transform = 'translateY(100%)';
        overlay.style.transition = 'transform 0.3s ease-in';
        blurEffect.style.opacity = '0';
        blurEffect.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            overlay.remove();
            blurEffect.remove();
        }, 300);
    };

    document.getElementById('closeSafariGuide').onclick = close;
    blurEffect.onclick = close;
}

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    updateInstallButtonsVisibility();
});

if (installBtn) {
    installBtn.addEventListener('click', async () => {
        if (isSafari()) {
            showSafariInstallGuide();
            return;
        }
        if (deferredPrompt) {
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            // We've used the prompt, and can't use it again, throw it away
            deferredPrompt = null;
            // Hide the buttons
            updateInstallButtonsVisibility();
        } else {
            showChromeInstallGuide();
        }
    });
}

function showChromeInstallGuide() {
    const isAndroid = /Android/i.test(navigator.userAgent);
    const overlay = document.createElement('div');
    overlay.className = 'safari-install-overlay';
    overlay.style = `
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        background: #1a2032;
        padding: 32px 24px 64px 24px;
        border-radius: 24px 24px 0 0;
        z-index: 100000;
        box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        text-align: center;
        border-top: 2px solid var(--accent-gold);
    `;

    const instructions = isAndroid
        ? [
            `Tap the <strong>three dots</strong> <span style="font-size: 1.2rem; vertical-align: middle;">⋮</span> in the top right.`,
            `Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.`
        ]
        : [
            `Tap the <strong>Install Icon</strong> <span style="font-size: 1.2rem; vertical-align: middle;">⧉</span> in the address bar (right side).`,
            `Or click the <strong>three dots</strong> <span style="font-size: 1.2rem; vertical-align: middle;">⋮</span> → <strong>Save and Share</strong> → <strong>Install OptimalSwipe</strong>.`
        ];

    overlay.innerHTML = `
        <div style="margin-bottom: 24px;">
            <div style="font-size: 2.5rem; margin-bottom: 16px;">📲</div>
            <h2 style="font-family: 'Playfair Display', serif; color: var(--accent-gold); margin-bottom: 12px;">Install OptimalSwipe</h2>
            <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.6;">
                The automatic prompt didn't appear. You can still install manually for the best experience.
            </p>
        </div>
        
        <div style="background: rgba(255,255,255,0.03); border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: left;">
            <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px;">
                <div style="background: var(--accent-gold); color: #000; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 800;">1</div>
                <p style="color: var(--text-primary); font-size: 0.9rem;">${instructions[0]}</p>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 16px;">
                <div style="background: var(--accent-gold); color: #000; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 800;">2</div>
                <p style="color: var(--text-primary); font-size: 0.9rem;">${instructions[1]}</p>
            </div>
        </div>
        
        <div style="background: rgba(244, 196, 48, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 24px; font-size: 0.8rem; color: var(--text-secondary);">
            <strong>Note:</strong> If you are using an IP address or insecure connection, the browser may disable installation. Try using <strong>localhost</strong> or <strong>HTTPS</strong>.
        </div>
        
        <button id="closeChromeGuide" class="btn" style="width: 100%;">Got It!</button>
    `;

    const blurEffect = document.createElement('div');
    blurEffect.style = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.4);
        backdrop-filter: blur(4px);
        z-index: 99999;
        animation: fadeIn 0.3s ease;
    `;

    document.body.appendChild(blurEffect);
    document.body.appendChild(overlay);

    const close = () => {
        overlay.style.transform = 'translateY(100%)';
        overlay.style.transition = 'transform 0.3s ease-in';
        blurEffect.style.opacity = '0';
        blurEffect.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            overlay.remove();
            blurEffect.remove();
        }, 300);
    };

    document.getElementById('closeChromeGuide').onclick = close;
    blurEffect.onclick = close;
}

window.addEventListener('appinstalled', () => {
    console.log('PWA installed');
    deferredPrompt = null;
    // Hide the buttons
    updateInstallButtonsVisibility();
});

// Ensure overlay is not left visible when app resumes from background.
window.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        try {
            const completedFromStorage = await storage.get('onboardingCompleted');
            const completedFromLocal = (function () { try { return localStorage.getItem('onboardingCompleted') === 'true'; } catch (e) { return false; } })();
            console.debug('[debug] visibilitychange - storage:', completedFromStorage, 'local:', completedFromLocal, 'onboardingCompletedVar:', onboardingCompleted);
            if (completedFromStorage || completedFromLocal) {
                document.documentElement.classList.remove('show-onboarding');
                document.documentElement.classList.add('onboarded');
                const preOverlay = document.getElementById('onboardingOverlay');
                if (preOverlay) {
                    try { preOverlay.remove(); } catch (e) { preOverlay.style.display = 'none'; }
                }
            }
        } catch (e) {
            // Non-fatal: storage may not be ready yet
            try { console.debug('[debug] visibilitychange fallback localStorage =>', localStorage.getItem('onboardingCompleted')); } catch (err) { }
        }
    }
});

// Initial App Entry - Fired as soon as HTML structure is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
