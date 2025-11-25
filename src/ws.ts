import { eventHandler } from "vinxi/http";
import { Level } from "level";
import { getQuery } from "ufo";

// Persistent storage for encrypted blobs
const db = new Level(process.env.DB_PATH || "./storage/leveldb", { valueEncoding: "binary" });

export default eventHandler({
  handler() {},
  websocket: {
    async open(peer) {
      const query = getQuery(peer.url);
      const roomId = query.room as string;

      if (!roomId) {
        peer.close();
        return;
      }

      peer.ctx.roomId = roomId;
      peer.subscribe(roomId);
      console.log(`[WS] Joined Room: ${roomId}`);

      // Stream history: Iterate only keys starting with "roomId::"
      const stream = db.iterator({
        gte: `${roomId}::`,
        lt: `${roomId}::\xff`,
      });

      (async () => {
        for await (const [_, value] of stream) {
          peer.send(value);
        }
      })();
    },

    async message(peer, message) {
      const roomId = peer.ctx.roomId;
      if (!roomId) return;

      // Store: [RoomID]::[Timestamp]::[Nonce] -> [Encrypted Blob]
      const key = `${roomId}::${Date.now()}::${Math.random().toString(36).slice(2)}`;

      // Ensure buffer
      let data: any = message;
      if (typeof message === "string") data = Buffer.from(message);

      await db.put(key, data);
      peer.publish(roomId, data);
    },
  }
});
