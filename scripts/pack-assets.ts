/**
 * Packs store-assets/ into a single zip to hand over.
 *
 * Written against `zip` if it is on the path and a minimal writer if it is not,
 * because the store assets should be downloadable from a clean checkout without
 * anyone installing anything first.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateRawSync } from "node:zlib";

const ROOT = new URL("../", import.meta.url).pathname;
const SOURCE = join(ROOT, "store-assets");
const OUT = join(ROOT, "thrum-store-assets.zip");

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** CRC-32, the checksum the zip format requires for every entry. */
function crc32(data: Buffer): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function writeZip(files: string[]): void {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files.sort()) {
    const name = relative(SOURCE, file).split("\\").join("/");
    const nameBytes = Buffer.from(name, "utf8");
    const raw = readFileSync(file);
    const deflated = deflateRawSync(raw);
    // PNGs are already deflated, so storing beats re-compressing them.
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const sum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(OUT, Buffer.concat([...chunks, directory, end]));
}

const files = filesUnder(SOURCE);
const zipped = spawnSync("zip", ["-rq", OUT, "."], { cwd: SOURCE });
if (zipped.error || zipped.status !== 0) writeZip(files);

const size = statSync(OUT).size;
console.log(`wrote ${relative(ROOT, OUT)}  (${files.length} files, ${(size / 1024).toFixed(0)} kB)`);
