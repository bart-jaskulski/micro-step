import { Component, createSignal, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { QRDisplay, QRScanner } from "~/components/DevicePairing";
import { initializeVaultStore } from "~/stores/vaultStore";

type Tab = "display" | "scan";

export default function PairPage() {
  const [tab, setTab] = createSignal<Tab>("display");

  onMount(async () => {
    await initializeVaultStore();
  });

  return (
    <div class="pair-page">
      <header class="pair-header">
        <h1>Device Pairing</h1>
        <A href="/" class="back-link">← Back to Tasks</A>
      </header>

      <div class="pair-tabs">
        <button
          type="button"
          class={tab() === "display" ? "active" : ""}
          onClick={() => setTab("display")}
        >
          Show QR (Add Device)
        </button>
        <button
          type="button"
          class={tab() === "scan" ? "active" : ""}
          onClick={() => setTab("scan")}
        >
          Scan QR (Join Vault)
        </button>
      </div>

      <div class="pair-content">
        {tab() === "display" ? <QRDisplay /> : <QRScanner />}
      </div>

      <div class="pair-info">
        <h3>How to pair devices</h3>
        <ul>
          <li><strong>Add Device:</strong> Show this QR code on another device to pair it with your vault.</li>
          <li><strong>Join Vault:</strong> Scan a QR code from an existing device to join its vault.</li>
          <li>All data is encrypted end-to-end. Your vault key never leaves your device.</li>
          <li>QR codes are sensitive. Only show them to trusted devices.</li>
        </ul>
      </div>
    </div>
  );
}
