# VaultMind — AI Document Intelligence

An encrypted personal document vault where a mesh of AI agents reads, files, explains,
and guards your paperwork. Built to solve ten concrete problems people actually have
with documents — finding them, understanding them, organising them, keeping them safe,
and never missing a renewal.

```bash
npm install
npm run seed     # creates a demo vault (passphrase: demo-passphrase)
npm run dev      # http://localhost:3000
npm test         # 63 end-to-end checks
```

---

## The ten problems, and how each is solved

| Problem | Solution in VaultMind |
| --- | --- |
| **Finding important documents quickly** | Hybrid search: FTS5/BM25 keyword ranking fused with local vector similarity via Reciprocal Rank Fusion. Typical query resolves in **1–4 ms**. |
| **Understanding complex documents** | Every document gets an extractive summary *and* a plain-English explainer with a readability grade and a jargon glossary ("indemnify → cover someone else's losses"). |
| **Organizing documents automatically** | The classifier, tagger, and entity agents file each upload into 13 categories with subcategories, tags, and structured fields — no manual filing. |
| **Secure storage and backup** | AES-256-GCM envelope encryption, per-document data keys, scrypt-derived master key, integrity verification, and hash-manifested snapshots. |
| **Financial document management** | Amounts, issuers, and dates are extracted and rolled up into a value dashboard. A cue-aware parser picks the *salient* figure (the premium, not the liability limit). |
| **Expiration and renewal reminders** | The deadline agent reads expiry/renewal/due-date language and schedules reminders with lead times tuned per document type (passport 90d, bill 30d). |
| **AI-powered search across all documents** | Natural-language queries are parsed into filters ("insurance from last year over $500") and answered with grounded, cited Q&A. |
| **Converting file formats** | In-process conversion to PDF, TXT, Markdown, JSON, and CSV — the file is decrypted in memory and never sent to a third-party converter. |
| **Automatic form filling** | A profile agent harvests reusable facts during ingestion; any pasted form is matched field-by-field, with the source document cited for every value. |
| **Secure document sharing** | Expiring, view-capped, optionally password-protected links with automatic redaction of SSNs, card numbers, emails, and phone numbers. Revocable instantly. |

---

## Architecture

```
Browser (Next.js App Router, React 19)
   │
   ├── /api/*  route handlers — every one guarded by the vault lock
   │
   ├── lib/vault.ts      unlock/lock, ingest, read-back, sharing, backup, rotation
   ├── lib/crypto.ts     envelope encryption, key wrapping, hash chain
   ├── lib/agents/       the agent mesh (below)
   ├── lib/search.ts     hybrid retrieval + grounded Q&A
   ├── lib/extract.ts    PDF / DOCX / HTML / CSV text extraction (no native deps)
   ├── lib/convert.ts    format conversion
   ├── lib/autofill.ts   profile matching for forms
   │
   └── data/             encrypted blobs + SQLite (metadata, FTS5 index, embeddings)
```

### The agent mesh

Ingestion is a pipeline of narrow, auditable agents rather than one opaque call.
Each records its engine, latency, and confidence, so every decision is traceable
in the UI under **Agent activity**.

| Agent | Responsibility |
| --- | --- |
| `classifier` | Category + subcategory from a weighted lexicon, with margin-based confidence |
| `entity-extractor` | Money, dates, parties, policy/account/invoice numbers, VINs, addresses |
| `summarizer` | Extractive summary + plain-language explainer + readability grade |
| `tagger` | Searchable tags from dominant terms, issuer, and year |
| `indexer` | FTS5 rows and chunk embeddings for semantic retrieval |
| `compliance` | PII inventory and the sensitivity tier that governs sharing |
| `deadline-watcher` | Expiry/renewal detection and reminder scheduling |
| `profile-builder` | Harvests reusable facts for form autofill |
| `orchestrator` | Runs the pipeline and writes the structured record back |

### Pluggable inference

