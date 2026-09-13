# Project Status

**This is the one file every AI session and every team member reads first.**
The actual code files are the ground truth. This file reflects what is
currently implemented and working. When in doubt, read the code.

Update this at the end of every work session. An out-of-date status file is
worse than none — the next session will trust it.

---

## Last updated

`2026-09-12` — Implemented Hindi grievance localization: (1) Added `FIELD_PROMPTS` translation map (30 prompts × 6 langs) + fixed `translate_field_prompt()` stub, (2) Added 8 missing PMFBY submission step/document translations to `SUBMISSION_STEPS`, (3) Added `FOLLOWUP_PREFIX` map (3 prefixes × 6 langs) + wired into `followup_generator.py`, (4) Added `WORKFLOW_PREFIX` map + wired into `chat.py` back-translation, (5) Added field label translations in `dictionaries.ts` (45 keys × 6 langs) + updated `GrievanceCard.tsx` to look up i18n labels, (6) Removed 9 diagnostic `EGA_PMFBY_*` console.logs. 34 new localization tests, 5 updated GrievanceCard tests, all passing.

## Current state

System is **feature-complete**. Backend RAG pipeline, 9-stage grievance workflow,
voice I/O, multi-language support (6 languages), and Next.js frontend are all
implemented and wired together.

**Selected state:** `gujarat` (`selected_state: "gujarat"` in `backend/app/config.py`)

**LLM config (locked):** Primary=`openai/gpt-oss-120b` (Groq), Fallback=`qwen/qwen3.8-27b` (Groq), Ultimate=Gemini `gemini-2.5-flash`

---

## Component status

`not started / stubbed / in progress / working / broken`

