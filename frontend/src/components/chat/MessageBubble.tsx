"use client";
import { useState, useMemo, useRef, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { ChatResponse } from "@/lib/api";
import { useI18n } from "@/lib/i18n/provider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import {
  IconSpeaker,
  IconDoc,
  IconChevronRight,
  IconCopy,
  IconCheck,
  IconThumbsUp,
  IconThumbsDown,
} from "@/components/ui/Icons";
import { deco } from "@/lib/data/deco";
import { createSpeechService, speakSegments } from "@/lib/speech";
import { EvidenceBand } from "@/components/EvidenceBand";
import { evidenceBand } from "@/lib/band";
import { GrievanceCard } from "./GrievanceCard";
import { GrievanceFlow } from "./GrievanceFlow";

type Citation = ChatResponse["citations"][number];

// ── Citation chunk-tag pattern ────────────────────────────────────────────────
const CHUNK_TAG_RE = /\[chunk:([^\]]+)\]/gi;

/**
 * Split answer text into alternating text / citation-tag segments.
 * Returns [{ type: "text", value }, { type: "cite", id, raw }]
 */
function parseAnswerSegments(
  answer: string,
): Array<{ type: "text"; value: string } | { type: "cite"; id: string; raw: string }> {
  const segments: Array<{ type: "text"; value: string } | { type: "cite"; id: string; raw: string }> = [];
  let lastIndex = 0;
  for (const m of answer.matchAll(CHUNK_TAG_RE)) {
    if (m.index! > lastIndex) {
      segments.push({ type: "text", value: answer.slice(lastIndex, m.index) });
    }
    segments.push({ type: "cite", id: m[1].toLowerCase(), raw: m[0] });
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < answer.length) {
    segments.push({ type: "text", value: answer.slice(lastIndex) });
  }
  return segments;
}

/**
 * Build a chunk_id → citation lookup.  Uses exact match first, then
 * prefix match (for the 8-char short IDs the backend returns).
 */
function buildCitationMap(citations: Citation[]): Map<string, Citation> {
  const map = new Map<string, Citation>();
  for (const c of citations) {
    if (c.chunk_id) map.set(c.chunk_id.toLowerCase(), c);
  }
  return map;
}

function resolveCitation(
  id: string,
  citationMap: Map<string, Citation>,
): Citation | undefined {
  // 1. Exact match (the common case — backend returns 8-char short_id)
  const exact = citationMap.get(id);
  if (exact) return exact;
  // 2. Prefix match — the tag id may be longer or shorter than the stored key
  for (const [key, cit] of citationMap) {
    if (key.startsWith(id) || id.startsWith(key)) return cit;
  }
  return undefined;
}

// ── Evidence Card (individual expandable evidence within the panel) ────────────
function EvidenceCard({
  citation,
  isHighlighted,
  isExpanded,
  onToggle,
}: {
  citation: Citation;
  isHighlighted: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const isWeb = citation.source === "web";
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isHighlighted]);

  return (
    <div
      ref={cardRef}
      id={citation.chunk_id ? `evidence-${citation.chunk_id}` : undefined}
      className={`rounded-[var(--radius-md)] border transition-all duration-200 ${
        isHighlighted
          ? "border-[var(--accent-legal)] bg-[var(--surface-elevated)] shadow-[var(--shadow-sm)]"
          : "border-[var(--border-soft)] bg-[var(--canvas)]"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        {/* Document icon */}
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded ${
          isWeb ? "bg-[var(--accent-legal)]/10 text-[var(--accent-legal)]" : "bg-[var(--accent-agriculture)]/10 text-[var(--accent-agriculture)]"
        }`}>
          <IconDoc className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          {/* Source type label */}
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            {isWeb ? t("chat.viewSource") : t("chat.viewDocument")}
          </p>

          {/* Document title */}
          <p className="text-sm font-semibold leading-snug text-[var(--ink)] line-clamp-2">
            {citation.title}
          </p>

          {/* Metadata row: page · section */}
          {(citation.page || citation.section) && (
            <p className="text-xs text-[var(--text-tertiary)]">
              {citation.page && <span>Page {citation.page}</span>}
              {citation.page && citation.section && <span className="mx-1.5">·</span>}
              {citation.section && <span>Section {citation.section}</span>}
            </p>
          )}
        </div>

        <IconChevronRight
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Excerpt */}
          {citation.content && (
            <div className="rounded-[var(--radius-sm)] border border-[var(--border-soft)] bg-[var(--cream)] p-3 text-xs leading-relaxed text-[var(--ink)] whitespace-pre-wrap max-h-64 overflow-y-auto">
              {citation.content}
            </div>
          )}

          {/* View action */}
          <div className="flex items-center gap-3">
            {isWeb && citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-legal)] transition-colors hover:text-[var(--accent-primary)]"
              >
                {t("chat.viewSource")}
                <span className="text-[10px]">↗</span>
              </a>
            )}
            {!isWeb && citation.source_file && (
              <a
                href={`/api/documents/pdf/${encodeURIComponent(citation.source_file)}${citation.page ? `#page=${citation.page}` : ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-legal)] transition-colors hover:text-[var(--accent-primary)]"
              >
                {t("chat.viewDocument")}
                <span className="text-[10px]">↗</span>
              </a>
            )}
            {!isWeb && !citation.source_file && citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-legal)] transition-colors hover:text-[var(--accent-primary)]"
              >
                {t("chat.viewDocument")}
                <span className="text-[10px]">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Evidence Panel (unified panel showing all citations) ──────────────────────
