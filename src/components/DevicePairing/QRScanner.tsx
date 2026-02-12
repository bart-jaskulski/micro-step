import { Component, createSignal, onCleanup, onMount } from "solid-js";
import { Html5Qrcode } from "html5-qrcode";
import { joinVault } from "~/stores/vaultStore";

export const QRScanner: Component = () => {
  const [error, setError] = createSignal<string | null>(null);
  const [scanning, setScanning] = createSignal(false);
  let scannerInstance: Html5Qrcode | null = null;

  const startScanning = () => {
    setError(null);
    setScanning(true);

    scannerInstance = new Html5Qrcode("qr-reader");

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0,
    };

    scannerInstance.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          
          if (!data.key || !data.deviceId) {
            throw new Error("Invalid QR code format");
          }

          await stopScanning();
          await joinVault(data.key);
          
          alert("Device paired successfully!");
          window.location.href = "/";
        } catch (err) {
          setError(err instanceof Error ? err.message : "Invalid QR code");
        }
      },
      (errorMessage) => {
        // Ignore scan errors (expected while scanning)
      }
    ).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to start camera");
      setScanning(false);
    });
  };

  const stopScanning = async () => {
    if (scannerInstance && scannerInstance.isScanning) {
      await scannerInstance.stop();
      setScanning(false);
    }
  };

  onMount(() => {
    startScanning();
  });

  onCleanup(() => {
    stopScanning();
  });

  return (
    <div class="qr-scanner">
      <div class="scanner-container">
        <div id="qr-reader" />
      </div>
      {error() && <div class="error">{error()}</div>}
      {scanning() && (
        <div class="scanning-status">
          Scanning...
          <button type="button" onClick={stopScanning}>
            Cancel
          </button>
        </div>
      )}
      {!scanning() && (
        <button type="button" onClick={startScanning}>
          Start Scanning
        </button>
      )}
    </div>
  );
};
