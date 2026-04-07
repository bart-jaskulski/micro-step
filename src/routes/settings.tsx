import { createSignal, For } from "solid-js";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { vaultState } from "~/stores/vaultStore";
import { syncStateStore, syncNow } from "~/lib/sync";
import { isOnline } from "~/stores/networkStore";
import {
  breakdownGranularity,
  BREAKDOWN_GRANULARITY_OPTIONS,
  setBreakdownGranularity,
} from "~/stores/preferencesStore";

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
    <div class="min-h-screen bg-[#F9F9F8] text-stone-700 p-4">
      <header class="flex items-center gap-4 mb-8 pt-4">
        <A href="/" class="p-2 rounded-full hover:bg-stone-200 transition text-stone-500">
          <ArrowLeft class="w-5 h-5" />
        </A>
        <h1 class="text-2xl font-light tracking-tight text-stone-800">Settings</h1>
      </header>

      <div class="max-w-md mx-auto space-y-8">
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 space-y-6">
          <h2 class="text-lg font-medium text-stone-800">Sync & Devices</h2>
          
          <div class="flex justify-between items-center">
            <div>
              <span class="text-stone-700 font-medium block">Device Pairing</span>
              <span class="text-stone-400 text-xs">
                {vaultState.isPaired 
                  ? "Paired. Add more devices to sync."
                  : "Not paired. Pair to enable sync."
                }
              </span>
            </div>
            <A href="/pair" class="px-4 py-2 bg-stone-100 rounded-lg text-sm text-stone-600 hover:bg-stone-200 font-medium transition-colors">
              {vaultState.isPaired ? "Manage" : "Pair"}
            </A>
          </div>

          {vaultState.isPaired && (
            <div class="flex justify-between items-center">
              <div>
                <span class="text-stone-700 font-medium block">Device ID</span>
                <span class="text-stone-400 text-xs">Your unique identifier</span>
              </div>
              <code class="text-xs bg-stone-100 px-2 py-1 rounded text-stone-600 max-w-[120px] truncate">{vaultState.deviceId}</code>
            </div>
          )}

          <hr class="border-stone-100" />

          <div class="flex justify-between items-center">
            <div>
              <span class="text-stone-700 font-medium block">Sync Status</span>
              <span class="text-stone-400 text-xs">Last: {formatLastSync()}</span>
            </div>
            <span class={`px-3 py-1 rounded-full text-xs font-medium ${
              getSyncStatus() === "synced" ? "bg-green-100 text-green-700" :
              getSyncStatus() === "syncing" ? "bg-blue-100 text-blue-700" :
              "bg-stone-100 text-stone-500"
            }`}>
              {getSyncStatus()}
            </span>
          </div>

          {vaultState.isPaired && (
            <>
              <hr class="border-stone-100" />
              <div class="flex justify-between items-center">
                <div>
                  <span class="text-stone-700 font-medium block">Manual Sync</span>
                  <span class="text-stone-400 text-xs">Force sync now</span>
                </div>
                <button 
                  type="button" 
                  class="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleSyncNow}
                  disabled={isSyncing() || !isOnline()}
                >
                  {isSyncing() ? "Syncing..." : "Sync Now"}
                </button>
              </div>
            </>
          )}
        </div>

        <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 space-y-4">
          <h2 class="text-lg font-medium text-stone-800">Task Breakdown</h2>
          <div class="space-y-3">
            <div>
              <span class="text-stone-700 font-medium block">Default detail level</span>
              <span class="text-stone-400 text-xs">Used when AI breakdown is turned on in the composer</span>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <For each={BREAKDOWN_GRANULARITY_OPTIONS}>
                {(level) => (
                <button
                  type="button"
                  onClick={() => setBreakdownGranularity(level)}
                  class={`rounded-xl border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                    breakdownGranularity() === level
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-200 bg-stone-50 text-stone-500 hover:border-stone-300 hover:text-stone-700"
                  }`}
                >
                  {level}
                </button>
                )}
              </For>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 space-y-4">
          <h2 class="text-lg font-medium text-stone-800">About</h2>
          <div class="flex justify-between items-center">
            <span class="text-stone-700 font-medium">Version</span>
            <span class="text-stone-400 text-sm">0.1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
