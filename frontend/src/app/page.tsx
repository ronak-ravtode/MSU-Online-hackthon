"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { IconChat, IconMic, IconDoc, IconChevronRight } from "@/components/ui/Icons";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import Link from "next/link";
import { schemes as rawSchemes } from "@/lib/data";
import { services as rawServices } from "@/lib/data";
import { libraryDocs as rawLibraryDocs } from "@/lib/data";

const CAPABILITIES = [
  {
    num: "01",
    accent: "#526B58",
    titleKey: "landing.capCropInsurance",
    textKey: "landing.capCropInsuranceText",
    href: "/schemes",
    icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6",
    deco: "M2 17 Q12 10 22 17",
  },
  {
    num: "02",
    accent: "#27364A",
    titleKey: "landing.capCoopLaw",
    textKey: "landing.capCoopLawText",
    href: "/legal",
    icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
    deco: "M4 4 L12 2 L20 4 L20 20 L12 18 L4 20 Z",
  },
  {
    num: "03",
    accent: "#C65D2E",
    titleKey: "landing.capPacs",
    textKey: "landing.capPacsText",
    href: "/services",
    icon: "M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    deco: "M6 12 A6 6 0 0 1 18 12 A6 6 0 0 1 6 12",
  },
  {
    num: "04",
    accent: "#27364A",
    titleKey: "landing.capFinancial",
    textKey: "landing.capFinancialText",
    href: "/schemes",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    deco: "M3 3 L21 3 M3 9 L21 9 M3 15 L21 15 M3 21 L21 21",
  },
  {
    num: "05",
    accent: "#C65D2E",
    titleKey: "landing.capGrievance",
    textKey: "landing.capGrievanceText",
    href: "/grievance",
    icon: "M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    deco: "M4 12 L12 4 L20 12 M12 4 L12 20",
  },
];

const HOW_STEPS = [
  { num: "01", titleKey: "landing.howStep1", textKey: "landing.howStep1Text" },
  { num: "02", titleKey: "landing.howStep2", textKey: "landing.howStep2Text" },
  { num: "03", titleKey: "landing.howStep3", textKey: "landing.howStep3Text" },
  { num: "04", titleKey: "landing.howStep4", textKey: "landing.howStep4Text" },
];

const WHY = [
  {
    num: "01",
    titleKey: "landing.whyMulti",
    textKey: "landing.whyMultiText",
    accent: "#C65D2E",
    icon: "M3 5h18M3 12h18M3 19h18",
    deco: "M12 2 A10 10 0 0 1 12 22 A10 10 0 0 1 12 2 M12 2 C8 6 8 18 12 22 M12 2 C16 6 16 18 12 22",
  },
  {
    num: "02",
    titleKey: "landing.whyVoice",
    textKey: "landing.whyVoiceText",
    accent: "#C65D2E",
    icon: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z",
    deco: "M4 12 Q8 8 12 12 Q16 16 20 12",
  },
  {
    num: "03",
    titleKey: "landing.whyEvidence",
    textKey: "landing.whyEvidenceText",
    accent: "#27364A",
    icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    deco: "M6 4 L18 4 L18 20 L6 20 Z M9 8 L15 8 M9 12 L15 12 M9 16 L12 16",
  },
  {
    num: "04",
    titleKey: "landing.whyCitizen",
    textKey: "landing.whyCitizenText",
    accent: "#526B58",
    icon: "M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
    deco: "M4 12 A8 8 0 0 1 12 4 A8 8 0 0 1 20 12 A8 8 0 0 1 12 20 A8 8 0 0 1 4 12",
  },
];

const LANGUAGES = ["English", "हिंदी", "ગુજરાતી", "मराठी", "বাংলা", "தமிழ்"];

const STARTERS = ["chat.starter1", "chat.starter2", "chat.starter3", "chat.starter4"];

