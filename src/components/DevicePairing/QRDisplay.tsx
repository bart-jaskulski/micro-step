import { Component, Show, createEffect, createSignal } from "solid-js";
import QRCode from "qrcode";

type QRDisplayProps = {
  joinUrl: string;
};

export const QRDisplay: Component<QRDisplayProps> = (props) => {
  const [qrDataUrl, setQrDataUrl] = createSignal<string>("");
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    setQrDataUrl("");
    setError(null);

    void QRCode.toDataURL(props.joinUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: "#292524",
        light: "#ffffff",
      },
    })
      .then(setQrDataUrl)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to generate QR code");
      });
  });

  return (
    <div class="flex w-full flex-col items-center gap-4">
      <Show when={error()}>
        <p class="text-sm text-red-600">{error()}</p>
      </Show>
      <Show when={!error() && qrDataUrl()}>
        <img
          src={qrDataUrl()}
          alt="Vault pairing QR code"
          class="w-full max-w-[300px] rounded-2xl border border-stone-200"
        />
      </Show>
      <p class="text-center text-xs text-stone-500">
        This QR contains the full join link for this vault.
      </p>
    </div>
  );
};