| Component | File(s) | Status | Notes |
|---|---|---|---|
| FastAPI app + `/health`, `/health/providers` | `app/main.py` | working | 6 routers registered (including documents) |
| `/chat` (sync) | `app/routes/chat.py` | working | Language detect → domain classify → RAGOrchestrator or GrievanceWorkflow; clean language boundary for grievance (input translate → English workflow → output translate); multilingual routing with Tier 2 grievance-keyword override + Tier 3 non-English guard |
| `/chat/stream` (SSE) | `app/routes/chat.py` | working | Same pipeline, Server-Sent Events with `thinking/token/metadata/done` events; same multilingual routing fixes |
| `/voice`, `/voice/transcribe`, `/voice/speak` | `app/routes/voice.py` | working | Full audio→STT→RAG→TTS pipeline |
| `/conversations` | `app/routes/conversations.py` | working | Session history retrieval |
| `/evidence` | `app/routes/evidence.py` | working | Evidence endpoint |
| `/grievance` (route) | `app/routes/grievance.py` | working | Grievance REST endpoint |
| `/documents/pdf/{filename}` | `app/routes/documents.py` | working | Safe PDF serving with path traversal prevention |
| Domain classifier (AnchorStore) | `app/domains.py` | working | Keyword rules + embedding cosine; floor 0.30 |
| Session store | `app/session_store.py` | working | Supabase-backed, keeps last 50 messages; frontend resets on new-chat/load/delete |
| Language detection | `app/language.py` | working | Detects dominant language and language mix |
| Translation (Sarvam primary, Azure fallback) | `app/providers/sarvam_translator.py`, `app/providers/translator.py` | working | Used in chat.py pre/post RAG |
| RAGOrchestrator | `app/services/rag_orchestrator.py` | working | Async dual-pipeline: static + web in parallel via `asyncio.gather` |
| StaticRAGService | `app/services/static_rag.py` | working | Supabase pgvector hybrid retrieval (dense + lexical RRF) → EvidenceChunks |
| WebRAGService | `app/services/web_rag.py` | working | 10-step web RAG: Tavily/Firecrawl → BM25 → Gemini pre-rank → RRF → Gemini final-rank → source verify → EvidenceChunks |
| EvidenceController + prompt builder | `app/evidence_controller.py` | working | Merges chunks, builds curated source-priority prompt |
| Evidence gate | `app/evidence_gate.py` | working | Threshold: `TOP1_THRESHOLD=0.25`, `SECONDARY_THRESHOLD=0.30`, `MIN_CHUNKS_ABOVE_SECONDARY=2` |
| Citation verifier | `app/citation_verifier.py` | working | Set-membership check — every `[chunk:id]` must map to a retrieved chunk; web IDs `web_*` supported; ambiguity-safe prefix matching |
| Confidence calculation | `app/services/rag_orchestrator.py` | working | Band-based; dual-source gets +0.10 boost |
| GrievanceWorkflow (9-stage state machine) | `app/grievance/workflow.py` | working | INTAKE → CLASSIFICATION → ENTITY_EXTRACTION → MISSING_FIELDS → FOLLOWUP → DRAFT_READY → SUBMISSION_GUIDE → STATUS_LOOKUP → COMPLETE; English-only source of truth; fresh-state defense for new complaints after completed grievance |
| Grievance classifier | `app/grievance/classifier.py` | working | |
| Grievance draft builder | `app/grievance/draft_builder.py` | working | English-only; canonical dict exposes `description.original` for user's pre-translation text |
| Grievance entity extractor | `app/grievance/entity_extractor.py` | working | |
| Grievance field detector | `app/grievance/field_detector.py` | working | `FIELD_LABELS` dict (150+ entries), `get_field_labels()` for i18n field names; prompts translated via `translate_field_prompt()` using `FIELD_PROMPTS` map |
| Grievance semantic extractor | `app/grievance/semantic_extractor.py` | working | |
| Grievance submission guide | `app/grievance/submission_guide.py` | working | Portal lookup; output translated at boundary |
| Grievance status lookup | `app/grievance/status_lookup.py` | working | |
| Grievance state persistence | `app/grievance/workflow.py` | working | Supabase `grievance_states` table, upsert on `conversation_id` |
| Grievance localization layer | `app/routes/chat.py`, `app/routes/grievance.py`, `app/grievance/translations.py` | working | Backend translates: field prompts (FIELD_PROMPTS map), submission steps, followup prefixes, workflow prefixes, field labels, draft_summary, canonical dict; user values preserved verbatim; frontend translates field card labels via i18n dictionary |
| Routing hierarchy | `app/routes/chat.py`, `app/grievance/workflow.py` | working | Tier 1: domain/intent → grievance; Tier 2: guidance intent → RAG, grievance-keyword override; Tier 3: non-English guard; informational regex |
| Grievance UI (frontend) | `frontend/src/components/chat/GrievanceFlow.tsx` | working | Orchestrates stage panels; `GrievanceClassificationPanel`, `GrievanceFieldPanel`, `GrievanceCard` (renders i18n-translated field labels) |
| Session isolation | `frontend/src/components/ChatWindow.tsx` | working | `useRef` + `resetSessionId()` prevents state leakage across "New Chat" |
| VoiceService (STT/TTS fallback chain) | `app/services/voice_service.py` | working | STT: Sarvam→Azure; TTS: Sarvam only (Azure bad for Indic langs) |
| Sarvam STT/TTS providers | `app/providers/sarvam_voice.py` | working | Primary voice provider |
| Azure STT fallback | `app/providers/azure_voice.py` | working | Fallback STT only |
| Embeddings (Jina primary, Gemini fallback) | `app/providers/embeddings.py` | working | Jina v3 768d, task-typed (`retrieval.query` / `retrieval.passage`) |
| Jina reranker | `app/providers/reranker.py` | working | Wired in StaticRAGService but **disabled** (`RERANKER_ENABLED=false`) |
| Gemini LLM provider (fallback) | `app/providers/gemini_llm.py` | working | `_classify_error()` for structured error classification; tiered model fallback |
| Groq LLM provider (primary) | `app/providers/groq_llm.py` | working | Primary=`openai/gpt-oss-120b`, Fallback=`qwen/qwen3.8-27b`; key rotation + `_classify_error()` |
| Sarvam chat provider | `app/providers/sarvam_chat.py` | working | |
| Web discovery (Tavily / Firecrawl) | `app/web_rag/service.py` | working | |
| Query classifier (web RAG) | `app/web_rag/query_classifier.py` | working | Domain, jurisdiction, state classification for web queries |
| Source verifier | `app/security/source_verifier.py` | working | Trust-score based filtering in web RAG |
| Next.js frontend (PWA) | `frontend/` | working | Next.js 16, React 19, Tailwind v4, GSAP |
| Frontend pages | `frontend/src/app/` | working | `/` (home), `/chat`, `/grievance`, `/schemes`, `/services`, `/library`, `/faq`, `/legal` |
| Frontend i18n (6 languages) | `frontend/src/lib/i18n/` | working | EN, HI, GU, MR, BN, TA; includes field label translations (45 keys per locale) for grievance card rendering |
| ChatWindow (streaming SSE) | `frontend/src/components/ChatWindow.tsx` | working | Handles `thinking/token/metadata/done` SSE events, voice recording, citation display |
| Evidence Panel | `frontend/src/components/chat/MessageBubble.tsx` | working | Unified `EvidencePanel` + `EvidenceCard` components; `data-evidence="true"` attribute; citation tags with `aria-expanded`/`aria-label`; keyboard-focusable; scroll-into-view on expand |
| Document ingestion pipeline | `backend/seed_parser.py`, `backend/ingest_seed.py` | working | Parses MinerU `content_list_v2.json` → JSONL → embeds → Supabase |
| Database schema | `backend/schema.sql` | working | `documents`, `chunks` (vector 768d, HNSW), `sessions`, `grievance_states` |

