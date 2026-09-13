import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { LanguageProvider } from "@/lib/i18n/provider";
import type { ChatResponse } from "@/lib/api";

// Mock only speakSegments; keep createSpeechService (used for stopSpeaking).
vi.mock("@/lib/speech", async () => {
  const actual = await vi.importActual<typeof import("@/lib/speech")>("@/lib/speech");
  return {
    ...actual,
    speakSegments: vi.fn(async () => {}),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock API calls used by GrievanceFlow
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    answerGrievanceField: vi.fn(async () => ({ status: "ok" })),
    finalizeGrievanceDraft: vi.fn(async () => ({
      status: "ok",
      grievance: {
        reference: "GRV-TEST", category: "Municipal", sub_category: "Garbage",
        department: "Municipal Corporation", jurisdiction: "Local",
        title: "Test", description: { original: "Test", normalized: "Test", display: "Test" },
        location: { ward_number: null, locality: null, area: null, city: null, district: null, state: null },
        submission: { portal_name: "Portal", portal_url: null, department: "Dept", level: "local",
          steps: [], required_documents: [], estimated_timeline: null, disclaimer: null },
      },
      mixed_language: false,
    })),
    clarifyGrievance: vi.fn(async () => ({ status: "ok", stage: "classification", draft_summary: null, fields_schema: null })),
  };
});

import { speakSegments } from "@/lib/speech";
import { MessageBubble } from "../MessageBubble";

function minimalResp(overrides: Partial<ChatResponse>): ChatResponse {
  return {
    answer: "You may be eligible for PMFBY if you are a farmer.",
    language: "en",
    domain: "law",
    intent: "eligibility",
    entities: [],
    confidence: 0.8,
    confidence_level: "high",
    citations: [],
    abstained: false,
    follow_up_question: null,
    speech_segments: undefined,
    ...overrides,
  };
}

