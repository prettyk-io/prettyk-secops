/**
 * Минимальный ZIP (store, без сжатия) для suite-пакета: wired.json + resources/*.
 */

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function encodePath(name: string): Uint8Array {
  return new TextEncoder().encode(name);
}

function zipLocalAndCentral(
  entry: ZipEntry,
  offset: number,
): { local: Uint8Array; central: Uint8Array } {
  const nameBytes = encodePath(entry.name);
  const crc = crc32(entry.data);
  const size = entry.data.length;
  const local = concat([
    u32(0x04034b50),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(size),
    u32(size),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    entry.data,
  ]);
  const central = concat([
    u32(0x02014b50),
    u16(20),
    u16(20),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(crc),
    u32(size),
    u32(size),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(offset),
    nameBytes,
  ]);
  return { local, central };
}

/** Собрать zip из текстовых файлов (пути с `/`). */
export function buildZipBlob(files: Record<string, string>): Blob {
  const entries: ZipEntry[] = Object.entries(files).map(([name, text]) => ({
    name: name.replace(/\\/g, '/'),
    data: new TextEncoder().encode(text),
  }));

  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const { local, central } = zipLocalAndCentral(entry, offset);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  const bytes = concat([...locals, centralDir, end]);
  // Копия в ArrayBuffer — совместимость с DOM BlobPart / TS lib.dom.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: 'application/zip' });
}

const KIND_EXT: Record<string, string> = {
  har_file: 'har',
  proto_pack: 'zip',
  openapi_spec: 'json',
  graphql_sdl: 'graphql',
};

function pathForImportRec(
  as: string,
  rec: { as?: string; path?: string; kind?: string },
): string | undefined {
  if (rec.as !== as) {
    return undefined;
  }
  if (typeof rec.path === 'string' && rec.path.trim()) {
    return rec.path.replace(/\\/g, '/');
  }
  const ext = rec.kind ? KIND_EXT[rec.kind] : undefined;
  return ext ? `resources/${as}.${ext}` : undefined;
}

function resourceSidecarPathFromWired(
  wiredJson: string,
  as: string,
): string {
  try {
    const parsed = JSON.parse(wiredJson) as {
      test_suites?: { imports?: unknown[] };
    };
    const imports = parsed.test_suites?.imports;
    if (!Array.isArray(imports)) {
      return `resources/${as}.txt`;
    }
    for (const item of imports) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const path = pathForImportRec(as, item as { as?: string; path?: string; kind?: string });
      if (path) {
        return path;
      }
    }
  } catch {
    /* fall through */
  }
  return `resources/${as}.txt`;
}

function appendResourceSidecars(
  files: Record<string, string>,
  wiredJson: string,
  resources: Record<string, string>,
): void {
  for (const [as, content] of Object.entries(resources)) {
    if (!as.trim()) {
      continue;
    }
    const key = as.trim();
    files[resourceSidecarPathFromWired(wiredJson, key)] = content;
  }
}

export function buildSuiteZipFiles(
  wiredJson: string,
  resources: Record<string, string>,
): Record<string, string> {
  const files: Record<string, string> = {
    'wired.json': wiredJson.endsWith('\n') ? wiredJson : `${wiredJson}\n`,
  };
  appendResourceSidecars(files, wiredJson, resources);
  return files;
}

/**
 * Чтение store-zip (метод 0), как из buildZipBlob.
 * Сжатые записи пропускаются.
 */
export function readStoreZipTextFiles(buffer: ArrayBuffer): Record<string, string> | undefined {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const sig = readU32(view, offset);
    if (sig !== 0x04034b50) {
      break;
    }
    const method = readU16(view, offset + 8);
    const compSize = readU32(view, offset + 18);
    const nameLen = readU16(view, offset + 26);
    const extraLen = readU16(view, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    if (dataStart + compSize > bytes.length) {
      return undefined;
    }
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    if (method === 0) {
      files[name] = decoder.decode(bytes.subarray(dataStart, dataStart + compSize));
    }
    offset = dataStart + compSize;
  }

  return Object.keys(files).length > 0 ? files : undefined;
}

export function extractSuiteFromZipFiles(files: Record<string, string>): {
  wiredJson?: string;
  resourceContents: Record<string, string>;
} {
  const wiredJson = files['wired.json'];
  const resourceContents: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    const match = /^resources\/([^/]+)\.(txt|har)$/i.exec(path.replace(/\\/g, '/'));
    if (!match?.[1]) {
      continue;
    }
    resourceContents[match[1]] = content;
  }
  return { wiredJson, resourceContents };
}
