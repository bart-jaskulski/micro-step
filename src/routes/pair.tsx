import { A } from "@solidjs/router";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { Show, createMemo, createSignal, onMount } from "solid-js";
import { QRDisplay } from "~/components/DevicePairing";
import {
  buildPairingHash,
  buildPairingUrl,
  clearPairingHash,
  parseVaultKeyFromHash,
} from "~/lib/pairing";
import { initializeSync } from "~/lib/sync";
import {
  createVault,
  initializeVaultStore,
  joinVault,
  vaultState,
} from "~/stores/vaultStore";

type BusyAction = "create" | "join" | "copy" | null;

export default function PairPage() {
  const [busyAction, setBusyAction] = createSignal<BusyAction>(null);
  const [currentOrigin, setCurrentOrigin] = createSignal("");
  const [detectedHash, setDetectedHash] = createSignal<string | null>(null);
  const [pendingVaultKey, setPendingVaultKey] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [copyMessage, setCopyMessage] = createSignal<string | null>(null);

  onMount(async () => {
    await initializeVaultStore();
    setCurrentOrigin(window.location.origin);
    setDetectedHash(window.location.hash || null);
    setPendingVaultKey(parseVaultKeyFromHash(window.location.hash));
  });

  const joinUrl = createMemo(() => {
    if (!vaultState.vaultKey || !currentOrigin()) {
      return null;
    }

    return buildPairingUrl(currentOrigin(), vaultState.vaultKey);
  });

  const joinHash = createMemo(() => {
    if (!vaultState.vaultKey) {
      return null;
    }

    return buildPairingHash(vaultState.vaultKey);
  });

  const isSameVault = createMemo(() => {
    return Boolean(
      pendingVaultKey() &&
      vaultState.vaultKey &&
      pendingVaultKey() === vaultState.vaultKey
    );
  });

  const canReplaceCurrentVault = createMemo(() => {
    return Boolean(pendingVaultKey() && vaultState.isPaired && !isSameVault());
  });

  const handleCreateVault = async () => {
    setBusyAction("create");
    setErrorMessage(null);

    try {
      await createVault();
      await initializeSync();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoinVault = async () => {
    const vaultKey = pendingVaultKey();

    if (!vaultKey) {
      return;
    }

    if (canReplaceCurrentVault()) {
      const shouldReplace = window.confirm(
        "This device is already paired with a different vault. Replace the current vault on this device?"
      );

      if (!shouldReplace) {
        return;
      }
    }

    setBusyAction("join");
    setErrorMessage(null);

    try {
      await joinVault(vaultKey);
      clearPairingHash();
      setDetectedHash(null);
      setPendingVaultKey(null);
      await initializeSync();
      window.location.href = "/";
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to join vault");
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyLink = async () => {
    if (!joinUrl()) {
      return;
    }

    setBusyAction("copy");
    setCopyMessage(null);

    try {
      await navigator.clipboard.writeText(joinUrl()!);
      setCopyMessage("Link copied.");
    } catch {
      setCopyMessage("Copy failed. You can copy it manually from the field below.");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div class="min-h-screen bg-[#F9F9F8] p-4 text-stone-700">
      <header class="mb-8 flex items-center gap-4 pt-4">
        <A href="/" class="rounded-full p-2 text-stone-500 transition hover:bg-stone-200">
          <ArrowLeft class="h-5 w-5" />
        </A>
        <h1 class="text-2xl font-light tracking-tight text-stone-800">Device Pairing</h1>
      </header>

      <div class="mx-auto flex max-w-md flex-col gap-6">
        <Show when={pendingVaultKey()}>
          <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div class="space-y-3">
              <h2 class="text-lg font-medium text-stone-900">Vault link detected</h2>
              <Show when={isSameVault()}>
                <p class="text-sm text-stone-600">
                  This device is already paired with the vault from this link.
                </p>
              </Show>
              <Show when={!isSameVault() && !canReplaceCurrentVault()}>
                <p class="text-sm text-stone-600">
                  This link contains a vault secret in the URL hash. Join from this browser without using the camera.
                </p>
              </Show>
              <Show when={canReplaceCurrentVault()}>
                <p class="text-sm text-amber-700">
                  This device is already paired with another vault. Replacing it requires confirmation.
                </p>
              </Show>
              <p class="break-all rounded-xl bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600">
                {detectedHash() || buildPairingHash(pendingVaultKey()!)}
              </p>
              <div class="flex gap-3">
                <Show when={!isSameVault()}>
                  <button
                    type="button"
                    onClick={handleJoinVault}
                    disabled={busyAction() === "join"}
                    class="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    {busyAction() === "join"
                      ? "Joining..."
                      : canReplaceCurrentVault()
                        ? "Replace current vault"
                        : "Join this vault"}
                  </button>
                </Show>
                <button
                  type="button"
                  onClick={() => {
                    clearPairingHash();
                    setDetectedHash(null);
                    setPendingVaultKey(null);
                  }}
                  class="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Dismiss link
                </button>
              </div>
            </div>
          </section>
        </Show>

        <Show when={!vaultState.isPaired}>
          <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div class="space-y-4">
              <div class="space-y-2">
                <h2 class="text-lg font-medium text-stone-900">Create your first vault</h2>
                <p class="text-sm text-stone-600">
                  Start pairing on this device, then share the QR code or link with another device.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateVault}
                disabled={busyAction() === "create"}
                class="w-full rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {busyAction() === "create" ? "Creating vault..." : "Create vault"}
              </button>
            </div>
          </section>
        </Show>

        <Show when={vaultState.isPaired && joinUrl()}>
          <section class="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div class="space-y-5">
              <div class="space-y-2 text-center">
                <h2 class="text-lg font-medium text-stone-900">Share this vault</h2>
                <p class="text-sm text-stone-600">
                  Open this link on another device or scan the QR code. The vault secret stays in the URL hash.
                </p>
              </div>

              <QRDisplay joinUrl={joinUrl()!} />

              <div class="space-y-3">
                <label class="block text-xs font-medium uppercase tracking-wide text-stone-500">
                  Full join link
                </label>
                <input
                  readOnly
                  value={joinUrl()!}
                  class="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-700"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  disabled={busyAction() === "copy"}
                  class="w-full rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  {busyAction() === "copy" ? "Copying..." : "Copy full link"}
                </button>
                <Show when={copyMessage()}>
                  <p class="text-sm text-stone-500">{copyMessage()}</p>
                </Show>
              </div>

              <div class="space-y-2">
                <h3 class="text-xs font-medium uppercase tracking-wide text-stone-500">
                  Hash secret format
                </h3>
                <p class="break-all rounded-xl bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600">
                  {joinHash()}
                </p>
              </div>
            </div>
          </section>
        </Show>

        <Show when={errorMessage()}>
          <p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage()}
          </p>
        </Show>

        <section class="rounded-2xl bg-blue-50/50 p-6 text-sm text-stone-600">
          <div class="space-y-3">
            <h3 class="font-semibold text-stone-800">How pairing works now</h3>
            <p>
              Create a vault on the first device, then open the join link on the next device. Camera access is no longer required for the default flow.
            </p>
            <p>
              The vault secret lives in <span class="font-mono text-xs">#vault=...</span>, so it stays client-side during normal routing.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