function renderBubble(resp: ChatResponse) {
  return render(
    <LanguageProvider>
      <MessageBubble resp={resp} />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("MessageBubble read-aloud", () => {
  it("abstained response renders no read-aloud button", () => {
    renderBubble(
      minimalResp({ abstained: true, answer: "I cannot answer this with confidence.", speech_segments: undefined }),
    );

    // Abstention copy is present (en -> "This answer needs human verification").
    expect(screen.getByText(/needs human verification/i)).toBeTruthy();
    // No read-aloud control should exist in the abstained branch.
    expect(screen.queryByRole("button", { name: /read aloud/i })).toBeNull();
  });

  it("read-aloud button calls speakSegments with segments", async () => {
    const segments = [
      { text: "hello", language: "en" },
      { text: "नमस्ते", language: "hi" },
    ];
    renderBubble(minimalResp({ speech_segments: segments }));

    const btn = screen.getByRole("button", { name: /read aloud/i });
    expect(btn).toBeTruthy();

    fireEvent.click(btn);

    await waitFor(() => {
      expect(speakSegments).toHaveBeenCalledWith(segments);
    });
  });

  it("read-aloud uses speech_segments NOT answer when both present (TTS regression)", async () => {
    const structuredSegments = [
      { text: "Category: Water Supply. ", language: "en" },
      { text: "Name: Ramesh Patel. ", language: "en" },
    ];
    const oldProse = "**Grievance Draft**\n- Category: Water Supply\n✅ Complete";

    renderBubble(minimalResp({
      answer: oldProse,
      speech_segments: structuredSegments,
      mode: "grievance",
    }));

    const btn = screen.getByRole("button", { name: /read aloud/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(speakSegments).toHaveBeenCalledWith(structuredSegments);
    });
  });

  it("hides read-aloud button when speech_segments is empty", () => {
    renderBubble(minimalResp({ speech_segments: [] }));
    expect(screen.queryByRole("button", { name: /read aloud/i })).toBeNull();
  });
});

function makeClassificationResp(): ChatResponse {
  return {
    answer: "Please confirm if the classification is correct.",
    language: "en",
    domain: "grievance",
    intent: "grievance",
    entities: [],
    confidence: 1.0,
    confidence_level: "high",
    citations: [],
    abstained: false,
    mode: "grievance",
    grievance_stage: "classification",
    grievance_finalized: false,
    conversation_id: "test-conv",
    follow_up_question: null,
    grievance: {
      reference: "GRV-20260912-000001",
      category: "Agriculture",
      sub_category: "PMFBY Claim Delay",
      department: "Agriculture",
      jurisdiction: "Central",
      title: "PMFBY Claim Delay",
      description: {
        original: "My PMFBY claim is delayed.",
        normalized: "My PMFBY claim is delayed.",
        display: "My PMFBY claim is delayed.",
      },
      location: { ward_number: null, locality: null, area: null, city: null, district: null, state: null },
      submission: null,
      fields: null,
    },
    grievance_draft_summary: {
      category: "Agriculture",
      sub_category: "PMFBY Claim Delay",
      department: "Agriculture",
      jurisdiction: "Central",
      title: "PMFBY Claim Delay",
      description: "My PMFBY claim is delayed.",
    },
  };
}

function makeFieldsResp(): ChatResponse {
  return {
    answer: "Thank you. I've updated your grievance draft.",
    language: "en",
    domain: "grievance",
    intent: "grievance",
    entities: [],
    confidence: 1.0,
    confidence_level: "high",
    citations: [],
    abstained: false,
    mode: "grievance",
    grievance_stage: "fields",
    grievance_finalized: false,
    conversation_id: "test-conv",
    follow_up_question: null,
    grievance: {
      reference: "GRV-20260912-000001",
      category: "Agriculture",
      sub_category: "PMFBY Claim Delay",
      department: "Agriculture",
      jurisdiction: "Central",
      title: "PMFBY Claim Delay",
      description: {
        original: "My PMFBY claim is delayed.",
        normalized: "My PMFBY claim is delayed.",
        display: "My PMFBY claim is delayed.",
      },
      location: { ward_number: null, locality: null, area: null, city: null, district: null, state: null },
      submission: null,
      fields: null,
    },
    grievance_draft_summary: {
      category: "Agriculture",
      sub_category: "PMFBY Claim Delay",
      department: "Agriculture",
      jurisdiction: "Central",
      title: "PMFBY Claim Delay",
      description: "My PMFBY claim is delayed.",
    },
    grievance_fields_schema: {
      mandatory_fields: [
        {
          field: "farmer_name",
          field_label: "Farmer Name",
          question: "What is your name?",
          input_type: "text",
          mandatory: true,
          value: null,
        },
        {
          field: "application_id",
          field_label: "Application ID",
          question: "What is your application ID?",
          input_type: "text",
          mandatory: true,
          value: null,
        },
      ],
      optional_fields: [],
    },
  };
}

describe("MessageBubble: grievance flow transition (classification → fields)", () => {
  it("renders GrievanceFlow for classification response with onSendMessage", () => {
    const resp = makeClassificationResp();
    const onSendMessage = vi.fn();
    render(
      <LanguageProvider>
        <MessageBubble resp={resp} onSendMessage={onSendMessage} isActive={true} />
      </LanguageProvider>,
    );

    // Should show the classification table with Yes/No buttons (i18n key: grievanceWizard.confirmTitle)
    expect(screen.getByText(/Is this information correct/i)).toBeTruthy();
  });

  it("renders GrievanceFlow for fields response with field panel", () => {
    const resp = makeFieldsResp();
    const onSendMessage = vi.fn();
    render(
      <LanguageProvider>
        <MessageBubble resp={resp} onSendMessage={onSendMessage} isActive={true} />
      </LanguageProvider>,
    );

    // Should show the field panel, NOT the text answer
    expect(screen.getByText(/What is your name/i)).toBeTruthy();
    // Field panel renders with Next/Submit buttons
    expect(screen.getByRole("button", { name: /next/i })).toBeDefined();
    // Should NOT show the raw text answer
    expect(screen.queryByText(/Thank you. I've updated your grievance draft/i)).toBeNull();
  });

  it("field panel renders even when previous classification response is still in msgs", () => {
    const classResp = makeClassificationResp();
    const fieldsResp = makeFieldsResp();
    const onSendMessage = vi.fn();

    const { rerender } = render(
      <LanguageProvider>
        <MessageBubble resp={classResp} onSendMessage={onSendMessage} isActive={true} />
      </LanguageProvider>,
    );

    // First: classification table is visible
    expect(screen.getByText(/Is this information correct/i)).toBeTruthy();

    // Simulate what ChatWindow does: re-render with the fields response
    // (same key, new response - this is how React handles the new message)
    rerender(
      <LanguageProvider>
        <MessageBubble resp={fieldsResp} onSendMessage={onSendMessage} isActive={true} />
      </LanguageProvider>,
    );

    // Should now show field panel, NOT the text answer
    expect(screen.getByText(/What is your name/i)).toBeTruthy();
    expect(screen.queryByText(/Thank you. I've updated your grievance draft/i)).toBeNull();
  });

  it("does NOT render GrievanceCard for fields response (submission is null)", () => {
    const resp = makeFieldsResp();
    const onSendMessage = vi.fn();
    render(
      <LanguageProvider>
        <MessageBubble resp={resp} onSendMessage={onSendMessage} isActive={true} />
      </LanguageProvider>,
    );

    // Should NOT render GrievanceCard (submission is null)
    expect(screen.queryByText(/Grievance draft ready/i)).toBeNull();
    // Should render field panel
    expect(screen.getByText(/What is your name/i)).toBeTruthy();
  });

  it("renders text answer when onSendMessage is not provided", () => {
    const resp = makeFieldsResp();
    // No onSendMessage prop - simulates streaming bubble or historical message
    render(
      <LanguageProvider>
        <MessageBubble resp={resp} isActive={false} />
      </LanguageProvider>,
    );

    // Without onSendMessage, hasStructuredGrievance = false → should render text answer
    expect(screen.getByText(/Thank you. I've updated your grievance draft/i)).toBeTruthy();
  });
});
