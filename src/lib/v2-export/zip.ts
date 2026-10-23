import { deflateRawSync } from "node:zlib";
import type { SourceFile } from "../v2/types";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function exportablePath(name: string) {
  const parts = name.split("/");
  return name.length > 0 && name.length <= 200 && !name.includes("\\") &&
    parts.every(part => part && part !== "." && part !== "..") &&
    !parts.some(part => ["node_modules", ".git", ".next", "dist", "build", "coverage", "data", "uploads"].includes(part) || part === ".env" || part.startsWith(".env.")) &&
    !/\.(sqlite(?:3)?|db|pem|key)(?:-wal|-shm)?$/i.test(name);
}

/** Small bounded source archives; no filesystem traversal or external zip process. */
export function sourceZip(files: SourceFile[]) {
  const local: Buffer[] = [], central: Buffer[] = [];
  let offset = 0, count = 0, bytes = 0;
  const seen = new Set<string>();
  for (const file of files) {
    if (!exportablePath(file.path)) continue;
    if (seen.has(file.path)) throw new Error("Duplicate archive path.");
    seen.add(file.path);
    const name = Buffer.from(file.path), raw = Buffer.from(file.content);
    bytes += raw.length;
    if (++count > 100 || bytes > 2_000_000) throw new Error("Source archive exceeds export limits.");
    const compressed = deflateRawSync(raw), crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, name); offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
