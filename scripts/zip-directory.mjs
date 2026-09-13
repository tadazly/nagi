import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Small UTF-8 ZIP archives, without a platform-specific shell or extra dependency.
export async function zipDirectory(directory, archive) {
  const local = [];
  const central = [];
  let offset = 0;
  let count = 0;
  async function visit(folder, prefix) {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(folder, entry.name);
      const name = prefix + entry.name;
      if (entry.isDirectory()) { await visit(path, name + '/'); continue; }
      if (!entry.isFile()) throw new Error(`不支持的打包文件：${path}`);
      const source = await readFile(path);
      const compressed = deflateRawSync(source, { level: 9 });
      const filename = Buffer.from(name, 'utf8');
      if (source.length >= 0xffffffff || offset + compressed.length >= 0xffffffff || count >= 65535) {
        throw new Error('壁纸包超出 ZIP32 限制');
      }
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0x800, 6); // UTF-8
      header.writeUInt16LE(8, 8); // Deflate
      header.writeUInt16LE(0x21, 12); // 1980-01-01
      header.writeUInt32LE(crc32(source), 14);
      header.writeUInt32LE(compressed.length, 18);
      header.writeUInt32LE(source.length, 22);
      header.writeUInt16LE(filename.length, 26);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      header.copy(record, 6, 4, 30);
      record.writeUInt32LE(offset, 42);
      local.push(header, filename, compressed);
      central.push(record, filename);
      offset += header.length + filename.length + compressed.length;
      count++;
    }
  }
  await visit(directory, basename(directory) + '/');
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(archive, Buffer.concat([...local, ...central, end]));
}
