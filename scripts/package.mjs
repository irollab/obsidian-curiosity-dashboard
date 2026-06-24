import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const releaseFiles = [
  'main.js',
  'manifest.json',
  'styles.css',
  'fonts/SmileySans-Oblique.woff2',
  'fonts/OFL.txt',
];

try {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const version = requireNonEmptyString(packageJson.version, 'package.json version');
  const id = requireNonEmptyString(manifest.id, 'manifest.json id');
  const manifestVersion = requireNonEmptyString(manifest.version, 'manifest.json version');
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`manifest.json id is not a safe plugin directory name: ${id}`);
  }
  if (manifestVersion !== version) {
    throw new Error(
      `Version mismatch: package.json is ${version}, manifest.json is ${manifestVersion}`,
    );
  }

  const distRoot = 'dist';
  const pluginDir = `${distRoot}/${id}`;
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(pluginDir, { recursive: true });

  const entries = [];
  for (const file of releaseFiles) {
    try {
      const target = `${pluginDir}/${file}`;
      await mkdir(dirname(target), { recursive: true });
      await cp(file, target);
      entries.push({ name: `${id}/${file}`, data: await readFile(file) });
    } catch (error) {
      throw new Error(`Cannot package required release file ${file}: ${errorMessage(error)}`);
    }
  }

  const archive = `${distRoot}/${id}-${version}.zip`;
  await writeFile(archive, createZip(entries));
  console.log(`Created ${archive} with ${entries.length} release files.`);
} catch (error) {
  console.error(`Packaging failed: ${errorMessage(error)}`);
  process.exitCode = 1;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}
