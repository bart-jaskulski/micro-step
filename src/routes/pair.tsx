import { createSignal, onMount } from "solid-js";
import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { QRDisplay, QRScanner } from "~/components/DevicePairing";
import { initializeVaultStore } from "~/stores/vaultStore";

type Tab = "display" | "scan";

export default function PairPage() {
  const [tab, setTab] = createSignal<Tab>("display");

  onMount(async () => {
    await initializeVaultStore();
  });

  return (
    <div class="min-h-screen bg-[#F9F9F8] text-stone-700 p-4">
      <header class="flex items-center gap-4 mb-8 pt-4">
        <A href="/" class="p-2 rounded-full hover:bg-stone-200 transition text-stone-500">
          <ArrowLeft class="w-5 h-5" />
        </A>
        <h1 class="text-2xl font-light tracking-tight text-stone-800">Device Pairing</h1>
      </header>

      <div class="max-w-md mx-auto space-y-8">
        {/* TABS */}
        <div class="flex p-1 bg-stone-200/50 rounded-xl">
          <button
            type="button"
            class={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab() === "display" 
                ? "bg-white text-stone-800 shadow-sm" 
                : "text-stone-500 hover:text-stone-700"
            }`}
            onClick={() => setTab("display")}
          >
            Add Device
          </button>
          <button
            type="button"
            class={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab() === "scan" 
                ? "bg-white text-stone-800 shadow-sm" 
                : "text-stone-500 hover:text-stone-700"
            }`}
            onClick={() => setTab("scan")}
          >
            Join Vault
          </button>
        </div>

        {/* CONTENT */}
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-stone-200/60 flex flex-col items-center justify-center min-h-[300px]">
          {tab() === "display" ? <QRDisplay /> : <QRScanner />}
        </div>

        {/* INFO */}
        <div class="bg-blue-50/50 rounded-2xl p-6 text-sm text-stone-600 space-y-4">
          <h3 class="font-semibold text-stone-800">How to pair devices</h3>
          <ul class="space-y-2 list-disc pl-4">
            <li><strong>Add Device:</strong> Show this QR code on another device to pair it with your vault.</li>
            <li><strong>Join Vault:</strong> Scan a QR code from an existing device to join its vault.</li>
            <li>All data is encrypted end-to-end. Your vault key never leaves your device.</li>
            <li>QR codes are sensitive. Only show them to trusted devices.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