Set `OPENAI_API_KEY` and the classifier, entity, summariser, and Q&A agents call the
OpenAI API. **Without a key the app is fully functional** — a dependency-free local
NLP engine (`lib/ai/local.ts`) provides lexicon classification, regex/heuristic entity
extraction, TextRank-style summarisation, a light stemmer, and hashed bag-of-words
embeddings. Nothing is stubbed, and no document has to leave the machine.

```bash
export OPENAI_API_KEY=sk-...        # optional
export OPENAI_MODEL=gpt-4o-mini     # optional
```

---

## Security model

- **Envelope encryption.** Each document is sealed with its own random AES-256-GCM data
  key (DEK). The DEK is wrapped with a key-encryption key (KEK) derived from your
  passphrase via scrypt (N=16384). Rotating the passphrase re-wraps DEKs only — blobs
  are never re-encrypted, so rotation is fast even for large vaults.
- **The key never persists.** The KEK lives in server memory for the session and is
  dropped on lock or after 30 minutes idle. A verifier hash proves the passphrase
  without storing it. There is no recovery backdoor.
- **Integrity is enforced on read.** Every blob carries a GCM auth tag and a SHA-256 of
  its plaintext; tampering is detected and the read fails rather than returning
  corrupted data.
- **Tamper-evident audit log.** Each entry commits to the hash of the previous one.
  Editing or deleting any entry breaks the chain, which the Security view verifies.
- **Sensitivity-aware sharing.** Share links carry expiry, view caps, optional password
  (scrypt-hashed), and automatic redaction. Tokens are stored only as SHA-256 hashes.

Verified by the test suite:

```
✓ stored blob is not plaintext
✓ tampered ciphertext is rejected by GCM auth tag
✓ reads are denied while locked
✓ old passphrase no longer works after rotation
✓ revocation takes effect immediately
✓ chain detects an altered entry
```

---

## Notable implementation details

- **No native dependencies.** Storage uses Node 22's built-in `node:sqlite` (with FTS5),
  so there is no `better-sqlite3` build step. PDF text is extracted by inflating content
  streams and decoding text operators — including hex strings and UTF-16BE — and DOCX by
  parsing the zip central directory directly.
- **Calibrated confidence.** Classification confidence is a bounded function of evidence
  and margin over the runner-up, so it spreads realistically (0.63–0.92 on the sample
  corpus) instead of saturating at 0.98 for everything.
- **Answer-shape aware Q&A.** "How much…" boosts sentences containing currency, "when…"
  boosts sentences containing dates. Header lines and short label fragments are
  penalised, so answers come back as the one relevant line rather than a wall of text.
- **Salient-amount extraction.** Cue words around each figure decide which one matters,
  so an insurance policy reports its $1,842 premium rather than its $2,000,000
  liability limit.
- **Head-word field matching.** Autofill will not fill "Email Address" from a postal
  address just because both labels contain the word "address".
- **Relative demo dates.** Sample documents use date tokens resolved at seed time, so
  renewals always sit in the near future whenever the demo is run.

---

## Project layout

```
app/
  api/            18 route handlers (session, documents, upload, search, ask,
                  reminders, shares, convert, autofill, audit, security, agents)
  share/[token]/  public recipient view — redacted, metered, no auth
  page.tsx        lock screen ↔ app shell
components/
  views/          Dashboard, Documents, Search, Assistant, Reminders,
                  Sharing, Convert, Autofill, Agents, Security
  DocumentDrawer  per-document deep dive (explainer, facts, text, pipeline)
lib/              crypto, db, extract, search, convert, autofill, agents, ai
scripts/          seed.ts (demo vault), test.ts (63 checks), seed-docs, dates
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on `0.0.0.0:3000` |
| `npm run build` | Production build |
| `npm run seed` | Rebuild the demo vault from the sample corpus |
| `npm test` | End-to-end suite against a throwaway vault in `data-test/` |

`data/` holds your encrypted blobs and database and is git-ignored.
