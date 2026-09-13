"use client";
import { useState } from "react";
import Link from "next/link";
import type { Grievance } from "@/lib/api";
import {
  IconCheck,
  IconBuilding,
  IconPin,
  IconDoc,
  IconClock,
  IconAlertTriangle,
  IconChevronRight,
} from "@/components/ui/Icons";

/**
 * Full-page English draft view.
 *
 * Reached from the "Open full English draft page" link on
 * `GrievanceCard` (only rendered when the user's language is not
 * English). Everything on this page — field labels, the description,
 * classification, submission steps, documents, timeline, and
 * disclaimer — is hard-coded English, deliberately bypassing `useI18n()`
 * so the page never mixes in the user's selected UI language, even if
 * they switch it after opening this tab.
 *
 * Data source: the `grievance.english` mirror the backend attaches
 * additively (see `_process_grievance_message` in `chat.py` and
 * `/finalize` in `grievance.py`). `GrievanceCard` stashes it in
 * `sessionStorage` right before navigating here — this page never
 * calls the API itself, so it stays purely additive and cannot
 * desync from, or re-trigger, the grievance workflow.
 */

function Divider() {
  return <div className="my-3 border-t border-[var(--border-soft)]" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">
      {children}
    </p>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-[var(--text-faint)]">{label}</span>
      <span className="text-right font-medium text-[var(--ink)]">{value}</span>
    </div>
  );
}

const STORAGE_KEY = "grievance-english-draft";

export default function EnglishGrievanceDraftPage() {
  const [grievance] = useState<Grievance | null>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Grievance) : null;
    } catch {
      return null;
    }
  });

  // No draft found (direct link visit, sessionStorage cleared, private
  // browsing, etc.) — send the citizen back rather than show a blank page.
  if (!grievance) {
    return (
      <div className="rail-frame page-container">
        <h1 className="display text-2xl tracking-tight text-[var(--ink)]">
          English draft not available
        </h1>
        <p className="mt-2 text-[var(--text-body)]">
          Open this page from the &ldquo;Open full English draft page&rdquo; link on your
          grievance card — it isn&apos;t meant to be visited directly.
        </p>
        <Link
          href="/grievance"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-primary)] underline decoration-dotted hover:opacity-80"
        >
          Back to Grievance
        </Link>
      </div>
    );
  }

  const location = grievance.location;
  const submission = grievance.submission;
  const description = grievance.description;
  const hasAnyLocation =
    !!location &&
    (location.ward_number || location.locality || location.area || location.city || location.state);

  return (
    <div className="rail-frame page-container">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="display text-2xl tracking-tight text-[var(--ink)] md:text-3xl">
          Grievance draft (English)
        </h1>
        <Link
          href="/grievance"
          className="text-sm font-medium text-[var(--accent-primary)] underline decoration-dotted hover:opacity-80"
        >
          Back
        </Link>
      </div>
      <p className="mb-6 text-sm text-[var(--text-faint)]">
        This is the full submission draft in English, independent of your selected
        display language.
      </p>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--surface-elevated)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-soft)] bg-[var(--state-success)]/8 px-4 py-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--state-success)]/15 text-[var(--state-success)]">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm font-semibold text-[var(--ink)]">Grievance draft ready</p>
        </div>

        <div className="px-4 py-3">
          <SectionLabel>Title</SectionLabel>
          <div className="flex items-start gap-2">
            <IconBuilding className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-faint)]" />
            <p className="text-sm font-semibold text-[var(--ink)]">{grievance.title}</p>
          </div>
          <div className="mt-2">
            <Field label="Reference" value={grievance.reference} />
            <Field label="Category" value={grievance.category} />
            <Field label="Sub-category" value={grievance.sub_category} />
            <Field label="Department" value={grievance.department} />
            <Field label="Jurisdiction" value={grievance.jurisdiction} />
          </div>

          {description?.normalized && (
            <>
              <Divider />
              <SectionLabel>Description</SectionLabel>
              <p className="text-sm leading-relaxed text-[var(--ink)]">
                {description.normalized}
              </p>
            </>
          )}

          {hasAnyLocation && (
            <>
              <Divider />
              <SectionLabel>
                <span className="inline-flex items-center gap-1.5">
                  <IconPin className="h-3.5 w-3.5" />
                  Location
                </span>
              </SectionLabel>
              <Field label="Ward number" value={location?.ward_number} />
              <Field label="Locality" value={location?.locality} />
              <Field label="Area" value={location?.area} />
              <Field label="City" value={location?.city} />
              <Field label="State" value={location?.state} />
            </>
          )}

          {submission && (submission.portal_name || submission.portal_url) && (
            <>
              <Divider />
              <SectionLabel>Submission</SectionLabel>
              <Field label="Portal" value={submission.portal_name} />
              {submission.portal_url && (
                <div className="flex items-start justify-between gap-3 py-1 text-sm">
                  <span className="shrink-0 text-[var(--text-faint)]">Link</span>
                  {/^https?:\/\//.test(submission.portal_url) ? (
                    <a
                      href={submission.portal_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-right font-medium text-[var(--accent-primary)] underline decoration-dotted hover:opacity-80"
                    >
                      {submission.portal_url}
                      <IconChevronRight className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="max-w-[70%] text-right text-[var(--ink)]">
                      {submission.portal_url}
                    </span>
                  )}
                </div>
              )}
              <Field label="Department" value={submission.department} />
              <Field label="Level" value={submission.level} />

              {submission.steps && submission.steps.length > 0 && (
                <>
                  <Divider />
                  <SectionLabel>Steps to submit</SectionLabel>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--ink)]">
                    {submission.steps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </>
              )}

              {submission.required_documents && submission.required_documents.length > 0 && (
                <>
                  <Divider />
                  <SectionLabel>
                    <span className="inline-flex items-center gap-1.5">
                      <IconDoc className="h-3.5 w-3.5" />
                      Required documents
                    </span>
                  </SectionLabel>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ink)]">
                    {submission.required_documents.map((doc, i) => (
                      <li key={i} className="leading-relaxed">{doc}</li>
                    ))}
                  </ul>
                </>
              )}

              {submission.estimated_timeline && (
                <>
                  <Divider />
                  <SectionLabel>
                    <span className="inline-flex items-center gap-1.5">
                      <IconClock className="h-3.5 w-3.5" />
                      Estimated timeline
                    </span>
                  </SectionLabel>
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {submission.estimated_timeline}
                  </p>
                </>
              )}

              {submission.disclaimer && (
                <>
                  <Divider />
                  <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--state-warning)]/10 px-3 py-2 text-xs text-[var(--state-warning)]">
                    <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>
                      <span className="font-semibold">Disclaimer: </span>
                      {submission.disclaimer}
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
