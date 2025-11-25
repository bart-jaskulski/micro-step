import { Title } from "@solidjs/meta";
import { clientOnly } from "@solidjs/start";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import {
  deviceList,
  getDeviceId,
  getPairingLink,
  rotateRoom,
  syncState,
  updateDeviceLabel,
} from "~/stores/taskStore";
import "./settings.css";

const formatTimestamp = (value: number) => {
  if (!Number.isFinite(value)) return "never";
  return new Date(value).toLocaleString();
};

function Settings() {
  const [copyState, setCopyState] = createSignal<"idle" | "copied">("idle");
  const [labelDraft, setLabelDraft] = createSignal("");

  createEffect(() => {
    setLabelDraft(syncState.deviceLabel);
  });

  const shareLink = createMemo(() => getPairingLink());

  const copyLink = async () => {
    const value = shareLink();
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1400);
  };

  const saveLabel = () => updateDeviceLabel(labelDraft());

  const handleRotate = () => {
    if (typeof window === "undefined") return;
    const agreed = window.confirm("Rotate link and re-pair devices?");
    if (agreed) rotateRoom();
  };

  return (
    <main class="settings-shell">
      <Title>Sync settings</Title>
      <div class="settings-header">
        <h1>Sync & Pairing</h1>
        <p>Encrypted blind relay between desktop and mobile. Keep the link safe.</p>
      </div>

      <div class="settings-grid">
        <section class="panel">
          <header>
            <span>Share link</span>
            <span class="pill" data-ok={syncState.isOnline}>
              {syncState.isOnline ? "Relay live" : "Offline"}
            </span>
          </header>

          <div class="stack">
            <div class="link-box">
              <input
                type="text"
                readOnly
                value={shareLink()}
                aria-label="Pairing link"
              />
              <button type="button" onClick={copyLink}>
                {copyState() === "copied" ? "Copied" : "Copy"}
              </button>
            </div>
            <div class="actions-row">
              <span class="pill" data-ok={syncState.isSynced}>
                {syncState.isSynced ? "Local cache ready" : "Syncing local data"}
              </span>
              <button type="button" onClick={handleRotate}>
                Rotate link
              </button>
            </div>
            <p class="hint">
              Anyone with the link can read and write. To revoke, rotate and re-pair trusted devices.
            </p>
          </div>
        </section>

        <section class="panel">
          <header>
            <span>Devices</span>
            <span class="pill" data-ok="true">Pairing only</span>
          </header>

          <div class="stack">
            <div class="field">
              <label for="device-label">This device label</label>
              <input
                id="device-label"
                name="device-label"
                value={labelDraft()}
                onInput={event => setLabelDraft(event.currentTarget.value)}
              />
              <div class="actions-row">
                <button type="button" onClick={saveLabel}>Save label</button>
              </div>
            </div>

            <div class="device-list">
              <Show when={deviceList().length} fallback={<p class="hint">Waiting for devices to announce…</p>}>
                <For each={deviceList()}>
                  {(device) => (
                    <div class="device-card" data-self={device.id === getDeviceId()}>
                      <header>
                        <span>{device.label || "Unnamed device"}</span>
                        <small>{device.id === getDeviceId() ? "This device" : "Peer"}</small>
                      </header>
                      <small>Last seen {formatTimestamp(device.lastSeen)}</small>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            <p class="hint">
              Revocation is by rotation: banned devices lose access once you share the new link with trusted ones.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default clientOnly(async () => ({ default: Settings }), { lazy: true });
