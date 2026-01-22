import { Component, createSignal } from "solid-js";
import { A } from "@solidjs/router";
import { vaultState } from "~/stores/vaultStore";
import { syncStateStore, syncNow } from "~/lib/sync";

export default function SettingsPage() {
  const [isSyncing, setIsSyncing] = createSignal(false);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await syncNow();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const getSyncStatus = () => {
    if (!vaultState.isPaired) return "offline";
    if (syncStateStore.status === "syncing" || isSyncing()) return "syncing";
    if (syncStateStore.lastSyncTimestamp) return "synced";
    return "idle";
  };

  const formatLastSync = () => {
    if (!syncStateStore.lastSyncTimestamp) return "Never";
    const date = new Date(syncStateStore.lastSyncTimestamp);
    return date.toLocaleString();
  };

  return (
    <div class="settings-page">
      <header class="settings-header">
        <h1>Settings</h1>
        <A href="/" class="back-link">← Back to Tasks</A>
      </header>

      <div class="settings-section">
        <h2>Sync & Devices</h2>
        
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">Device Pairing</div>
            <div class="setting-description">
              {vaultState.isPaired 
                ? "This device is paired with a vault. Add more devices to sync your tasks."
                : "Not paired. Pair this device to enable sync across your devices."
              }
            </div>
          </div>
          <A href="/pair" class="settings-button">
            {vaultState.isPaired ? "Manage Devices" : "Pair Device"}
          </A>
        </div>

        {vaultState.isPaired && (
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Device ID</div>
              <div class="setting-description">
                Your unique identifier for this device
              </div>
            </div>
            <code class="device-id">{vaultState.deviceId}</code>
          </div>
        )}

        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">Sync Status</div>
            <div class="setting-description">
              Last synced: {formatLastSync()}
            </div>
          </div>
          <span class={`sync-status-badge ${getSyncStatus()}`}>
            {getSyncStatus()}
          </span>
        </div>

        {vaultState.isPaired && (
          <div class="setting-item">
            <div class="setting-info">
              <div class="setting-label">Manual Sync</div>
              <div class="setting-description">
                Force sync with vault now
              </div>
            </div>
            <button 
              type="button" 
              class="settings-button sync-button"
              onClick={handleSyncNow}
              disabled={isSyncing()}
            >
              {isSyncing() ? "Syncing..." : "Sync Now"}
            </button>
          </div>
        )}
      </div>

      <div class="settings-section">
        <h2>About</h2>
        <div class="setting-item">
          <div class="setting-info">
            <div class="setting-label">Version</div>
            <div class="setting-description">0.1.0</div>
          </div>
        </div>
        <A href="/about" class="settings-link">About this app →</A>
      </div>
    </div>
  );
}
