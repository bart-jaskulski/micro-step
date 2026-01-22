import { Component, createSignal, onMount } from "solid-js";
import QRCode from "qrcode";
import { vaultState } from "~/stores/vaultStore";

export const QRDisplay: Component = () => {
  const [qrDataUrl, setQrDataUrl] = createSignal<string>("");
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      if (!vaultState.vaultKey) {
        setError("No vault key available");
        return;
      }

      const qrString = JSON.stringify({
        key: vaultState.vaultKey,
        deviceId: vaultState.deviceId,
      });

      const dataUrl = await QRCode.toDataURL(qrString, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });

      setQrDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate QR code");
    }
  });

  return (
    <div class="qr-display">
      {error() && <div class="error">{error()}</div>}
      {!error() && qrDataUrl() && (
        <img src={qrDataUrl()} alt="Vault QR Code" class="qr-image" />
      )}
    </div>
  );
};