function EvidencePanel({
  citations,
  expandedChunkId,
  onToggleChunk,
  onClose,
}: {
  citations: Citation[];
  expandedChunkId: string | null;
  onToggleChunk: (chunkId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-evidence="true"
      className="mt-3 rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] overflow-hidden"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] bg-[var(--cream)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <IconDoc className="h-4 w-4 text-[var(--accent-legal)]" />
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            {t("chat.sourcesReferences")}
          </p>
          <span className="rounded-full bg-[var(--accent-legal)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent-legal)]">
            {citations.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--text-tertiary)] hover:text-[var(--ink)] text-xs transition-colors rounded-[var(--radius-sm)] px-1.5 py-0.5 hover:bg-[var(--cream-2)]"
          aria-label="Close evidence panel"
        >
          ✕
        </button>
      </div>

      {/* Source cards */}
      <div className="p-2.5 space-y-2">
        {citations.map((c, i) => (
          <EvidenceCard
            key={c.chunk_id || i}
            citation={c}
            isHighlighted={expandedChunkId === c.chunk_id}
            isExpanded={expandedChunkId === c.chunk_id}
            onToggle={() => onToggleChunk(c.chunk_id || `idx-${i}`)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Clickable Citation Tag ────────────────────────────────────────────────────
function CitationTag({
  id,
  citationMap,
  isExpanded,
  onToggle,
}: {
  id: string;
  citationMap: Map<string, Citation>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const citation = resolveCitation(id, citationMap);
  if (!citation) {
    // Unknown ID — render as inert text
    return (
      <span
        className="inline-flex items-center rounded bg-[var(--cream)] px-1 py-0.5 text-[10px] font-mono text-[var(--text-faint)] border border-[var(--border-soft)]"
        aria-label={`Unknown citation: ${id}`}
      >
        [{id}]
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`Evidence for citation ${id}`}
        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold transition-all ${
          citation.source === "web"
            ? "bg-[var(--accent-legal)]/8 text-[var(--accent-legal)] hover:bg-[var(--accent-legal)]/15"
            : "bg-[var(--accent-agriculture)]/8 text-[var(--accent-agriculture)] hover:bg-[var(--accent-agriculture)]/15"
        } ${isExpanded ? "ring-1 ring-current shadow-[var(--shadow-sm)]" : ""}`}
      >
        <IconDoc className="h-2.5 w-2.5" />
        {id}
      </button>
    </span>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
export function cleanMarkdownForDisplay(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // Remove internal chunk citation tags (e.g. [chunk:123], (chunk:123))
  cleaned = cleaned.replace(/\[chunk:[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\(chunk:[^\)]*\)/gi, "");

  // Fix escaped asterisks (\*\* -> **)
  cleaned = cleaned.replace(/\\\*/g, "*");

  // Format bullet points: replace inline bullets (•) with newlines and markdown dash (- )
  cleaned = cleaned.replace(/([^\n])\s*•\s*/g, "$1\n- ");
  cleaned = cleaned.replace(/^\s*•\s*/gm, "- ");

  // Ensure numbered list items on inline text get proper linebreaks
  cleaned = cleaned.replace(/([^\n])\s*(\d+\.)\s+/g, "$1\n$2 ");

  // Preserve double newlines for paragraph breaks, remove excess newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  return cleaned.trim();
}

export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  let cleaned = text;

  // Remove chunk citations
  cleaned = cleaned.replace(/\[chunk:[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\(chunk:[^\)]*\)/gi, "");

  // Remove markdown headers
  cleaned = cleaned.replace(/^#+\s+/gm, "");

  // Convert bullet points to sentence endings
  cleaned = cleaned.replace(/^[\s]*[-*+•]\s+/gm, ". ");
  cleaned = cleaned.replace(/([^\n])\s*•\s*/g, "$1. ");

  // Strip markdown formatting symbols
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");
  cleaned = cleaned.replace(/\\\*/g, "");

  // Replace newlines with sentence breaks
  cleaned = cleaned.replace(/\n+/g, ". ");

  // Normalize duplicate spaces and periods
  cleaned = cleaned.replace(/\.\s*\./g, ".");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

export function MessageBubble({ resp, isStreaming = false, onSendMessage, onGrievanceFinalized, isActive = false }: { resp: ChatResponse; isStreaming?: boolean; onSendMessage?: (message: string) => void; onGrievanceFinalized?: (finalizedResponse: ChatResponse) => void; isActive?: boolean }) {
  const { t } = useI18n();
  const speech = useMemo(() => createSpeechService(), []);
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [evidencePanelOpen, setEvidencePanelOpen] = useState(false);

  const segments = resp.speech_segments ?? [];
  const hasSegments = segments.length > 0;
  const domainKey = `domain.${resp.domain}`;
  const domainLabel = t(domainKey).startsWith("domain.") ? resp.domain : t(domainKey);

  // Build citation lookup map (memoised per response)
  const citationMap = useMemo(() => buildCitationMap(resp.citations), [resp.citations]);

  // Parse answer into text + citation segments
  const answerSegments = useMemo(
    () => parseAnswerSegments(resp.answer),
    [resp.answer],
  );

  // The `grievance` object is attached from the very first turn of the
  // workflow (classification confirmation onward) and fills in
  // progressively — it is NOT itself a signal that the draft is done.
  // `grievance.submission` is only populated once a submission route has
  // been resolved, which happens exactly on the turn that completes the
  // draft. That's the single authoritative moment to show ONE structured
  // GrievanceCard instead of the normal follow-up-question prose — using
  // mere `grievance` presence here would suppress the actual follow-up
  // questions ("What is your ward number?") on every earlier turn.
  const isGrievanceComplete =
    resp.mode === "grievance" && !!resp.grievance && !!resp.grievance.submission;

  // Check if we have structured grievance data for the new UI flow.
  // The LATEST (active) grievance-stage message renders the live,
  // interactive wizard. Any earlier grievance-stage message renders the
  // SAME structured table/panel UI, but permanently read-only -- it must
  // stay visible as a table, not collapse into plain-text prose (the old
  // free-text grievance output has been removed entirely).
  const hasStructuredGrievance =
    resp.mode === "grievance" &&
    !!resp.grievance_stage &&
    resp.grievance_stage !== "complete" &&
    !!onSendMessage;

  async function handleSpeak() {
    if (speaking) {
      speech.stopSpeaking();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    try {
      if (hasSegments) {
        await speakSegments(segments);
      } else {
        const cleanText = cleanTextForSpeech(resp.answer);
        await speech.speak(cleanText, resp.language);
      }
    } finally {
      setSpeaking(false);
    }
  }

  function handleCopy() {
    const cleanText = cleanMarkdownForDisplay(resp.answer);
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (resp.abstained) {
    return (
      <div className="group flex gap-3 text-sm sm:text-base leading-relaxed text-[var(--ink)]">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge deco={deco(resp.domain)}>{domainLabel}</Badge>
            </div>
          </div>
          <Alert tone="warn">
            <div className="space-y-1">
              <p className="font-semibold">{t("abstained.title")}</p>
              <p className="text-xs opacity-80">{t("abstained.description")}</p>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3 text-sm sm:text-base leading-relaxed text-[var(--ink)]">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge deco={deco(resp.domain)}>{domainLabel}</Badge>
            {resp.mode && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-semibold ${
                  resp.mode === "web"
                    ? "bg-[var(--accent-legal)]/10 text-[var(--accent-legal)]"
                    : resp.mode === "grievance"
                      ? "bg-[var(--accent-grievance)]/10 text-[var(--accent-grievance)]"
                      : "bg-[var(--cream)] text-[var(--text-tertiary)]"
                }`}
              >
                {resp.mode === "web" ? t("chat.mode.webSearch") : resp.mode === "grievance" ? t("chat.mode.grievance") : t("chat.mode.staticRag")}
              </span>
            )}
            <EvidenceBand confidence={resp.confidence} label={t(`evidence.${evidenceBand(resp.confidence)}`)} />
          </div>
          <span className="text-[11px] sm:text-xs text-[var(--text-faint)]">{(resp.confidence * 100).toFixed(0)}% match</span>
        </div>

        {/* Structured grievance object present -> this turn IS the
            grievance-complete event. Show one short localized
            confirmation instead of the full prose draft, then the
            single authoritative GrievanceCard below. `resp.answer`
            still holds the full text (used for copy/speech) but is
            not duplicated visually here — see Task 1 in the grievance
            productization notes: the frontend must render ONE
            authoritative grievance experience, never the full-text
            draft followed by the same draft again in the card. */}
        {isGrievanceComplete ? (
          <p className="font-answer text-sm sm:text-base leading-relaxed text-[var(--ink)]">
            {t("grievanceCard.confirmation")}
          </p>
        ) : hasStructuredGrievance ? (
          /* Structured grievance flow - render interactive UI */
          <GrievanceFlow response={resp} onSendMessage={onSendMessage!} onGrievanceFinalized={onGrievanceFinalized} readOnly={!isActive} />
        ) : (
          /* Answer Content — with inline citation tags */
          <div className={`font-answer text-sm sm:text-base leading-relaxed text-[var(--ink)] prose prose-sm max-w-none prose-headings:font-semibold prose-headings:text-[var(--ink)] prose-p:my-2 prose-p:leading-relaxed prose-ul:my-2.5 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-2.5 prose-ol:list-decimal prose-ol:pl-5 prose-li:my-1 prose-strong:font-semibold prose-strong:text-[var(--ink)] prose-table:text-xs prose-th:font-semibold prose-td:py-1 prose-th:py-1 prose-pre:bg-[var(--dark)] prose-pre:text-[var(--on-dark-strong)] prose-code:text-[var(--accent-primary)] ${isStreaming ? "streaming-text" : ""}`}>
            {answerSegments.map((seg, i) => {
              if (seg.type === "text") {
                return (
                  <Markdown
                    key={i}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <p className="mb-2.5 leading-relaxed text-[var(--ink)]">{children}</p>,
                      ul: ({ children }) => <ul className="my-2.5 list-disc pl-5 space-y-1 text-[var(--ink)]">{children}</ul>,
                      ol: ({ children }) => <ol className="my-2.5 list-decimal pl-5 space-y-1 text-[var(--ink)]">{children}</ol>,
                      li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
                      h1: ({ children }) => <h1 className="text-lg font-bold my-2 text-[var(--ink)]">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold my-2 text-[var(--ink)]">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold my-1.5 text-[var(--ink)]">{children}</h3>,
                    }}
                  >
                    {cleanMarkdownForDisplay(seg.value)}
                  </Markdown>
                );
              }
              // Citation tag — clickable
              return (
                <span key={i} className="inline-block align-middle mx-0.5">
                  <CitationTag
                    id={seg.id}
                    citationMap={citationMap}
                    isExpanded={expandedChunkId === seg.id}
                    onToggle={() => {
                      setEvidencePanelOpen(true);
                      setExpandedChunkId((prev) => (prev === seg.id ? null : seg.id));
                    }}
                  />
                </span>
              );
            })}
          </div>
        )}

        {/* Structured grievance summary — reads only the canonical
            `grievance` object, never the prose answer, so it renders
            identically regardless of the user's language. */}
        {isGrievanceComplete && (
          <GrievanceCard grievance={resp.grievance!} />
        )}

        {/* Grounded indicator — when citations exist */}
        {resp.citations.length > 0 && !evidencePanelOpen && (
          <div className="flex items-center gap-2 py-1">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent-legal)]/10">
              <svg className="h-2.5 w-2.5 text-[var(--accent-legal)]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6l3 3 5-5" />
              </svg>
            </span>
            <span className="text-xs font-medium text-[var(--accent-legal)]">
              {t("chat.grounded")}
            </span>
          </div>
        )}

        {/* Unified Evidence Panel */}
        {evidencePanelOpen && resp.citations.length > 0 && (
          <EvidencePanel
            citations={resp.citations}
            expandedChunkId={expandedChunkId}
            onToggleChunk={(chunkId) =>
              setExpandedChunkId((prev) => (prev === chunkId ? null : chunkId))
            }
            onClose={() => {
              setEvidencePanelOpen(false);
              setExpandedChunkId(null);
            }}
          />
        )}

        {isStreaming && (
          <style jsx>{`
            .streaming-text :global(p:last-child)::after {
              content: "▊";
              animation: blink 0.8s step-end infinite;
              color: var(--accent-primary);
              font-weight: normal;
            }
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
          `}</style>
        )}

        {resp.domain === "schemes" && (
          <div className="mt-3">
            <Link href="/schemes">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-cta)] border border-[var(--accent-primary)]/40 bg-[var(--cream)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent-primary)] hover:bg-[var(--cream-2)]"
              >
                {t("chat.exploreSchemes")}
                <IconChevronRight className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              </button>
            </Link>
          </div>
        )}

        {/* Actions Footer */}
        <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-faint)]">
          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t("chat.copied") : t("chat.copyResponse")}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
          >
            {copied ? <IconCheck className="h-3.5 w-3.5 text-[var(--state-success)]" /> : <IconCopy className="h-3.5 w-3.5" />}
          </button>

          {/* Read Aloud Button */}
          <button
            type="button"
            onClick={handleSpeak}
            title={speaking ? t("common.stopReadAloud") : t("common.readAloud")}
            className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)] ${
              speaking ? "text-[var(--accent-primary)] bg-[var(--accent-tint-soft)]" : "text-[var(--text-tertiary)]"
            }`}
          >
            <IconSpeaker className={`h-3.5 w-3.5 ${speaking ? "animate-pulse" : ""}`} />
          </button>

          {/* Thumbs Up Button */}
          <button
            type="button"
            onClick={() => setRating((r) => (r === "up" ? null : "up"))}
            title={t("chat.goodResponse")}
            className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)] ${
              rating === "up" ? "text-[var(--state-success)] bg-[var(--cream-2)]" : "text-[var(--text-tertiary)]"
            }`}
          >
            <IconThumbsUp className="h-3.5 w-3.5" />
          </button>

          {/* Thumbs Down Button */}
          <button
            type="button"
            onClick={() => setRating((r) => (r === "down" ? null : "down"))}
            title={t("chat.badResponse")}
            className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)] ${
              rating === "down" ? "text-[var(--state-error)] bg-[var(--cream-2)]" : "text-[var(--text-tertiary)]"
            }`}
          >
            <IconThumbsDown className="h-3.5 w-3.5" />
          </button>

          {/* Citations Trigger Button */}
          {resp.citations.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setEvidencePanelOpen((o) => !o);
                setExpandedChunkId(null);
              }}
              aria-expanded={evidencePanelOpen}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs font-semibold transition-all ${
                evidencePanelOpen
                  ? "border-[var(--accent-legal)]/30 bg-[var(--accent-legal)]/5 text-[var(--accent-legal)]"
                  : "border-[var(--border-soft)] bg-[var(--cream)] text-[var(--text-body)] hover:border-[var(--accent-legal)]/30 hover:text-[var(--accent-legal)]"
              }`}
            >
              <IconDoc className="h-3.5 w-3.5" />
              <span>{resp.citations.length} {t("common.source")}</span>
              <IconChevronRight className={`h-3 w-3 transition-transform duration-200 ${evidencePanelOpen ? "rotate-90" : ""}`} />
            </button>
          )}
        </div>

        {/* Evidence Panel replaces the legacy sources list */}
      </div>
    </div>
  );
}
