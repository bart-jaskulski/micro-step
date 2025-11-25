import * as Y from "yjs";
import { encryptData, decryptData } from "~/lib/crypto"; // Assumes the crypto helpers from previous step

export class EncryptedWsProvider {
  private ws: WebSocket | null = null;
  private doc: Y.Doc;
  private roomId: string;
  private key: CryptoKey;
  private url: string;

  // Status flags for UI
  public connected = false;
  public synced = false;

  constructor(
    serverUrl: string, 
    roomId: string, 
    key: CryptoKey, 
    doc: Y.Doc
  ) {
    this.roomId = roomId;
    this.key = key;
    this.doc = doc;

    // Construct absolute WebSocket URL
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.url = `${protocol}//${host}${serverUrl}?room=${roomId}`;

    this.connect();

    // Listen to local changes (User types something)
    this.doc.on("update", this.handleLocalUpdate);
  }

  private connect() {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      console.log("[WS] Connected to Blind Relay");
      this.connected = true;
      // In a more complex app, you might want to track sync state 
      // by waiting for a specific "end of history" message from server
      this.synced = true; 
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected. Reconnecting in 3s...");
      this.connected = false;
      this.synced = false;
      setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };

    this.ws.onmessage = this.handleIncomingMessage;
  }

  /**
   * Handle messages coming FROM the Server (Blind Relay)
   */
  private handleIncomingMessage = async (event: MessageEvent) => {
    if (!event.data) return;

    try {
      // 1. The server sends raw encrypted bytes
      const encryptedBuffer = new Uint8Array(event.data);

      // 2. Decrypt using the Client-Side Key
      const update = await decryptData(this.key, encryptedBuffer);

      // 3. Apply to Y.js
      // The third argument 'this' is the "origin". 
      // We check this in handleLocalUpdate to prevent infinite loops.
      Y.applyUpdate(this.doc, update, this);

    } catch (err) {
      console.error("[WS] Failed to decrypt incoming message:", err);
      // This usually happens if the Room ID matches but the Key is wrong.
    }
  };

  /**
   * Handle changes made LOCALLY (User typing, Drag & Drop)
   */
  private handleLocalUpdate = async (update: Uint8Array, origin: any) => {
    // STOP! If this update came from the WebSocket (origin === this), 
    // do NOT send it back to the WebSocket.
    if (origin === this) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 1. Encrypt the update
      const encrypted = await encryptData(this.key, update);

      // 2. Send to Blind Relay
      this.ws.send(encrypted);
    }
  };

  /**
   * Cleanup
   */
  public destroy() {
    this.doc.off("update", this.handleLocalUpdate);
    this.ws?.close();
  }
}