---

## Provider status

| Provider | Status | Role |
|---|---|---|
| Groq | configured | Primary LLM (key rotation supported) |
| Gemini | configured | Fallback LLM + Gemini reranker in WebRAGService + grievance model |
| Jina | configured | Primary embeddings (jina-embeddings-v3, 768d) |
| Supabase | configured | Postgres + pgvector (HNSW cosine), sessions, grievance_states |
| Sarvam AI | configured | Primary STT, TTS, translation (key rotation supported) |
| Tavily | configured | Primary web search |
| Firecrawl | configured | Web crawl / scrape fallback |
| Azure Cognitive Services | configured | Fallback STT only (TTS deliberately excluded — bad Indic output) |
| Bhashini / ULCA | stubbed | `bhashini_stub.py` present, not wired |
| Render | configured | Backend hosting (`render.yaml`) |

---

## Known issues / caveats

- **Reranker disabled**: `RERANKER_ENABLED=false` in config. When enabled, Recall@1 drops 0.85→0.50. Keep off.
- **Agriculture corpus missing**: `agriculture` domain routes to `out_of_scope` — no docs ingested, not a bug.
- **Gold eval set is retriever-anchored**: Recall metrics are optimistic (measures if retriever surfaces its own best-matching chunk, not true answer span). Manual curation needed for production eval.
- **Supabase free-tier pausing**: May pause after inactivity. Reactivate before demos.
- **Dead Groq model**: `llama-3.3-70b-versatile` is DEAD on Groq (HTTP 404). Use `openai/gpt-oss-120b` (primary) and `qwen/qwen3.8-27b` (fallback) only.
- **MoC_Young_Professionals_YPs.pdf**: Scanned/image-based PDF processed via EasyOCR + pymupdf. OCR text is lower quality than MinerU extraction. 213 chunks embedded (611 raw from OCR).
- **Pre-existing test failures (backend)**: ~4 tests fail in `test_chat_route_refactored.py` due to `_has_active_grievance()` hitting unmocked Supabase `grievance_states` endpoint (not related to routing or localization bugs). Down from ~40 after routing fixes.
- **Pre-existing test failures (frontend)**: 7 tests (4 ChatWindow sendChat mock, 1 LOCALES expectation, 1 Gujarati missing key, 1 read-aloud button test).
- **PDF endpoint**: Regex allows `A-Za-z0-9_\-\.(), ` for filenames. Path traversal blocked. Non-PDF extensions rejected.
- **`chunks.source_file` column**: Does NOT exist in live Supabase DB. `source_file` is stored in `chunks.metadata` JSONB instead.

---

## Corpus

All ingested from `corpus/seeds/json_files/*_content_list_v2.json`
via `backend/seed_parser.py` → `backend/ingest_seed.py`. Embeddings: Jina v3 768d.

| Domain | Chunks embedded | Source |
|---|---|---|
| pacs_governance | 1294 | Model Byelaws (337) + HR Policy V21 (601) + MoC YPs (213) + CSM Scheme (43) |
| pacs_computerization | 214 | Revised Scheme guidelines (192) + Corrigendum (22) |
| pmfby | 1266 | operational_guidelines_pmfby |
| financial_inclusion | 2004 | NSFI_2025_30 (371) + RBI FAME (579) + RBI BE(A)WARE (429) + IRDAI Insurance (725) |

**Total: 11 documents, 4778 embedded chunks, 768d Jina v3**

### PDF provenance chain

```
PDF (corpus/seeds/*.pdf)
  -> pypdf extraction -> corpus/seeds/chunks_jsonl/*.jsonl (source_file per chunk)
    -> ingest_seed.py (DOC_META -> Supabase documents + chunks.metadata)
      -> StaticRAGService -> EvidenceChunk.metadata["source_file"]
        -> _build_citations() -> citation["source_file"]
          -> Frontend EvidenceCard -> /api/documents/pdf/{source_file}#page={page}
```

---

## Flagship demos

1. **Hindi PMFBY voice query** — Audio → Sarvam STT → RAGOrchestrator → Sarvam TTS audio response
2. **Cooperative/PACS state-filtered question** — `state="gujarat"` filtered in `static_rag.py` pgvector queries
3. **Grievance intake + status lookup** — Multi-turn intake → entity extraction → prototype reference (`DEMO-PACS-xxxxx`) → status lookup guidance; supports 6 languages via clean input/output translation boundary
