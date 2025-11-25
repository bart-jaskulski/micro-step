import { appendFile } from "node:fs/promises";
import { eventHandler } from "vinxi/http";
import { Level } from "level";
import { getQuery } from "ufo";

// Persistent storage for encrypted blobs
const db = new Level(process.env.DB_PATH || "./storage/leveldb", { valueEncoding: "binary" });

const logError = async (scope: string, err: unknown) => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const stack = err instanceof Error && err.stack ? err.stack : "";
  try {
    await appendFile("./storage/ws-errors.log", `[${new Date().toISOString()}] ${scope} :: ${message}\n${stack}\n`);
  } catch (fileErr) {
    console.error("[WS] Failed to write debug log", fileErr);
  }
};

export const GET = eventHandler({
  handler() {},
  websocket: {
    open(peer) {
      const query = getQuery(peer.url);
      const roomId = query.room as string;

      if (!roomId) {
        peer.close();
        return;
      }

      peer.ctx.roomId = roomId;
      peer.subscribe(roomId);
      console.log(`[WS] Joined Room: ${roomId}`);

      const stream = db.iterator({
        gte: `${roomId}::`,
        lt: `${roomId}::\xff`,
      });

      (async () => {
        for await (const [_, value] of stream) {
          const payload = Buffer.isBuffer(value) ? value : Buffer.from(value);
          peer.send(payload);
        }
      })().catch((err) => {
        console.error("[WS] History stream error", err);
        void logError("history", err);
        peer.close(1011, "history-error");
      });
    },

    async message(peer, message) {
      const roomId = peer.ctx.roomId;
      if (!roomId) return;

      const key = `${roomId}::${Date.now()}::${Math.random().toString(36).slice(2)}`;

      try {
        let data: Buffer;
        if (typeof message === "string") {
          data = Buffer.from(message);
        } else if (message instanceof ArrayBuffer) {
          data = Buffer.from(message);
        } else if (ArrayBuffer.isView(message)) {
          const view = message as ArrayBufferView;
          data = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
        } else {
          data = Buffer.from(String(message));
        }

        await db.put(key, data);
        peer.publish(roomId, data);
      } catch (err) {
        console.error("[WS] Message handling failed", err);
        void logError("message", err);
        peer.close(1011, "message-error");
      }
    },

    close(peer, details) {
      console.log("close", peer.id, peer.url, details);
    },

    error(peer, error) {
      console.log("error", peer.id, peer.url, error);
      void logError("peer-error", error);
    },
  }
});
