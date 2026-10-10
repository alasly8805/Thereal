import { crc32 } from "zlib";

/**
 * Minimal "stored" (uncompressed) ZIP writer. Student uploads are PDFs and
 * photos that are already compressed, so deflate would cost CPU for nothing.
 * Entries are produced one at a time by `next()`, so only one file is held in
 * memory, which matters on this small server.
 */
export type ZipEntry = { name: string; data: Buffer; date?: Date };

function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function zipStream(next: () => Promise<ZipEntry | null>): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  let finished = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      const entry = await next();
      if (entry) {
        const name = Buffer.from(entry.name, "utf8");
        const crc = crc32(entry.data) >>> 0;
        const size = entry.data.length;
        const { time, date } = dosDateTime(entry.date ?? new Date());
        const flags = 0x0800; // file name is UTF-8

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(0, 8); // stored
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(size, 18);
        local.writeUInt32LE(size, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);

        const dir = Buffer.alloc(46);
        dir.writeUInt32LE(0x02014b50, 0);
        dir.writeUInt16LE(20, 4);
        dir.writeUInt16LE(20, 6);
        dir.writeUInt16LE(flags, 8);
        dir.writeUInt16LE(0, 10);
        dir.writeUInt16LE(time, 12);
        dir.writeUInt16LE(date, 14);
        dir.writeUInt32LE(crc, 16);
        dir.writeUInt32LE(size, 20);
        dir.writeUInt32LE(size, 24);
        dir.writeUInt16LE(name.length, 28);
        dir.writeUInt32LE(offset, 42);
        central.push(dir, name);

        controller.enqueue(new Uint8Array(Buffer.concat([local, name])));
        controller.enqueue(new Uint8Array(entry.data));
        offset += local.length + name.length + size;
        count += 1;
        return;
      }

      const dirBuf = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(count, 8);
      end.writeUInt16LE(count, 10);
      end.writeUInt32LE(dirBuf.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(new Uint8Array(Buffer.concat([dirBuf, end])));
      finished = true;
      controller.close();
    },
  });
}

/** A path segment safe inside a ZIP on Windows, macOS and Android. */
export function zipSafeName(value: string, fallback = "file"): string {
  const cleaned = value.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}
