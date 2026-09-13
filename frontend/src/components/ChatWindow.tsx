"use client";
import { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sendChat, sendChatStream, ChatResponse, type StreamEvent } from "@/lib/api";
import { useI18n } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/i18n";
import { formatSchemeQuestion, formatServiceQuestion, formatLegalQuestion } from "@/lib/i18n/formatQuery";
import { createSpeechService } from "@/lib/speech";
import { MessageBubble } from "./chat/MessageBubble";
import { ThinkingBubble } from "./chat/ThinkingBubble";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Reveal } from "@/components/motion/Reveal";
import {
  IconMic,
  IconTrash,
  IconSparkles,
  IconSend,
  IconPlus,
  IconSidebar,
  IconClock,
  IconBot,
  IconArrowLeft,
  IconPin,
  IconSearch,
  IconEdit,
  IconShare,
  IconUser,
  IconCompass,
  IconX,
} from "@/components/ui/Icons";

type Msg = { role: "user" | "assistant"; text?: string; resp?: ChatResponse };

interface Conversation {
  id: string;
  title: string;
  messages: Msg[];
  createdAt: number;
  updatedAt?: number;
  pinned?: boolean;
}

const STORAGE_KEY = "sahakarita_conversations";
const ACTIVE_CONV_KEY = "sahakarita_active_conv";
const MODELS = ["Sahakarita-v2.5"];

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convs));
  } catch {
    // localStorage full or unavailable
  }
}

async function translate(text: string, locale: Locale): Promise<string> {
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [text], to: locale }),
    });
    if (!res.ok) return text;
    const data = (await res.json()) as { translations?: string[] };
    return data.translations?.[0] ?? text;
  } catch {
    return text;
  }
}

function fallback(lang: Locale): ChatResponse {
  return {
    answer:
      lang === "hi"
        ? "सेवा अभी उपलब्ध नहीं है।"
        : lang === "gu"
        ? "સેવા હમણાં ઉપલબ્ધ નથી."
        : lang === "mr"
        ? "सेवा सध्या उपलब्ध नाही."
        : lang === "bn"
        ? "সেবা এখন পর্যন্ত পাওয়া যাচ্ছে না।"
        : lang === "ta"
        ? "சேவை தற்போது கிடைக்கவில்லை."
        : "Service unavailable right now.",
    language: lang,
    domain: "unknown",
    intent: "unknown",
    entities: [],
    confidence: 0,
    confidence_level: "none",
    citations: [],
    abstained: true,
    follow_up_question: null,
  };
}