export default function HomePage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [ask, setAsk] = useState("");

  const wordmark = t("landing.tagline");

  const stats = [
    { n: rawSchemes.length, label: t("nav.schemes"), textKey: "landing.deskSchemes" },
    { n: rawServices.length, label: t("nav.services"), textKey: "landing.deskServices" },
    { n: rawLibraryDocs.length, label: t("nav.library"), textKey: "landing.deskDocs" },
  ];

  function submitAsk() {
    const q = ask.trim();
    if (!q) return;
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="rail-frame page-container">
      {/* ==================== HERO ==================== */}
      <section className="relative flex flex-col gap-10 pt-0 pb-12 md:pb-16 lg:flex-row lg:items-center lg:gap-16">
        {/* Background pattern */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-[var(--accent-primary)]/[0.03] blur-3xl" />
          <div className="absolute -left-32 bottom-0 w-80 h-80 rounded-full bg-[var(--accent-cooperative)]/[0.04] blur-3xl" />
          <svg className="absolute right-0 top-1/2 -translate-y-1/2 w-64 h-64 opacity-[0.04]" viewBox="0 0 200 200" fill="none">
            <path d="M100 0L200 100L100 200L0 100Z" stroke="currentColor" strokeWidth="0.5" className="text-[var(--accent-primary)]" />
            <path d="M100 20L180 100L100 180L20 100Z" stroke="currentColor" strokeWidth="0.5" className="text-[var(--accent-primary)]" />
            <path d="M100 40L160 100L100 160L40 100Z" stroke="currentColor" strokeWidth="0.5" className="text-[var(--accent-primary)]" />
            <circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="0.3" className="text-[var(--accent-primary)]" />
          </svg>
        </div>

        {/* Left: Content */}
        <Reveal trigger="load" className="relative flex max-w-2xl flex-col items-start">
          <p className="eyebrow">{t("landing.badge")}</p>
          <h1 className="display mt-6 text-4xl leading-[1.08] tracking-tight text-[var(--ink)] sm:text-5xl md:text-[56px]">
            {wordmark}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--text-body)] sm:text-lg">
            {t("landing.f1text")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/chat">
              <Button size="lg">
                {t("landing.ctaChat")}
                <IconChevronRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/schemes">
              <Button size="lg" variant="secondary">
                {t("landing.ctaSchemes")}
              </Button>
            </Link>
          </div>
        </Reveal>

        {/* Right: AI Visual Panel */}
        <Reveal trigger="load" delay={0.1} className="relative lg:flex-1">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-lg)]">
            {/* Panel header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--dark)] text-[var(--on-dark-strong)]">
                <IconChat className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--ink)]">SAHAKARITA AI</p>
                <p className="text-[10px] text-[var(--text-faint)]">Civic Assistance Desk</p>
              </div>
            </div>

            {/* Quick input */}
            <div className="flex items-center gap-3 rounded-[var(--radius-cta)] border border-[var(--border-default)] bg-[var(--cream)] px-4 py-3">
              <input
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAsk()}
                placeholder={t("chat.placeholder")}
                aria-label={t("chat.placeholder")}
                className="w-full flex-1 bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--text-faint)] focus:outline-none"
              />
              <Button onClick={submitAsk} disabled={!ask.trim()} className="shrink-0">
                {t("common.send")}
              </Button>
            </div>

            {/* Process flow */}
            <div className="mt-5 space-y-2">
              {[
                { icon: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z", label: "Find relevant information" },
                { icon: "M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", label: "Grounded in official sources" },
                { icon: "M5 13l4 4L19 7", label: "Clear, evidence-backed guidance" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--cream)] px-3 py-2">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[var(--accent-primary)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={step.icon} />
                  </svg>
                  <span className="text-xs text-[var(--text-body)]">{step.label}</span>
                </div>
              ))}
            </div>

            {/* Trust indicators */}
            <div className="mt-4 flex items-center gap-4 text-[10px] text-[var(--text-faint)]">
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                Evidence-backed
              </span>
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l2.5 1.5" /></svg>
                Multilingual
              </span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ==================== CAPABILITIES ==================== */}
      <section className="px-4 py-14 md:px-6 md:py-20">
        <Reveal>
          <p className="eyebrow">{t("landing.capabilitiesTitle")}</p>
          <h2 className="display mt-3 max-w-2xl text-3xl tracking-tight text-[var(--ink)] sm:text-4xl md:text-[42px] leading-[1.1]">{t("landing.capabilitiesSubtitle")}</h2>
        </Reveal>

        {/* 3 + 2 grid layout */}
        <div className="mt-10 space-y-3">
          {/* Row 1: 3 cards */}
          <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.slice(0, 3).map((c) => (
              <Link
                key={c.num}
                href={c.href}
                className="group relative flex flex-col rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-5 transition-all duration-[200ms] ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] overflow-hidden"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-0 h-[2px] w-full rounded-t-[var(--radius-md)]" style={{ backgroundColor: c.accent }} />

                {/* Decorative geometry */}
                <svg className="absolute bottom-2 right-2 w-16 h-16 opacity-[0.04] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" style={{ color: c.accent }}>
                  <path d={c.deco} />
                </svg>

                {/* Header: icon + number */}
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ backgroundColor: `${c.accent}10` }}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: c.accent }}>
                      <path d={c.icon} />
                    </svg>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-faint)]">{c.num}</span>
                </div>

                {/* Category label */}
                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: c.accent }}>
                  {t(c.titleKey)}
                </p>

                {/* Description */}
                <p className="mt-2 text-[15px] text-[var(--text-body)] leading-relaxed">
                  {t(c.textKey)}
                </p>

                {/* Explore action */}
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--text-faint)] group-hover:text-[var(--accent-primary)] transition-colors pt-3 border-t border-[var(--border-soft)]">
                  <span>Explore</span>
                  <IconChevronRight className="h-3 w-3 transition-transform duration-[200ms] group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </Stagger>

          {/* Row 2: 2 cards */}
          <Stagger className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.slice(3, 5).map((c) => (
              <Link
                key={c.num}
                href={c.href}
                className="group relative flex flex-col rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-5 transition-all duration-[200ms] ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] overflow-hidden"
              >
                {/* Top accent line */}
                <div className="absolute top-0 left-0 h-[2px] w-full rounded-t-[var(--radius-md)]" style={{ backgroundColor: c.accent }} />

                {/* Decorative geometry */}
                <svg className="absolute bottom-2 right-2 w-16 h-16 opacity-[0.04] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5" style={{ color: c.accent }}>
                  <path d={c.deco} />
                </svg>

                {/* Header: icon + number */}
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ backgroundColor: `${c.accent}10` }}>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: c.accent }}>
                      <path d={c.icon} />
                    </svg>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--text-faint)]">{c.num}</span>
                </div>

                {/* Category label */}
                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: c.accent }}>
                  {t(c.titleKey)}
                </p>

                {/* Description */}
                <p className="mt-2 text-[15px] text-[var(--text-body)] leading-relaxed">
                  {t(c.textKey)}
                </p>

                {/* Explore action */}
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[var(--text-faint)] group-hover:text-[var(--accent-primary)] transition-colors pt-3 border-t border-[var(--border-soft)]">
                  <span>Explore</span>
                  <IconChevronRight className="h-3 w-3 transition-transform duration-[200ms] group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ==================== ASSISTANCE DESK / METRICS ==================== */}
      <Reveal className="bg-[var(--dark)] px-4 py-12 text-[var(--on-dark-strong)] md:px-6 md:py-16 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" aria-hidden="true">
          <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="currentColor" className="text-white" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>
        </div>
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent-primary)]">{t("landing.deskTitle")}</p>
          <h2 className="display mt-3 text-2xl tracking-tight md:text-3xl">{t("landing.deskSubtitle")}</h2>
          <div className="mt-10 grid grid-cols-3 gap-6 md:gap-12">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="display text-3xl sm:text-4xl md:text-5xl">{s.n}</p>
                <p className="mt-1 text-sm font-medium text-[var(--on-dark-strong)]">{s.label}</p>
                <p className="mt-1 text-xs text-[var(--on-dark-muted)]">{t(s.textKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="px-4 py-12 md:px-6 md:py-16">
        <Reveal>
          <p className="eyebrow">{t("landing.howWorkTitle")}</p>
          <h2 className="display mt-3 text-3xl tracking-tight text-[var(--ink)] md:text-4xl">{t("landing.howWorkSubtitle")}</h2>
        </Reveal>
        <Stagger className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {HOW_STEPS.map((h, i) => (
            <div key={h.num} className="relative">
              <span className="display text-5xl text-[var(--accent-primary)]/10" aria-hidden="true">{h.num}</span>
              <h3 className="mt-3 font-medium text-[var(--ink)]">{t(h.titleKey)}</h3>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-body)]">{t(h.textKey)}</p>
              {i < HOW_STEPS.length - 1 && (
                <div className="hidden lg:block absolute top-6 -right-3 w-6 h-[1px] bg-[var(--border-soft)]" />
              )}
            </div>
          ))}
        </Stagger>
      </section>

      {/* ==================== WHY SAHAKARITA ==================== */}
      <section className="px-4 py-14 md:px-6 md:py-20">
        <Reveal>
          <p className="eyebrow">{t("landing.whyTitle")}</p>
          <h2 className="display mt-3 max-w-2xl text-3xl tracking-tight text-[var(--ink)] sm:text-4xl md:text-[42px] leading-[1.1]">
            {t("landing.whyHeadline")}
          </h2>
          <p className="mt-4 max-w-xl text-base text-[var(--text-body)] leading-relaxed sm:text-lg">
            {t("landing.whyIntro")}
          </p>
        </Reveal>

        <Stagger className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((w) => (
            <div
              key={w.titleKey}
              className="group relative flex flex-col rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] p-5 transition-all duration-[200ms] ease-[var(--ease-out-cubic)] hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] overflow-hidden"
            >
              {/* Subtle decorative geometry */}
              <svg className="absolute bottom-2 right-2 w-14 h-14 opacity-[0.04] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.4" style={{ color: w.accent }}>
                <path d={w.deco} />
              </svg>

              {/* Header: icon + number */}
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]" style={{ backgroundColor: `${w.accent}10` }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: w.accent }}>
                    <path d={w.icon} />
                  </svg>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-faint)]">{w.num}</span>
              </div>

              {/* Feature title */}
              <h3 className="mt-4 text-lg font-semibold text-[var(--ink)] sm:text-xl">
                {t(w.titleKey)}
              </h3>

              {/* Description */}
              <p className="mt-2 text-[15px] text-[var(--text-body)] leading-relaxed">
                {t(w.textKey)}
              </p>
            </div>
          ))}
        </Stagger>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <Reveal className="bg-[var(--dark)] px-4 py-16 text-center text-[var(--on-dark-strong)] md:px-6 md:py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--accent-primary)]">{t("landing.badge")}</p>
        <h2 className="display mx-auto mt-4 max-w-2xl text-3xl leading-tight tracking-tight md:text-4xl">{t("landing.finalCtaTitle")}</h2>
        <p className="mt-3 mx-auto max-w-lg text-sm text-[var(--on-dark-muted)]">{t("landing.finalCtaText")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/chat">
            <Button size="lg">
              {t("landing.startConversation")}
              <IconChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
