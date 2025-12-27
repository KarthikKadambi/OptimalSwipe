import { get, set, del, update, keys } from 'idb-keyval';

// Enhanced Storage Helper with IndexedDB and Filesystem-like Export/Import
export const storage = {
    // Check if File System Access API is supported (Desktop-only usually)
    supportsFileSystemApi() {
        return !!window.showOpenFilePicker;
    },

    async get(key) {
        try {
            // First check if we've migrated this key from localStorage
            const migratedKey = `migrated_${key}`;
            const isMigrated = localStorage.getItem(migratedKey);

            if (!isMigrated) {
                const legacyValue = localStorage.getItem(key);
                if (legacyValue !== null) {
                    console.log(`Migrating ${key} from localStorage to IndexedDB...`);
                    const parsedValue = JSON.parse(legacyValue);
                    await set(key, parsedValue);
                    localStorage.setItem(migratedKey, 'true');
                    return parsedValue;
                }
            }

            return await get(key);
        } catch (error) {
            console.error('IndexedDB get error:', error);
            // Fallback to localStorage if IDB fails for some reason
            const val = localStorage.getItem(key);
            return val ? JSON.parse(val) : null;
        }
    },

    async set(key, value) {
        try {
            await set(key, value);
            // Keep a flag in localStorage so we know not to re-migrate
            localStorage.setItem(`migrated_${key}`, 'true');
            return true;
        } catch (error) {
            console.error('IndexedDB set error:', error);
            // Fallback to localStorage
            localStorage.setItem(key, JSON.stringify(value));
            return false;
        }
    },

    async delete(key) {
        try {
            await del(key);
            localStorage.removeItem(`migrated_${key}`);
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('IndexedDB delete error:', error);
            return false;
        }
    },

    async clearAllData() {
        try {
            const allStorageKeys = await keys();
            for (const key of allStorageKeys) {
                await del(key);
            }
            // Also clear migration flags and legacy data
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Clear all data error:', error);
            return false;
        }
    },

    // Export all app data to a JSON file
    async exportData() {
        try {
            const allKeys = ['cards', 'payments', 'userPresets', 'biometricEnabled']; // Explicit keys for our app
            const data = {
                version: '2.0.0', // Updated version for IDB
                exportDate: new Date().toISOString()
            };

            for (const key of allKeys) {
                data[key] = await this.get(key) || [];
            }

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `optimalswipe_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed. Check console for details.');
        }
    },

    // Import data from a JSON file
    async importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.cards) await this.set('cards', data.cards);
                    if (data.payments) await this.set('payments', data.payments);
                    if (data.userPresets) await this.set('userPresets', data.userPresets);
                    if (data.onboardingCompleted !== undefined) {
                        await this.set('onboardingCompleted', data.onboardingCompleted);
                    }

                    // Mark as backed up on import
                    await this.updateBackupInfo(data.payments ? data.payments.length : 0);
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    // File System Access API: Link a specific file for syncing
    async linkBackupFile() {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON Backup File',
                    accept: { 'application/json': ['.json'] },
                }],
                multiple: false
            });
            await set('backup_file_handle', handle);
            return handle;
        } catch (error) {
            console.error('File linking failed:', error);
            return null;
        }
    },

    // Unlink the current backup file
    async unlinkBackupFile() {
        try {
            await del('backup_file_handle');
            await del('last_backup_info');
            return true;
        } catch (error) {
            console.error('Unlinking failed:', error);
            return false;
        }
    },

    // Sync current data to the linked file
    async syncToLinkedFile() {
        try {
            const handle = await get('backup_file_handle');
            if (!handle) return { success: false, error: 'No file linked' };

            // Check if we have permission
            if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                    return { success: false, error: 'Permission denied' };
                }
            }

            const allKeys = ['cards', 'payments', 'userPresets', 'onboardingCompleted', 'biometricEnabled'];
            const data = {
                version: '2.0.0',
                exportDate: new Date().toISOString()
            };

            for (const key of allKeys) {
                data[key] = await this.get(key) || [];
            }

            const writable = await handle.createWritable();
            await writable.write(JSON.stringify(data, null, 2));
            await writable.close();

            await this.updateBackupInfo(data.payments.length);
            return { success: true };
        } catch (error) {
            console.error('Sync failed:', error);
            return { success: false, error: error.message };
        }
    },

    async updateBackupInfo(paymentCount) {
        const info = {
            lastBackupTime: Date.now(),
            transactionCountAtBackup: paymentCount
        };
        await set('last_backup_info', info);
    },

    async updateWalletSyncTime() {
        await set('last_wallet_sync_time', Date.now());
    },

    async getBackupStatus() {
        const info = await get('last_backup_info') || { lastBackupTime: 0, transactionCountAtBackup: 0 };
        const walletSyncTime = await get('last_wallet_sync_time') || 0;
        const payments = await this.get('payments') || [];
        const handle = await get('backup_file_handle');

        return {
            lastBackupTime: info.lastBackupTime,
            lastWalletSyncTime: walletSyncTime,
            pendingTransactions: payments.length - info.transactionCountAtBackup,
            isLinked: !!handle,
            fileName: handle ? handle.name : null
        };
    },

    // Request persistent storage from the browser
    async requestPersistence() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Persistent storage granted: ${isPersisted}`);
            return isPersisted;
        }
        return false;
    },

    // Get current storage usage and persistence status
    async getStorageStatus() {
        const status = {
            persisted: false,
            quota: 0,
            usage: 0,
            percentage: 0
        };

        if (navigator.storage && navigator.storage.persisted) {
            status.persisted = await navigator.storage.persisted();
        }

        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            status.quota = estimate.quota;
            status.usage = estimate.usage;
            status.percentage = (estimate.usage / estimate.quota) * 100;
        }

        return status;
    }
};
