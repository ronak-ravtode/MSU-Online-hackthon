# Canonical Domain Taxonomy

**Purpose:** Single source of truth for domain IDs used across classifier, retrieval, and evaluation.

**Status:** FROZEN — do not change without updating all consumers.

---

## Canonical Domain IDs

| Canonical ID | Description | Docs | Chunks | Source documents |
|--------------|-------------|------|--------|-------------------|
| `pacs_governance` | PACS byelaws, governance, membership, cooperative society registration | 8 | 2076 | Model Byelaws, HR Policy, MoC YPs, CSM Scheme, CRCS Order, Cooperative Member Rights, Gujarat Act, HR Policy Transformation |
| `pacs_computerization` | PACS computerization scheme, digitization guidelines | 3 | 316 | Revised Scheme guidelines, Corrigendum, GeM Hiring |
| `pmfby` | PMFBY crop insurance, claims, premiums, eligibility | 16 | 8153 | PMFBY Operational Guidelines, Revamped Guidelines, WINDS Manual, WBCIS, UPIS, YESTECH, NAIS, RWBCIS, AWS, SOP |
| `financial_inclusion` | RBI, Jan Dhan, financial literacy, deposit insurance, RuPay | 9 | 3816 | NSFI 2025-30, RBI FAME (2 editions), RBI BE(A)WARE (2 editions), RBI Financial Education, IRDAI Insurance, NABARD Literacy |
| `schemes` | Ministry of Cooperation schemes (ads, YP, internships) | 14 | 641 | Lok Sabha Calendar, YP/Consultant ads, Faculty ads, Internship ToR, Cooperative Ombudsman, Election Authority, CSM Grant |
| `agriculture` | Agriculture practices, MSP, mandi, fertilizer (no DB documents yet) | 0 | 0 | — |
| `grievance` | Complaint filing, grievance redressal (no DB documents yet) | 0 | 0 | — |
| `out_of_scope` | Query does not match any domain | 0 | 0 | — |

---

## Domain Routing Rules

1. **Exact match only.** The `match_chunks` RPC uses `d.domain = match_domain`. No prefix/contains matching.

2. **Classifier must emit only canonical IDs.** If the classifier returns a non-canonical ID, it's a bug.

3. **Unknown domains route to `out_of_scope`.** The system abstains for unrecognized domains.

4. **Domains without DB documents return empty results.** This is expected — the system should abstain when no evidence exists.

---

## Mapping from Legacy IDs

| Legacy ID | Canonical ID | Notes |
|-----------|--------------|-------|
| `cooperative` | `pacs_governance` | Cooperative society = PACS governance |
| `pacs` | `pacs_governance` | PACS queries default to governance |
| `finlit` | `financial_inclusion` | Financial literacy = financial inclusion |
| `pmfby` | `pmfby` | No change |

---

## Consumer Conformance

| Component | Must Use | File |
|-----------|----------|------|
| Keyword rules | Canonical IDs | `backend/data/keyword_rules.json` |
| Anchor classifier | Canonical IDs | `backend/data/domain_anchors.json` |
| Database documents | Canonical IDs | `documents.domain` column |
| Gold cases | Canonical IDs | `eval/gold_cases.yaml` `expected_domain` |
| Evaluation scripts | Canonical IDs | `eval/gate2_config.yaml` |

---

## Verification

After any domain taxonomy change:
1. Run `python -m eval.corpus_check` — all document domains must be canonical
2. Run `python -m eval.run_retrieval_eval` — classifier must emit canonical IDs
3. Run `pytest tests/test_domains.py -v` — domain classification tests must pass
