/**
 * Format conversion. Runs entirely in-process so documents never leave the vault
 * to reach a third-party converter.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "./db";
import { readBlob } from "./vault";
import { extractText } from "./extract";

export type Target = "pdf" | "txt" | "md" | "csv" | "json";

export async function convert(docId: string, target: Target): Promise<{ filename: string; mime: string; body: Buffer }> {
  const { buffer, doc } = readBlob(docId);
  const stored = db().prepare("SELECT body FROM doc_text WHERE doc_id = ?").get(docId) as any;
  const text: string = stored?.body ?? (await extractText(buffer, doc.mime, doc.filename)).text;
  const base = doc.filename.replace(/\.[^.]+$/, "");

  switch (target) {
    case "txt":
      return { filename: `${base}.txt`, mime: "text/plain", body: Buffer.from(text, "utf8") };

    case "md": {
      const ents = db().prepare("SELECT kind, value FROM entities WHERE doc_id = ?").all(docId) as any[];
      const md = [
        `# ${doc.title}`,
        ``,
        `> ${doc.summary ?? ""}`,
        ``,
        `| Field | Value |`,
        `| --- | --- |`,
        `| Category | ${doc.category}${doc.subcategory ? " / " + doc.subcategory : ""} |`,
        `| Issuer | ${doc.issuer ?? "—"} |`,
        `| Document date | ${doc.doc_date ?? "—"} |`,
        `| Expires | ${doc.expires_at ?? "—"} |`,
        `| Sensitivity | ${doc.sensitivity} |`,
        ``,
        `## Extracted entities`,
        ...ents.map((e) => `- **${e.kind}**: ${e.value}`),
        ``,
        `## Full text`,
        ``,
        text,
      ].join("\n");
      return { filename: `${base}.md`, mime: "text/markdown", body: Buffer.from(md, "utf8") };
    }

    case "json": {
      const ents = db().prepare("SELECT kind, value, normalized, confidence FROM entities WHERE doc_id = ?").all(docId) as any[];
      const tags = (db().prepare("SELECT tag FROM tags WHERE doc_id = ?").all(docId) as any[]).map((t) => t.tag);
      const payload = {
        id: doc.id,
        title: doc.title,
        filename: doc.filename,
        category: doc.category,
        subcategory: doc.subcategory,
        issuer: doc.issuer,
        documentDate: doc.doc_date,
        expiresAt: doc.expires_at,
        amount: doc.amount,
        sensitivity: doc.sensitivity,
        confidence: doc.confidence,
        summary: doc.summary,
        tags,
        entities: ents,
        text,
      };
      return { filename: `${base}.json`, mime: "application/json", body: Buffer.from(JSON.stringify(payload, null, 2), "utf8") };
    }

    case "csv": {
      const ents = db().prepare("SELECT kind, value, normalized, confidence FROM entities WHERE doc_id = ?").all(docId) as any[];
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [
        ["document", "kind", "value", "normalized", "confidence"].join(","),
        ...ents.map((e) => [doc.title, e.kind, e.value, e.normalized, e.confidence].map(esc).join(",")),
      ];
      return { filename: `${base}-entities.csv`, mime: "text/csv", body: Buffer.from(rows.join("\n"), "utf8") };
    }

    case "pdf": {
      if (doc.mime === "application/pdf") {
        return { filename: doc.filename, mime: "application/pdf", body: buffer };
      }
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const size = 10;
      const margin = 54;
      let page = pdf.addPage([595, 842]);
      let y = 842 - margin;

      page.drawText(doc.title.slice(0, 70), { x: margin, y, size: 16, font: bold, color: rgb(0.05, 0.1, 0.2) });
      y -= 22;
      page.drawText(`${doc.category}${doc.subcategory ? " · " + doc.subcategory : ""} · converted by VaultMind`, {
        x: margin, y, size: 9, font, color: rgb(0.4, 0.45, 0.5),
      });
      y -= 24;

      const maxChars = Math.floor((595 - margin * 2) / (size * 0.5));
      const lines = text.split(/\r?\n/).flatMap((line) => {
        const out: string[] = [];
        let cur = "";
        for (const word of line.split(/\s+/)) {
          if ((cur + " " + word).trim().length > maxChars) {
            out.push(cur.trim());
            cur = word;
          } else cur += " " + word;
        }
        out.push(cur.trim());
        return out.length ? out : [""];
      });

      for (const line of lines) {
        if (y < margin) {
          page = pdf.addPage([595, 842]);
          y = 842 - margin;
        }
        // strip characters the standard WinAnsi font can't encode
        page.drawText(line.replace(/[^\x20-\x7E]/g, " ").slice(0, 200), { x: margin, y, size, font });
        y -= size * 1.45;
      }
      const bytes = await pdf.save();
      return { filename: `${base}.pdf`, mime: "application/pdf", body: Buffer.from(bytes) };
    }
  }
}
