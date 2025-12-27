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

// Initialize app
async function init() {
    await loadData();

    if (!onboardingCompleted) {
        showOnboarding();
    } else {
        const biometricEnabled = await storage.get('biometricEnabled');
        if (biometricEnabled) {
            showLockoutScreen();
        } else {
            startApp();
        }
    }
}

async function startApp() {
    renderCards();
    renderPresetsLibrary();
    renderPayments();
    updatePaymentCardOptions();
    updateStats();

    // Request persistent storage for transaction safety
    await storage.requestPersistence();
    updateStorageHealthUI();
    updateBackupStatusUI();

    // Register PWA Service Worker with update detection
    registerServiceWorker();

    // Check for Deep Link Imports (e.g., from iOS Shortcuts)
    checkDeepLinkImport();

    // Add initial reward tier
    addRewardTier();

    // Set up event listeners
    document.getElementById('addRewardBtn').addEventListener('click', addRewardTier);
    document.getElementById('cardForm').addEventListener('submit', handleCardSubmit);
    document.getElementById('paymentForm').addEventListener('submit', handlePaymentSubmit);
    document.getElementById('recommendationForm').addEventListener('submit', handleRecommendationSubmit);
    document.getElementById('exportBtn')?.addEventListener('click', () => storage.exportData());
    document.getElementById('importFile')?.addEventListener('change', handleImport);
    document.getElementById('vaultExportBtn')?.addEventListener('click', () => storage.exportData());
    document.getElementById('vaultImportFile')?.addEventListener('change', handleImport);
    document.getElementById('addPresetRewardBtn').addEventListener('click', () => addPresetRewardTier());
    document.getElementById('presetForm').addEventListener('submit', handlePresetSubmit);

    // Backup & Sync listeners
    document.addEventListener('click', async (e) => {
        if (e.target.id === 'linkBackupBtn') {
            const handle = await storage.linkBackupFile();
            if (handle) updateBackupStatusUI();
        }
        if (e.target.id === 'syncBackupBtn') {
            const result = await storage.syncToLinkedFile();
            if (result.success) {
                updateBackupStatusUI();
            } else {
                alert('Sync failed: ' + result.error);
            }
        }
        if (e.target.id === 'unlinkVaultBtn') {
            if (confirm('Unlink this backup file? You will no longer have automatic live sync.')) {
                await storage.unlinkBackupFile();
                updateBackupStatusUI();
            }
        }
        if (e.target.id === 'syncWalletBtn') {
            // Trigger iOS Shortcut via URL scheme
            window.location.href = 'shortcuts://run-shortcut?name=SyncOptimalSwipe';
        }

        // Tab Switching Logic
        if (e.target.classList.contains('tab-btn')) {
            const targetTab = e.target.getAttribute('data-tab');
            switchTab(targetTab);
        }
        if (e.target.id === 'resetAppBtn') {
            if (confirm('CRITICAL: This will PERMANENTLY DELETE all local cards, payments, and settings. Your linked backup file will NOT be touched. Are you sure you want to proceed?')) {
                await storage.clearAllData();
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
    });
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
                <label class="inline-label">Payment Method</label>
                <select class="tier-method">
                    <option value="any">Any method</option>
                    <option value="apple-pay">Apple Pay required</option>
                    <option value="google-pay">Google Pay required</option>
                    <option value="physical-card">Physical card only</option>
                    <option value="tap">Tap/contactless only</option>
                    <option value="online">Online only</option>
                </select>
            </div>
            <div>
                <label class="inline-label">Specific Merchants (Optional)</label>
                <input type="text" placeholder="e.g., Apple, Nike, Uber" class="tier-merchants">
            </div>
        </div>
        <div class="condition-method-grid" style="margin-top: 12px;">
            <div>
                <label class="inline-label">Spending Cap</label>
                <input type="number" step="0.01" placeholder="e.g., 2500" class="tier-cap">
            </div>
            <div>
                <label class="inline-label">Cap Period</label>
                <select class="tier-cap-period">
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

    // Wallet Sync Nudge logic: more than 4 hours since last sync
    const isWalletSyncNeeded = (Date.now() - status.lastWalletSyncTime) > 4 * 60 * 60 * 1000;

    // iOS Specific UI
    if (container) {
        container.innerHTML = `
            <div class="backup-status">
                <div class="backup-info">
                    <div class="backup-time">Last Wallet Sync: ${status.lastWalletSyncTime ? getTimeAgo(status.lastWalletSyncTime) : 'Never'}</div>
                    ${isWalletSyncNeeded ? `<div id="syncWalletBtn" class="backup-nudge" style="cursor: pointer; color: var(--accent-sapphire); text-decoration: underline;">🔄 Sync Wallet via Shortcut</div>` : '<div class="sync-badge">✓ Sync Up-to-Date</div>'}
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
            vaultHtml += `
                <button id="syncBackupBtn" class="btn" style="width: 100%;">Sync to Local File (${status.pendingTransactions} pending)</button>
                <div style="margin-top: 8px; text-align: center;">
                    <button id="unlinkVaultBtn" class="btn-danger" style="font-size: 0.8rem; padding: 6px 16px;">Unlink Vault</button>
                </div>
            `;
        } else if (storage.supportsFileSystemApi()) {
            vaultHtml += `
                <button id="linkBackupBtn" class="btn-secondary" style="width: 100%;">Link Local Backup File</button>
            `;
        } else {
            vaultHtml += `
                <div style="font-size: 0.8rem; padding: 12px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border); border-radius: 8px; color: var(--text-secondary); text-align: center;">
                    Automatic file linking is not available on mobile browsers. Use <strong>One-Time Restore</strong> for migrations.
                </div>
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
        alert(`Successfully imported ${batch.length} transactions!`);
    };
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

function showOnboarding() {
    const overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.id = 'onboardingOverlay';

    let currentStep = 1;
    let hasExported = false;
    let hasLinked = false;
    const selectedPresets = new Set();
    const allPresets = [...cardPresets, ...userPresets];

    const presetsHtml = allPresets.map(preset => `
        <div class="preset-item" data-id="${preset.id}">
            <div class="preset-card-mini" style="background: ${preset.color}; border: 1px solid ${preset.color === '#f5f5f7' ? '#d1d1d6' : 'transparent'};"></div>
            <div class="preset-name">${preset.name}</div>
            <div class="preset-issuer">${preset.issuer}</div>
        </div>
    `).join('');

    overlay.innerHTML = `
        <div class="onboarding-content">
            <div class="onboarding-header">
                <h1>Welcome to OptimalSwipe</h1>
                <div class="onboarding-stepper">
                    <div class="step-indicator active" data-step="1">
                        <div class="dot">1</div>
                        <span>Setup Wallet</span>
                    </div>
                    <div class="step-indicator" data-step="2">
                        <div class="dot">2</div>
                        <span>Establish Vault</span>
                    </div>
                    <div class="step-indicator" data-step="3">
                        <div class="dot">3</div>
                        <span>Sync</span>
                    </div>
                    <div class="step-indicator" data-step="4">
                        <div class="dot">4</div>
                        <span>Secure</span>
                    </div>
                </div>
            </div>
            
            <!-- Step 1: Card Selection -->
            <div class="step-view active" data-step="1">
                <p class="tagline" style="text-align: center; margin-bottom: 30px;">SELECT YOUR CARDS TO GET STARTED</p>
                <div class="preset-grid">
                    ${presetsHtml}
                </div>
            </div>

            <!-- Step 2: Establish Vault -->
            <div class="step-view" data-step="2">
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

            <!-- Step 3: Live Sync -->
            <div class="step-view" data-step="3">
                <div class="onboarding-action-card">
                    <span class="icon-large">🔄</span>
                    <h2>Enable Universal Live Sync</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">
                        Establish a live link to your backup file. Once linked, every change you make will be automatically saved directly to your local file!
                    </p>
                    ${storage.supportsFileSystemApi() ? `
                    <button id="onboardingLinkBtn" class="btn" style="width: 100%;">
                        Link My Backup File
                    </button>
                    ` : `
                    <div class="info-box" style="margin-bottom: 24px;">
                        <span class="icon">📱</span>
                        <p style="font-size: 0.9rem;">Automatic file linking is not supported on mobile browsers. Use the <strong>Manual iOS Shortcut</strong> for syncing on iPhone.</p>
                    </div>
                    <button class="btn-secondary" style="width: 100%;" onclick="this.closest('.onboarding-content').querySelector('#nextStep').click()">Skip for Mobile</button>
                    `}
                    <ul class="instruction-list">
                        <li>Select the file you just downloaded</li>
                        <li>Grant "Write Access" if your browser asks to save changes</li>
                        <li>Save to a cloud folder (like iCloud) for multi-device sync</li>
                    </ul>
                </div>
            </div>

            <!-- Step 4: Security Setup -->
            <div class="step-view" data-step="4">
                <div class="onboarding-action-card">
                    <span class="icon-large">🔐</span>
                    <h2>Secure Your Wallet</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">
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

            <div class="onboarding-footer">
                <button id="prevStep" class="btn-secondary" style="visibility: hidden;">Back</button>
                <div style="flex: 1;"></div>
                <button id="nextStep" class="btn" style="min-width: 200px;">Continue</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const updateWizardUI = () => {
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

        prevBtn.style.visibility = currentStep === 1 ? 'hidden' : 'visible';

        if (currentStep === 1) {
            nextBtn.innerText = 'Go to Vault Setup';
            nextBtn.disabled = false;
        } else if (currentStep === 2) {
            nextBtn.innerText = 'Go to Sync Setup';
            nextBtn.disabled = !hasExported;
        } else if (currentStep === 3) {
            nextBtn.innerText = 'Go to Security';
            nextBtn.disabled = storage.supportsFileSystemApi() ? !hasLinked : false;
        } else if (currentStep === 4) {
            nextBtn.innerText = 'Complete Setup';
            nextBtn.disabled = false;
        }
    };

    // Card selection event
    overlay.querySelector('.preset-grid').addEventListener('click', (e) => {
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
                hasLinked = true;
                linkBtn.innerText = '✓ Vault Linked';
                linkBtn.classList.add('btn-secondary');
                updateWizardUI();
                alert('Vault linked successfully! Live sync is now active.');
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

    document.getElementById('prevStep').onclick = () => {
        if (currentStep > 1) {
            currentStep--;
            updateWizardUI();
        }
    };

    document.getElementById('nextStep').onclick = async () => {
        if (currentStep === 1) {
            if (selectedPresets.size === 0) {
                if (!confirm("You haven't selected any cards. Are you sure you want to add manually later?")) return;
            }
            currentStep++;
            updateWizardUI();
        } else if (currentStep === 2) {
            currentStep++;
            updateWizardUI();
        } else if (currentStep === 3) {
            currentStep++;
            updateWizardUI();
        } else if (currentStep === 4) {
            onboardingCompleted = true;
            await storage.set('onboardingCompleted', true);
            overlay.remove();
            startApp();
        }
    };

    updateWizardUI();
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

init();
