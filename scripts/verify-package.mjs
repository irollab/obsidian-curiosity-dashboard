import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const releaseFiles = [
  'main.js',
  'manifest.json',
  'styles.css',
  'fonts/SmileySans-Oblique.woff2',
  'fonts/OFL.txt',
];
const utf8 = new TextDecoder('utf-8', { fatal: true });

try {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  const version = requireNonEmptyString(packageJson.version, 'package.json version');
  const id = requireNonEmptyString(manifest.id, 'manifest.json id');
  if (requireNonEmptyString(manifest.version, 'manifest.json version') !== version) {
    throw new Error('package.json and manifest.json versions do not match');
  }

  const expected = new Map();
  for (const file of releaseFiles) {
    expected.set(`${id}/${file}`, await readFile(file));
  }
  const archivePath = `dist/${id}-${version}.zip`;
  const archive = await readFile(archivePath);
  verifyZip(archive, expected);
  console.log(`Verified ${archivePath}: ${expected.size} exact UTF-8 entries with valid CRC and content.`);
} catch (error) {
  console.error(`Package verification failed: ${errorMessage(error)}`);
  process.exitCode = 1;
}

export function verifyZip(archive, expected) {
  const eocdOffset = findEndOfCentralDirectory(archive);
  requireRange(archive, eocdOffset, 22, 'end of central directory');
  const commentLength = archive.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== archive.length) {
    throw new Error('ZIP comment length does not end at the archive boundary');
  }
  const disk = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntries = archive.readUInt16LE(eocdOffset + 8);
  const totalEntries = archive.readUInt16LE(eocdOffset + 10);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error('Multi-disk ZIP archives are not supported');
  }

  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  if (centralOffset + centralSize !== eocdOffset) {
    throw new Error('Central directory boundaries are inconsistent');
  }
  requireRange(archive, centralOffset, centralSize, 'central directory');

  const actualNames = new Set();
  const localRanges = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    requireRange(archive, cursor, 46, `central header ${index + 1}`);
    if (archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid central header signature for entry ${index + 1}`);
    }
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const checksum = archive.readUInt32LE(cursor + 16);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const entryCommentLength = archive.readUInt16LE(cursor + 32);
    const startDisk = archive.readUInt16LE(cursor + 34);
    const localOffset = archive.readUInt32LE(cursor + 42);
    requireRange(
      archive,
      cursor + 46,
      nameLength + extraLength + entryCommentLength,
      `central entry ${index + 1}`,
    );
    const nameBytes = archive.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = decodeUtf8(nameBytes, `central entry ${index + 1}`);
    if (actualNames.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`);
    actualNames.add(name);
    if (flags !== 0x0800) throw new Error(`Entry ${name} must use only the UTF-8 flag`);
    if (method !== 8) throw new Error(`Entry ${name} must use DEFLATE compression`);
    if (startDisk !== 0) throw new Error(`Entry ${name} starts on an unsupported disk`);

    const local = readLocalEntry(archive, {
      name,
      nameBytes,
      localOffset,
      flags,
      method,
      checksum,
      compressedSize,
      uncompressedSize,
      centralOffset,
    });
    localRanges.push([localOffset, local.end]);
    const source = expected.get(name);
    if (source === undefined) throw new Error(`Unexpected ZIP entry: ${name}`);
    if (!local.content.equals(source)) throw new Error(`ZIP content differs from source: ${name}`);
    cursor += 46 + nameLength + extraLength + entryCommentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw new Error('Central directory entry count or size is inconsistent');
  }

  const expectedNames = [...expected.keys()].sort();
  const names = [...actualNames].sort();
  if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) {
    throw new Error(`ZIP entry set mismatch: expected ${expectedNames.join(', ')}, got ${names.join(', ')}`);
  }
  localRanges.sort((left, right) => left[0] - right[0]);
  if (localRanges[0]?.[0] !== 0) throw new Error('First local entry must begin at offset 0');
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index - 1][1] !== localRanges[index][0]) {
      throw new Error('Local ZIP entries overlap or contain untracked bytes');
    }
  }
  if (localRanges.at(-1)?.[1] !== centralOffset) {
    throw new Error('Local ZIP entries do not end at the central directory');
  }
}

function readLocalEntry(archive, entry) {
  requireRange(archive, entry.localOffset, 30, `local header ${entry.name}`);
  if (archive.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new Error(`Invalid local header signature: ${entry.name}`);
  }
  const flags = archive.readUInt16LE(entry.localOffset + 6);
  const method = archive.readUInt16LE(entry.localOffset + 8);
  const checksum = archive.readUInt32LE(entry.localOffset + 14);
  const compressedSize = archive.readUInt32LE(entry.localOffset + 18);
  const uncompressedSize = archive.readUInt32LE(entry.localOffset + 22);
  const nameLength = archive.readUInt16LE(entry.localOffset + 26);
  const extraLength = archive.readUInt16LE(entry.localOffset + 28);
  if (
    flags !== entry.flags ||
    method !== entry.method ||
    checksum !== entry.checksum ||
    compressedSize !== entry.compressedSize ||
    uncompressedSize !== entry.uncompressedSize
  ) {
    throw new Error(`Central and local headers disagree: ${entry.name}`);
  }
  const nameStart = entry.localOffset + 30;
  requireRange(archive, nameStart, nameLength + extraLength, `local name ${entry.name}`);
  const localNameBytes = archive.subarray(nameStart, nameStart + nameLength);
  const localName = decodeUtf8(localNameBytes, `local entry ${entry.name}`);
  if (localName !== entry.name || !localNameBytes.equals(entry.nameBytes)) {
    throw new Error(`Central and local names disagree: ${entry.name}`);
  }
  const dataStart = nameStart + nameLength + extraLength;
  const end = dataStart + compressedSize;
  if (end > entry.centralOffset) throw new Error(`Compressed data crosses central directory: ${entry.name}`);
  requireRange(archive, dataStart, compressedSize, `compressed data ${entry.name}`);
  let content;
  try {
    content = inflateRawSync(archive.subarray(dataStart, end));
  } catch (error) {
    throw new Error(`Cannot inflate ${entry.name}: ${errorMessage(error)}`);
  }
  if (content.length !== uncompressedSize) throw new Error(`Uncompressed size mismatch: ${entry.name}`);
  if (crc32(content) !== checksum) throw new Error(`CRC mismatch: ${entry.name}`);
  return { content, end };
}

function findEndOfCentralDirectory(archive) {
  const minimum = Math.max(0, archive.length - 22 - 0xffff);
  for (let offset = archive.length - 22; offset >= minimum; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('End of central directory signature not found');
}

function requireRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Invalid ${label} range`);
  }
}

function decodeUtf8(bytes, label) {
  try {
    return utf8.decode(bytes);
  } catch (error) {
    throw new Error(`Invalid UTF-8 in ${label}: ${errorMessage(error)}`);
  }
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
