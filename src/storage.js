import { get, set, del, update, keys } from 'idb-keyval';

// Enhanced Storage Helper with IndexedDB and Filesystem-like Export/Import
export const storage = {
    // Check if File System Access API is supported (Supported in Chrome/Edge/Opera desktop)
    supportsFileSystemApi() {
        return typeof window.showOpenFilePicker === 'function';
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
                    await set('last_pull_time', Date.now());
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



    // File System Access API: Link an EXISTING file for syncing
    async linkBackupFile() {
        if (this.supportsFileSystemApi()) {
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
        } else {
            // FALLBACK for Safari/Firefox: Use standard file input to "select" a file
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        try {
                            // Automatically import the data from the chosen file
                            await this.importData(file);

                            // Save the name for the manual sync UI
                            await set('backup_file_name_fallback', file.name);

                            // Resolve with a mock handle for UI consistency
                            resolve({ name: file.name, isFallback: true });
                        } catch (err) {
                            console.error('Initial link import failed:', err);
                            resolve(null);
                        }
                    } else {
                        resolve(null);
                    }
                };
                input.click();
            });
        }
    },

    // Unlink the current backup file
    async unlinkBackupFile() {
        try {
            await del('backup_file_handle');
            await del('backup_file_name_fallback');
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

            // Collect data to sync
            const allKeys = ['cards', 'payments', 'userPresets', 'onboardingCompleted', 'biometricEnabled'];
            const data = {
                version: '2.0.0',
                exportDate: new Date().toISOString()
            };
            for (const key of allKeys) {
                data[key] = await this.get(key) || [];
            }

            if (handle) {
                // NATIVE SYNC: Silent background write
                if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
                    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                        return { success: false, error: 'Permission denied' };
                    }
                }
                const writable = await handle.createWritable();
                await writable.write(JSON.stringify(data, null, 2));
                await writable.close();

                // Get updated file metadata after write to track sync time
                const updatedFile = await handle.getFile();
                await this.updateBackupInfo(data.payments.length, updatedFile.lastModified);
                return { success: true };
            } else {
                // FALLBACK SYNC: Trigger a download (Manual sync)
                const fallbackName = await get('backup_file_name_fallback');
                if (!fallbackName) return { success: false, error: 'No file linked' };

                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fallbackName; // Suggest the original filename
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                await this.updateBackupInfo(data.payments.length);
                return { success: true, isManual: true };
            }
        } catch (error) {
            console.error('Sync failed:', error);
            return { success: false, error: error.message };
        }
    },

    async updateBackupInfo(paymentCount, lastModified = Date.now()) {
        const info = {
            lastBackupTime: Date.now(),
            transactionCountAtBackup: paymentCount,
            fileLastModified: lastModified
        };
        await set('last_backup_info', info);
    },

    // Check if the linked file has been modified externally
    async checkForExternalChanges() {
        try {
            const handle = await get('backup_file_handle');
            if (!handle) return false;

            // We can only check if we have permission
            if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return false;

            const file = await handle.getFile();
            const info = await get('last_backup_info') || { fileLastModified: 0 };

            // If file on disk is newer than our last record, it's an external change
            return file.lastModified > (info.fileLastModified || 0) + 1000; // 1s buffer
        } catch (e) {
            console.warn('Could not check for external changes:', e);
            return false;
        }
    },

    // Pull data FROM the linked file into the app
    async pullFromLinkedFile() {
        try {
            const handle = await get('backup_file_handle');
            if (!handle) return { success: false, error: 'No handle' };

            const file = await handle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);

            // Import the data
            if (data.cards) await this.set('cards', data.cards);
            if (data.payments) await this.set('payments', data.payments);
            if (data.userPresets) await this.set('userPresets', data.userPresets);

            // Update our sync record with this file's stats
            await set('last_pull_time', Date.now());
            await this.updateBackupInfo(data.payments ? data.payments.length : 0, file.lastModified);

            return { success: true, data };
        } catch (e) {
            return { success: false, error: e.message };
        }
    },

    async updateWalletSyncTime() {
        await set('last_wallet_sync_time', Date.now());
    },

    async getBackupStatus() {
        const info = await get('last_backup_info') || { lastBackupTime: 0, transactionCountAtBackup: 0 };
        const walletSyncTime = await get('last_wallet_sync_time') || 0;
        const pullTime = await get('last_pull_time') || 0;
        const payments = await this.get('payments') || [];
        const handle = await get('backup_file_handle');
        const fallbackName = await get('backup_file_name_fallback');

        return {
            lastBackupTime: info.lastBackupTime,
            lastWalletSyncTime: walletSyncTime,
            lastPullTime: pullTime,
            pendingTransactions: payments.length - info.transactionCountAtBackup,
            isLinked: !!handle || !!fallbackName,
            isNative: !!handle,
            fileName: handle ? handle.name : (fallbackName || null)
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