export function ChatWindow() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const speech = useMemo(() => createSpeechService(), []);
  const sp = useSearchParams();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [input, setInput] = useState(() => {
    const q = sp?.get("q");
    const scheme = sp?.get("scheme");
    const schemeName = sp?.get("name");
    if (q) {
      const tellMeMatch = q.match(/^Tell me about (.+?)(?: scheme)?$/i);
      const useServiceMatch = q.match(/^How do I use the (.+?) service\?$/i);
      if (tellMeMatch) return formatSchemeQuestion(tellMeMatch[1], locale);
      if (useServiceMatch) return formatServiceQuestion(useServiceMatch[1], locale);
      return q;
    }
    if (scheme) {
      if (scheme === "pmfby") return t("chat.starter1");
      return formatSchemeQuestion(schemeName || scheme.replace(/-/g, " "), locale);
    }
    return "";
  });
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [];
    if (sp?.get("q") || sp?.get("scheme")) return [];
    const convs = loadConversations();
    const savedId = localStorage.getItem(ACTIVE_CONV_KEY);
    if (savedId) {
      const conv = convs.find((c) => c.id === savedId);
      if (conv) return conv.messages;
    }
    return [];
  });
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [model, setModel] = useState(MODELS[0]);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const isDesktopViewport = useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerWidth >= 1024,
    () => false,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userHasSetSidebar, setUserHasSetSidebar] = useState(false);
  const effectiveSidebarOpen = userHasSetSidebar ? sidebarOpen : isDesktopViewport;
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    if (typeof window === "undefined") return [];
    return loadConversations();
  });
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    if (sp?.get("q") || sp?.get("scheme")) return null;
    const savedId = localStorage.getItem(ACTIVE_CONV_KEY);
    const convs = loadConversations();
    if (savedId && convs.find((c) => c.id === savedId)) return savedId;
    return null;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionId = sessionIdRef.current;
  const resetSessionId = useCallback(() => {
    sessionIdRef.current = crypto.randomUUID();
  }, []);
  const cancelListen = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [explicitPending, setExplicitPending] = useState(false);
  const prevLocaleRef = useRef<Locale>(locale);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxH = window.innerWidth < 640 ? 180 : 220;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }

  useEffect(() => { autoResize(); }, [input]);
  const lang: Locale = locale;

  const [thinkingText, setThinkingText] = useState("");
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamingMeta, setStreamingMeta] = useState<Record<string, unknown> | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tokenBufferRef = useRef("");

  useEffect(() => {
    if (prevLocaleRef.current !== lang) {
      prevLocaleRef.current = lang;
      setExplicitPending(true);
    }
  }, [lang]);

  const initialHistory = useMemo(
    () => [t("chat.starter1"), t("chat.starter2"), t("chat.starter3"), t("chat.starter4")],
    [t]
  );
  // Auto-save current conversation when msgs change.
  // The setConversations call is deferrred via setTimeout so it is not
  // synchronous inside the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (msgs.length === 0 || !activeConvId) return;
    const id = activeConvId;
    const snapshot = msgs;
    const timeoutId = setTimeout(() => {
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === id
            ? { ...c, messages: snapshot, updatedAt: Date.now() }
            : c
        );
        saveConversations(next);
        return next;
      });
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [msgs, activeConvId]);

  const createConversation = useCallback((firstMsg: Msg) => {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: firstMsg.text?.slice(0, 50) || "New Chat",
      messages: [firstMsg],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
    };
    setConversations((prev) => {
      const next = [conv, ...prev];
      saveConversations(next);
      return next;
    });
    setActiveConvId(conv.id);
    localStorage.setItem(ACTIVE_CONV_KEY, conv.id);
    setMsgs([firstMsg]);
    return conv.id;
  }, []);

  const loadConversation = useCallback((conv: Conversation) => {
    resetSessionId();
    setMsgs(conv.messages);
    setActiveConvId(conv.id);
    localStorage.setItem(ACTIVE_CONV_KEY, conv.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setUserHasSetSidebar(true);
      setSidebarOpen(false);
    }
  }, [resetSessionId]);

  const togglePinConversation = useCallback((convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === convId ? { ...c, pinned: !c.pinned } : c
      );
      saveConversations(next);
      return next;
    });
  }, []);

  const deleteConversation = useCallback(
    (convId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== convId);
        saveConversations(next);
        return next;
      });
      if (activeConvId === convId) {
        resetSessionId();
        setMsgs([]);
        setActiveConvId(null);
        localStorage.removeItem(ACTIVE_CONV_KEY);
      }
    },
    [activeConvId, resetSessionId]
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    isNearBottomRef.current = scrollHeight - scrollTop - clientHeight < 150;
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", checkIfNearBottom, { passive: true });
    checkIfNearBottom();
    return () => container.removeEventListener("scroll", checkIfNearBottom);
  }, [checkIfNearBottom]);

  const scrollToBottom = useCallback(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [msgs, typing, streamingAnswer, scrollToBottom]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);


  async function ask(q?: string) {
    const question = (q ?? input).trim();
    if (!question || typing) return;
    setInput("");
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.overflowY = "hidden"; }

    const userMsg: Msg = { role: "user", text: question };

    if (!activeConvId) {
      createConversation(userMsg);
    } else {
      setMsgs((m) => [...m, userMsg]);
    }

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setUserHasSetSidebar(true);
      setSidebarOpen(false);
    }

    const uiLanguageExplicit = explicitPending;
    setExplicitPending(false);

    setTyping(true);
    setThinkingText("");
    setStreamingAnswer("");
    setStreamingMeta(null);
    setIsStreaming(true);
    tokenBufferRef.current = "";

    const history = msgs
      .map((m) => {
        const content = m.role === "user" ? m.text : m.resp?.answer || m.text;
        return content ? { role: m.role, content } : null;
      })
      .filter((m): m is { role: "user" | "assistant"; content: string } => m !== null)
      .slice(-8);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let metaSnapshot: Record<string, unknown> = {};

    try {
      await sendChatStream(
        { question, session_id: sessionId, language: lang, state: null, history, ui_language_explicit: uiLanguageExplicit },
        (event: StreamEvent) => {
          if (event.event === "thinking") {
            setThinkingText(event.data.text as string);
          } else if (event.event === "token") {
            setThinkingText("");
            const text = (event.data.text as string).replace(/INSUFFICIENT_EVIDENCE/g, "");
            if (text) {
              tokenBufferRef.current += text;
              setStreamingAnswer(tokenBufferRef.current);
            }
          } else if (event.event === "metadata") {
            metaSnapshot = event.data;
            setStreamingMeta(event.data);
          } else if (event.event === "error") {
            console.error("Stream error:", event.data.message);
          }
        },
        abortController.signal,
      );

      const finalAnswer = tokenBufferRef.current.replace(/INSUFFICIENT_EVIDENCE/g, "").trim();
      const finalResp: ChatResponse = {
        answer: finalAnswer,
        language: (metaSnapshot.language as Locale) || lang,
        domain: (metaSnapshot.domain as string) || "unknown",
        intent: (metaSnapshot.domain as string) || "unknown",
        entities: [],
        confidence: (metaSnapshot.confidence as number) || 0,
        confidence_level: (metaSnapshot.confidence_level as ChatResponse["confidence_level"]) || "none",
        citations: (metaSnapshot.citations as ChatResponse["citations"]) || [],
        abstained: (metaSnapshot.abstained as boolean) || false,
        mode: metaSnapshot.mode as string | undefined,
        grievance: (metaSnapshot.grievance as ChatResponse["grievance"]) ?? null,
        grievance_stage: (metaSnapshot.grievance_stage as ChatResponse["grievance_stage"]) ?? null,
        grievance_draft_summary: (metaSnapshot.grievance_draft_summary as ChatResponse["grievance_draft_summary"]) ?? null,
        grievance_fields_schema: (metaSnapshot.grievance_fields_schema as ChatResponse["grievance_fields_schema"]) ?? null,
        grievance_finalized: (metaSnapshot.grievance_finalized as boolean) ?? false,
        conversation_id: (metaSnapshot.conversation_id as string) || sessionId,
        speech_text: (metaSnapshot.speech_text as string) || undefined,
        speech_segments: (metaSnapshot.speech_segments as ChatResponse["speech_segments"]) || undefined,
        follow_up_question: null,
      };
      const msgObj = { role: "assistant" as const, resp: finalResp };
      setMsgs((m) => {
        return [...m, msgObj];
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const assistantMsg: Msg = { role: "assistant", resp: fallback(lang) };
      setMsgs((m) => [...m, assistantMsg]);
    } finally {
      setTyping(false);
      setIsStreaming(false);
      setThinkingText("");
      setStreamingAnswer("");
      setStreamingMeta(null);
      tokenBufferRef.current = "";
      abortRef.current = null;
    }
  }

  function handleNewChat() {
    resetSessionId();
    setMsgs([]);
    setInput("");
    if (taRef.current) { taRef.current.style.height = "auto"; taRef.current.style.overflowY = "hidden"; }
    setActiveConvId(null);
    localStorage.removeItem(ACTIVE_CONV_KEY);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setUserHasSetSidebar(true);
      setSidebarOpen(false);
    }
  }

  // Called by GrievanceFlow after the /finalize API succeeds.  Patches the
  // last assistant message in the conversation with the finalized grievance
  // data so it persists through localStorage save/restore, page refresh,
  // and navigation away + back.
  const handleGrievanceFinalized = useCallback((finalizedResponse: ChatResponse) => {
    setMsgs((prev) => {
      if (prev.length === 0) return prev;
      // Find the last assistant message and replace its response
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      if (last.role === "assistant" && last.resp) {
        const updated = [...prev];
        updated[lastIdx] = { ...last, resp: finalizedResponse };
        return updated;
      }
      // Fallback: append as a new assistant message
      return [...prev, { role: "assistant" as const, resp: finalizedResponse }];
    });
  }, []);

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  }

  function toggleMic() {
    if (listening) {
      cancelListen.current?.();
      setListening(false);
      return;
    }
    cancelListen.current = speech.listen(lang, (text) => {
      setInput((prev) => (prev ? prev + " " : "") + text);
      setListening(false);
    });
    setListening(true);
  }

  const suggestedActions = [
    { key: "schemes", label: t("nav.schemes") || "Crop Insurance", prompt: t("chat.starter1"), accent: "#526B58" },
    { key: "services", label: t("nav.services") || "Services", prompt: t("chat.starter2"), accent: "#C65D2E" },
    { key: "library", label: t("nav.library") || "PACS Services", prompt: t("chat.starter3"), accent: "#27364A" },
    { key: "legal", label: t("nav.legal") || "Legal Framework", prompt: t("chat.starter4"), accent: "#27364A" },
  ];

  function formatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    return conversations.filter((c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  const pinnedConversations = useMemo(() => {
    return filteredConversations.filter((c) => c.pinned);
  }, [filteredConversations]);

  const recentConversations = useMemo(() => {
    return filteredConversations.filter((c) => !c.pinned);
  }, [filteredConversations]);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-[var(--canvas)] text-[var(--ink)] font-sans">
      {/* Mobile Backdrop Overlay */}
      {effectiveSidebarOpen && (
        <div
          onClick={() => { setUserHasSetSidebar(true); setSidebarOpen(false); }}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* ==================== LEFT SIDEBAR ==================== */}
      {/* Collapsed Rail (desktop icon sidebar like ChatGPT) */}
      {!effectiveSidebarOpen && (
        <aside className="hidden lg:flex inset-y-0 left-0 z-40 w-16 flex-col items-center border-r border-[var(--border-soft)] bg-[var(--cream)] py-3">
          {/* Toggle Sidebar */}
          <button
            type="button"
            onClick={() => { setUserHasSetSidebar(true); setSidebarOpen(true); }}
            title={t("chat.openSidebar")}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
          >
            <IconSidebar className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            title={t("chat.newChat")}
            className="mt-1 flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
          >
            <IconEdit className="h-[18px] w-[18px]" />
          </button>

          <div className="my-2 h-[1px] w-7 bg-[var(--border-soft)]" />

          <div suppressHydrationWarning className="flex-1 w-full overflow-y-auto space-y-1 px-2">
            {hydrated && conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => loadConversation(conv)}
                title={conv.title}
                className={`group flex h-9 w-full items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--cream-2)] ${
                  activeConvId === conv.id ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]" : "text-[var(--text-faint)]"
                }`}
              >
                {conv.pinned ? (
                  <IconPin className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                ) : (
                  <IconClock className="h-4 w-4 shrink-0 group-hover:text-[var(--ink)]" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-2">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--dark)] text-[var(--on-dark-strong)] shadow-[var(--shadow-sm)] transition-transform hover:scale-105"
              title={t("chat.home")}
            >
              <IconBot className="h-5 w-5" />
            </Link>
          </div>
        </aside>
      )}

      {/* Expanded Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-[var(--border-soft)] bg-[var(--cream)] transition-all duration-300 lg:relative lg:z-0 ${
          effectiveSidebarOpen
            ? "w-72 min-w-[18rem] translate-x-0 shadow-2xl lg:shadow-none"
            : "w-0 min-w-0 -translate-x-full overflow-hidden lg:hidden"
        }`}
      >
        {/* Sidebar Header with ChatGPT-like Icons */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--border-soft)]/60">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setUserHasSetSidebar(true); setSidebarOpen(false); }}
              title={t("chat.closeSidebar")}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
            >
              <IconSidebar className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowSearchInput((s) => !s)}
              title={t("chat.searchHistory")}
              className={`flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--cream-2)] ${
                showSearchInput ? "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]" : "text-[var(--text-body)]"
              }`}
            >
              <IconSearch className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleNewChat}
              title={t("chat.newChat")}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
            >
              <IconEdit className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Input */}
        {showSearchInput && (
          <div className="px-3 pt-2.5 pb-1">
            <div className="relative flex items-center rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-2.5 py-1.5 shadow-[var(--shadow-sm)]">
              <IconSearch className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("chat.searchPlaceholder")}
                className="w-full bg-transparent px-2 text-xs text-[var(--ink)] placeholder:text-[var(--text-faint)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-[var(--text-faint)] hover:text-[var(--ink)]"
                >
                  <IconX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
          {/* New Session */}
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs font-semibold transition-colors hover:bg-[var(--cream-2)] text-[var(--ink)]"
            >
              <IconPlus className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <span>{t("common.newSession")}</span>
            </button>
          </div>

          {/* Pinned */}
          {hydrated && pinnedConversations.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1.5">
                  <IconPin className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                  {t("chat.pinned")}
                </span>
                <span className="text-[10px] text-[var(--text-faint)] font-mono">{pinnedConversations.length}</span>
              </div>
              <div className="space-y-0.5">
                {pinnedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => loadConversation(conv)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        loadConversation(conv);
                      }
                    }}
                    className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--cream-2)] ${
                      activeConvId === conv.id
                        ? "bg-[var(--accent-primary)]/10 font-semibold text-[var(--ink)] border-l-2 border-[var(--accent-primary)]"
                        : "text-[var(--ink)]"
                    }`}
                  >
                    <IconPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent-primary)]" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate">{conv.title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => togglePinConversation(conv.id, e)}
                      title={t("chat.unpin")}
                      className="shrink-0 p-1 text-[var(--accent-primary)] hover:opacity-75"
                    >
                      <IconPin className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent History */}
          <div>
            <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <span className="flex items-center gap-1.5">
                <IconClock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                {t("chat.recentHistory")}
              </span>
              {hydrated && conversations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    resetSessionId();
                    setConversations([]);
                    saveConversations([]);
                    setMsgs([]);
                    setActiveConvId(null);
                  }}
                  title={t("chat.clearHistory")}
                  className="text-[var(--text-faint)] hover:text-[var(--state-error)] transition-colors"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-0.5">
              {hydrated && recentConversations.length === 0 && pinnedConversations.length === 0 && (
                <div className="px-2 py-8 text-center">
                  <p className="text-xs text-[var(--text-faint)]">
                    {t("chat.noHistory")}
                  </p>
                </div>
              )}

              {hydrated && recentConversations.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => loadConversation(conv)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      loadConversation(conv);
                    }
                  }}
                  className={`group flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--cream-2)] ${
                    activeConvId === conv.id
                      ? "bg-[var(--accent-primary)]/10 font-semibold text-[var(--ink)] border-l-2 border-[var(--accent-primary)]"
                      : "text-[var(--ink)]"
                  }`}
                >
                  <IconClock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] group-hover:text-[var(--accent-primary)]" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{conv.title}</span>
                    <span className="text-[10px] text-[var(--text-faint)] block truncate">
                      {formatTime(conv.updatedAt || conv.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => togglePinConversation(conv.id, e)}
                      title={t("chat.pinChat")}
                      className="p-1 text-[var(--text-faint)] hover:text-[var(--accent-primary)]"
                    >
                      <IconPin className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => deleteConversation(conv.id, e)}
                      title={t("chat.delete")}
                      className="p-1 text-[var(--text-faint)] hover:text-[var(--state-error)]"
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Footer Profile */}
        <div className="border-t border-[var(--border-soft)] p-3">
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] p-2.5 shadow-[var(--shadow-sm)]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--dark)] text-[var(--on-dark-strong)]">
              <IconUser className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[var(--ink)]">{t("chat.user")}</p>
              <p className="truncate text-[10px] text-[var(--text-faint)] font-mono">{t("chat.freePlan")}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ==================== MAIN CHAT AREA ==================== */}
      <main className="flex flex-1 flex-col overflow-hidden bg-[var(--canvas)] min-w-0">
        {/* Top Header Bar */}
        <header className="flex h-13 shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--canvas)]/95 backdrop-blur-sm px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              title={t("chat.back")}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--cream)] hover:text-[var(--ink)]"
            >
              <IconArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <button
              type="button"
              onClick={() => { setUserHasSetSidebar(true); setSidebarOpen(!effectiveSidebarOpen); }}
              title={t("chat.toggleSidebar")}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-soft)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream)] hover:text-[var(--ink)]"
            >
              <IconSidebar className="h-4 w-4" />
            </button>

            <div className="relative ml-1">
              <span className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1 text-sm font-semibold text-[var(--ink)]">
                <span>{model}</span>
                <span className="text-[10px] text-[var(--text-faint)]">▼</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={handleNewChat}
              title={t("chat.newChat")}
              className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-soft)] text-[var(--text-body)] transition-colors hover:bg-[var(--cream)] hover:text-[var(--ink)]"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Message Stream Area */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto w-full">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
            {/* Empty State Hero */}
            {hydrated && msgs.length === 0 && (
              <Reveal trigger="load">
                <div className="py-12 sm:py-20 text-center">
                  {/* Architectural watermark */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
                      <svg viewBox="0 0 200 200" className="w-64 h-64 opacity-[0.03] text-[var(--ink)]" fill="none" stroke="currentColor" strokeWidth="0.5">
                        <rect x="40" y="20" width="120" height="160" rx="4" />
                        <line x1="60" y1="50" x2="140" y2="50" />
                        <line x1="60" y1="70" x2="140" y2="70" />
                        <line x1="60" y1="90" x2="120" y2="90" />
                        <line x1="60" y1="110" x2="130" y2="110" />
                        <line x1="60" y1="130" x2="110" y2="130" />
                        <circle cx="100" cy="155" r="8" />
                      </svg>
                    </div>

                    <div className="relative z-10 space-y-4">
                      {/* Sahakarita AI Emblem */}
                      <div className="mx-auto relative" style={{ width: 80, height: 80 }}>
                        <svg viewBox="0 0 80 80" className="w-20 h-20" fill="none" aria-hidden="true">
                          {/* Outer ring */}
                          <circle cx="40" cy="40" r="38" stroke="var(--accent-primary)" strokeWidth="1" opacity="0.3" />
                          {/* Inner ring */}
                          <circle cx="40" cy="40" r="32" stroke="var(--accent-primary)" strokeWidth="0.5" opacity="0.15" strokeDasharray="3 3" />
                          {/* Background fill */}
                          <circle cx="40" cy="40" r="28" fill="var(--dark)" />
                          {/* Cooperative network nodes - subtle connection motif */}
                          <g opacity="0.2" stroke="var(--on-dark-strong)" strokeWidth="0.5">
                            <circle cx="40" cy="16" r="1.5" fill="var(--on-dark-strong)" />
                            <circle cx="60" cy="28" r="1.5" fill="var(--on-dark-strong)" />
                            <circle cx="60" cy="52" r="1.5" fill="var(--on-dark-strong)" />
                            <circle cx="40" cy="64" r="1.5" fill="var(--on-dark-strong)" />
                            <circle cx="20" cy="52" r="1.5" fill="var(--on-dark-strong)" />
                            <circle cx="20" cy="28" r="1.5" fill="var(--on-dark-strong)" />
                            <line x1="40" y1="16" x2="60" y2="28" />
                            <line x1="60" y1="28" x2="60" y2="52" />
                            <line x1="60" y1="52" x2="40" y2="64" />
                            <line x1="40" y1="64" x2="20" y2="52" />
                            <line x1="20" y1="52" x2="20" y2="28" />
                            <line x1="20" y1="28" x2="40" y2="16" />
                          </g>
                          {/* Central document + check symbol */}
                          <g transform="translate(28, 24)">
                            {/* Document outline */}
                            <rect x="0" y="0" width="24" height="28" rx="2" stroke="var(--on-dark-strong)" strokeWidth="1.2" fill="none" opacity="0.9" />
                            {/* Document lines */}
                            <line x1="5" y1="8" x2="19" y2="8" stroke="var(--on-dark-strong)" strokeWidth="0.8" opacity="0.4" />
                            <line x1="5" y1="13" x2="19" y2="13" stroke="var(--on-dark-strong)" strokeWidth="0.8" opacity="0.4" />
                            <line x1="5" y1="18" x2="14" y2="18" stroke="var(--on-dark-strong)" strokeWidth="0.8" opacity="0.4" />
                            {/* Check mark - evidence verified */}
                            <circle cx="17" cy="21" r="5" fill="var(--accent-primary)" opacity="0.9" />
                            <path d="M14.5 21 L16 22.5 L19.5 19" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </g>
                        </svg>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-primary)] mb-2">Civic Assistance Desk</p>
                        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ink)] leading-tight">
                          {t("chat.emptyTitle")}
                        </h1>
                      </div>

                      <p className="text-sm text-[var(--text-body)] max-w-md mx-auto leading-relaxed">
                        {t("chat.emptySubtitle")}
                      </p>
                    </div>
                  </div>

                  {/* Suggestion Cards */}
                  <div className="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
                    {suggestedActions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setInput(action.prompt);
                          taRef.current?.focus();
                        }}
                        className="group flex flex-col justify-between rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--canvas)] p-4 transition-all duration-200 ease-[var(--ease-out-cubic)] hover:border-[var(--ink)]/15 hover:bg-[var(--cream)] hover:shadow-[var(--shadow-sm)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: action.accent }}>
                            {action.label}
                          </span>
                          <svg viewBox="0 0 16 16" className="w-4 h-4 text-[var(--text-faint)] group-hover:text-[var(--ink)] transition-colors" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M6 4l4 4-4 4" />
                          </svg>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-tertiary)] line-clamp-2 leading-relaxed">
                          {action.prompt}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}

            {/* Conversation Messages */}
            {hydrated && (() => {
              // Find the last assistant message index for active grievance rendering
              let lastAssistantIdx = -1;
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === "assistant") {
                  lastAssistantIdx = i;
                  break;
                }
              }
              return msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl bg-[var(--dark)] px-4 py-3 text-xs sm:text-sm leading-relaxed text-[var(--on-dark-strong)] shadow-2xs">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    key={i}
                    resp={m.resp!}
                    onSendMessage={ask}
                    onGrievanceFinalized={handleGrievanceFinalized}
                    isActive={i === lastAssistantIdx}
                  />
                )
              );
            })()}

            {typing && !isStreaming && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--dark)] text-[var(--on-dark-strong)]">
                  <IconBot className="h-4 w-4 animate-pulse" />
                </div>
                <Skeleton className="h-16 w-3/4 max-w-[28rem] rounded-xl" />
              </div>
            )}

            {isStreaming && thinkingText && !streamingAnswer && (
              <ThinkingBubble thinkingText={thinkingText} lang={lang} />
            )}
            {isStreaming && streamingAnswer.trim() && (
              <MessageBubble
                isStreaming={true}
                resp={{
                  answer: streamingAnswer,
                  language: lang,
                  domain: (streamingMeta?.domain as string) || "unknown",
                  intent: (streamingMeta?.domain as string) || "unknown",
                  entities: [],
                  confidence: (streamingMeta?.confidence as number) || 0,
                  confidence_level: (streamingMeta?.confidence_level as ChatResponse["confidence_level"]) || "none",
                  citations: (streamingMeta?.citations as ChatResponse["citations"]) || [],
                  abstained: false,
                  follow_up_question: null,
                }}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Floating Input Composer */}
        <div className="w-full bg-[var(--canvas)] pb-3 pt-2">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            <div className="ask-input-wrap relative flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--cream)] p-2.5 sm:p-3 shadow-[var(--shadow-md)] transition-all duration-200 ease-[var(--ease-out-cubic)] focus-within:border-[var(--accent-primary)] focus-within:shadow-[var(--ask-glow)]">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={t("chat.placeholder")}
                aria-label={t("chat.placeholder")}
                className="w-full resize-none bg-transparent px-2 py-1 font-answer text-xs sm:text-base leading-relaxed text-[var(--ink)] placeholder:text-[var(--text-faint)] focus:outline-none max-h-[180px] sm:max-h-[220px] overflow-y-hidden"
              />

              <div className="mt-2 flex items-center justify-end pt-1 gap-2">
                {hydrated && speech.supported && (
                  <button
                    type="button"
                    aria-label={listening ? t("common.stopMic") : t("common.mic")}
                    onClick={toggleMic}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      listening
                        ? "bg-[var(--accent-primary)] text-[var(--accent-contrast)] animate-pulse"
                        : "text-[var(--text-body)] hover:bg-[var(--cream-2)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <IconMic className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="button"
                  aria-label={t("common.send")}
                  disabled={!input.trim() || typing}
                  onClick={() => ask()}
                  className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow-[var(--shadow-sm)] transition-all duration-200 ease-[var(--ease-out-cubic)] hover:bg-[var(--accent-hover)] hover:shadow-[var(--shadow-md)] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  <IconSend className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[10px] sm:text-xs text-[var(--text-faint)]">
              {t("chat.disclaimer")}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
