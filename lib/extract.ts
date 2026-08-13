/**
 * Text extraction ("OCR gateway").
 *
 * Handles the formats a document vault actually receives. PDF text is pulled by
 * decoding content streams directly — no native deps, no upload to a third party.
 * Scanned/image documents are flagged as needing OCR rather than silently failing.
 */
import zlib from "node:zlib";

export type Extracted = {
  text: string;
  pageCount: number;
  method: "plaintext" | "pdf-text" | "docx" | "html" | "csv" | "ocr-required" | "unsupported";
  note?: string;
};

export async function extractText(buf: Buffer, mime: string, filename: string): Promise<Extracted> {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (mime.startsWith("text/") || ["txt", "md", "log", "json", "eml"].includes(ext)) {
    return { text: buf.toString("utf8"), pageCount: 1, method: "plaintext" };
  }
  if (ext === "csv" || mime.includes("csv")) {
    return { text: buf.toString("utf8"), pageCount: 1, method: "csv" };
  }
  if (ext === "html" || ext === "htm" || mime.includes("html")) {
    const raw = buf.toString("utf8");
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    return { text, pageCount: 1, method: "html" };
  }
  if (ext === "pdf" || mime === "application/pdf") return extractPdf(buf);
  if (ext === "docx" || mime.includes("wordprocessingml")) return extractDocx(buf);
  if (["png", "jpg", "jpeg", "webp", "tif", "tiff", "heic"].includes(ext) || mime.startsWith("image/")) {
    return {
      text: "",
      pageCount: 1,
      method: "ocr-required",
      note: "Image document detected. Connect an OCR provider (or set OPENAI_API_KEY for vision OCR) to read scanned pages.",
    };
  }
  return { text: "", pageCount: 1, method: "unsupported", note: `No text extractor for .${ext}` };
}

/** Minimal PDF text extractor: inflate streams, then read text-showing operators. */
function extractPdf(buf: Buffer): Extracted {
  const pageCount = Math.max(1, (buf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length);
  const chunks: string[] = [];

  // Walk every stream object; inflate the ones that are Flate-encoded.
  const raw = buf.toString("latin1");
  const streamRe = /stream\r?\n?([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const body = Buffer.from(m[1], "latin1");
    let data: Buffer = body;
    try {
      data = zlib.inflateSync(body);
    } catch {
      try {
        data = zlib.inflateRawSync(body);
      } catch {
        // not compressed (or unsupported filter) — use as-is
      }
    }
    const s = data.toString("latin1");
    if (/\bTJ\b|\bTj\b/.test(s)) chunks.push(s);
  }
  if (!chunks.length && /\bTJ\b|\bTj\b/.test(raw)) chunks.push(raw);

  const out: string[] = [];
  for (const content of chunks) {
    // Text-showing operators come in several shapes:
    //   (literal) Tj        <48656C6C6F> Tj        [(a) -250 (b)] TJ
    //   T* / Td / TD / '  ->  line break
    const op =
      /\[((?:[^\[\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|')|<([0-9A-Fa-f\s]+)>\s*Tj|(?:^|[\s\]>)])(T\*|Td|TD|Tm)(?=[\s\/]|$)/gm;
    for (const t of content.matchAll(op)) {
      if (t[1] !== undefined) {
        // array form: concatenate the string pieces, both literal and hex
        const parts = [...t[1].matchAll(/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>/g)].map((p) =>
          p[1] !== undefined ? unescapePdf(p[1]) : hexToText(p[2])
        );
        out.push(parts.join(""));
      } else if (t[2] !== undefined) {
        out.push(unescapePdf(t[2]));
      } else if (t[3] !== undefined) {
        out.push(hexToText(t[3]));
      } else if (t[4] !== undefined) {
        out.push("\n");
      }
    }
    out.push("\n");
  }

  const text = out
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length < 25) {
    return {
      text,
      pageCount,
      method: "ocr-required",
      note: "This PDF has no embedded text layer (likely a scan). Enable an OCR provider to index it.",
    };
  }
  return { text, pageCount, method: "pdf-text" };
}

/** <48656C6C6F> hex strings, incl. UTF-16BE with a BOM. */
function hexToText(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes = Buffer.from(clean.length % 2 ? clean + "0" : clean, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return bytes.subarray(2).swap16().toString("utf16le");
  }
  return bytes.toString("latin1");
}

function unescapePdf(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

/** DOCX = zip; word/document.xml holds the text. Parse the zip central directory by hand. */
function extractDocx(buf: Buffer): Extracted {
  try {
    const entry = readZipEntry(buf, "word/document.xml");
    if (!entry) return { text: "", pageCount: 1, method: "unsupported", note: "Malformed .docx" };
    const xml = entry.toString("utf8");
    const text = xml
      .replace(/<w:p[ >][\s\S]*?(?=<w:p[ >]|$)/g, (p) => p + "\n")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const pageCount = Math.max(1, Math.ceil(text.length / 3000));
    return { text, pageCount, method: "docx" };
  } catch (e: any) {
    return { text: "", pageCount: 1, method: "unsupported", note: e?.message || "docx parse failed" };
  }
}

function readZipEntry(zip: Buffer, name: string): Buffer | null {
  // locate End Of Central Directory
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 65558; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let off = zip.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(off) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(off + 10);
    const compSize = zip.readUInt32LE(off + 20);
    const nameLen = zip.readUInt16LE(off + 28);
    const extraLen = zip.readUInt16LE(off + 30);
    const commentLen = zip.readUInt16LE(off + 32);
    const localOff = zip.readUInt32LE(off + 42);
    const entryName = zip.subarray(off + 46, off + 46 + nameLen).toString("utf8");

    if (entryName === name) {
      const lNameLen = zip.readUInt16LE(localOff + 26);
      const lExtraLen = zip.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
