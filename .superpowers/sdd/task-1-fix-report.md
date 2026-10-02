# Task 1 Fix Report — Revert Scope Creep in Evidence Controller

## What Was Reverted

1. **Removed `_deduplicate_and_select` method** — entire method deleted from `EvidenceController` class
2. **Static chunk cap restored** — `bundle.static.chunks[:3]` (was `self._deduplicate_and_select(..., max_chunks=7)`)
3. **Dynamic chunk cap restored** — `bundle.dynamic.chunks[:3]` (was `self._deduplicate_and_select(..., max_chunks=5)`)
4. **BALANCED sufficiency thresholds restored** — `>= 3` for SUFFICIENT, `total >= 2` for PARTIAL (was `>= 4` and `>= 2` + extra `total >= 1` fallback)
5. **Cleaned up test file** — removed 8 test methods from `test_retrieval_scenarios.py` that referenced the deleted method; removed unused `EvidenceController` import

## What Was Preserved

- `_SOURCE_PRIORITY_PROMPT` — strengthened 16-rule version (task-brief-specified)
- `_LANG_NAMES` — all 11 languages included (task-brief-specified)
- All comments updated to reflect original caps (3, not 7/5)

## Test Results

```
77 passed in 5.92s
```

Evidence-related tests: `test_evidence_controller.py`, `test_evidence_assessment.py`, `test_evidence_gate.py`, `test_evidence_gate_unified.py`, `test_retrieval_scenarios.py`

Pre-existing failures (unrelated — unmocked external API calls):
- `test_answered_with_valid_citations` — embedding API not mocked
- `test_chat_resolves_contextual_followup_question` — embedding API not mocked
