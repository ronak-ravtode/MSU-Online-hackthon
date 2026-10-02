"""Evidence Controller — query classification, evidence bundling, prompt curation."""

from __future__ import annotations

import datetime
import logging
import re

from app.contracts import (
    DynamicEvidence,
    EvidenceAssessment,
    EvidenceBundle,
    EvidenceSufficiency,
    QueryRequirements,
    RAGResult,
    SourceRole,
    StaticEvidence,
)
from app.config import MAX_CHARS_PER_CHUNK

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Indicator word lists (English, Hindi, Gujarati)
# ---------------------------------------------------------------------------

_CURRENT_INDICATORS: dict[str, list[str]] = {
    "en": ["currently", "now", "today", "current", "active", "present"],
    "hi": ["हाल", "अभी", "वर्तमान", "चालू"],
    "gu": ["હાલ", "હાલમાં", "અત્યારે", "ચાલુ", "વર્તમાન"],
}

_HISTORICAL_INDICATORS: dict[str, list[str]] = {
    "en": ["previous", "earlier", "past", "old", "guidelines"],
    "hi": ["पिछला", "पुराना", "दिशानिर्देश"],
    "gu": ["અગાઉના", "જૂના", "માર્ગદર્શિકા"],
}

_DISTRICT_INDICATORS: dict[str, list[str]] = {
    "en": ["district", "city", "taluka", "tehsil"],
    "hi": ["जिला", "शहर", "तहसील"],
    "gu": ["જિલ્લો", "શહેર", "તાલુકો"],
}

_STATE_INDICATORS: dict[str, list[str]] = {
    "en": ["state", "gujarat", "maharashtra", "karnataka", "tamil nadu"],
    "hi": ["राज्य", "गुजरात", "महाराष्ट्र"],
    "gu": ["રાજ્ય", "ગુજરાત", "મહારાષ્ટ્ર"],
}

_YEAR_PATTERN = re.compile(r"\b(20\d{2})\b")

# Enumeration detection patterns
_ENUMERATION_KEYWORDS_EN = [
    "types", "categories", "kinds", "varieties",
    "eligibility", "eligible", "requirements", "required", "criteria",
    "documents", "papers", "certificates",
    "steps", "procedure", "process",
    "benefits", "advantages", "features",
    "exclusions", "exceptions", "restrictions",
    "coverage", "covered", "included",
    "authorities", "offices", "departments",
]

_ENUMERATION_KEYWORDS_HI = [
    "प्रकार", "श्रेणियां", "किस्में",
    "पात्रता", "पात्र", "आवश्यकताएं", "आवश्यक", "मापदंड",
    "दस्तावेज", "कागजात", "प्रमाणपत्र",
    "चरण", "प्रक्रिया", "विधि",
    "लाभ", "फायदे", "विशेषताएं",
    "बहिष्करण", "अपवाद", "प्रतिबंध",
    "कवरेज", "शामिल", "कवर",
    "अधिकारियों", "कार्यालयों", "विभागों",
]

_ENUMERATION_KEYWORDS_GU = [
    "પ્રકાર", "શ્રેણીઓ", "જાતો",
    "પાત્રતા", "પાત્ર", "જરૂરિયાતો", "જરૂરી", "માપદંડો",
    "દસ્તાવેજો", "કાગળો", "પ્રમાણપત્રો",
    "પગલાં", "પ્રક્રિયા", "રીત",
    "ફાયદા", "લાભો", "વિશેષતાઓ",
    "બહિષ્કરણ", "અપવાદો", "પ્રતિબંધો",
    "કવરેજ", "સામેલ", "આવરી",
    "અધિકારીઓ", "કચેરીઓ", "વિભાગો",
]


def detect_enumeration_question(question: str) -> bool:
    """Detect if user question asks for an enumeration/list.

    Returns True if question contains keywords like types, categories,
    eligibility, requirements, documents, steps, benefits, exclusions,
    coverage, authorities.
    """
    q = question.lower()

    # Check English keywords
    if any(kw in q for kw in _ENUMERATION_KEYWORDS_EN):
        return True

    # Check Hindi keywords
    if any(kw in question for kw in _ENUMERATION_KEYWORDS_HI):
        return True

    # Check Gujarati keywords
    if any(kw in question for kw in _ENUMERATION_KEYWORDS_GU):
        return True

    return False


# Gujarat districts (common)
_GUJARAT_DISTRICTS: list[str] = [
    "surat", "valsad", "navsari", "bardoli", "ahmedabad", "rajkot",
    "jamnagar", "bhuj", "gandhinagar", "vadodara", "anand", "nadiad",
    "mahesana", "patan", "banaskantha", "sabarkantha", "pritam nagar",
]


class QueryRequirementClassifier:
    """Determines what kind of evidence a query needs."""

    def classify(
        self,
        query: str,
        lang: str,
        session_state: dict | None = None,
    ) -> QueryRequirements:
        temporal = self._detect_temporal(query, lang)
        geographic = self._detect_geographic(query, lang, session_state)
        specificity = self._detect_specificity(query, lang, temporal, geographic)
        requires_dynamic = self._needs_dynamic(temporal, geographic, specificity)

        return QueryRequirements(
            temporal_scope=temporal,
            geographic_scope=geographic,
            required_specificity=specificity,
            requires_dynamic=requires_dynamic,
        )

    # -- temporal -----------------------------------------------------------

    def _detect_temporal(self, query: str, lang: str) -> str:
        q = query.lower()

        # Explicit year mention
        years = _YEAR_PATTERN.findall(q)
        if years:
            latest = max(int(y) for y in years)
            current_year = datetime.datetime.now(tz=datetime.UTC).year
            if latest >= current_year:
                return str(latest)
            return "historical"

        # Current-indicator words
        indicators = _CURRENT_INDICATORS.get(lang, []) + _CURRENT_INDICATORS["en"]
        if any(ind in q for ind in indicators):
            return "current"

        # Historical-indicator words
        indicators = _HISTORICAL_INDICATORS.get(lang, []) + _HISTORICAL_INDICATORS["en"]
        if any(ind in q for ind in indicators):
            return "historical"

        return "general"

    # -- geographic ---------------------------------------------------------

    def _detect_geographic(
        self, query: str, lang: str, session_state: dict | None,
    ) -> str:
        q = query.lower()

        # District-indicator words
        district_inds = _DISTRICT_INDICATORS.get(lang, []) + _DISTRICT_INDICATORS["en"]
        if any(ind in q for ind in district_inds):
            return "district"

        # Known Gujarat district names
        if any(d in q for d in _GUJARAT_DISTRICTS):
            return "district"

        # State-indicator words
        state_inds = _STATE_INDICATORS.get(lang, []) + _STATE_INDICATORS["en"]
        if any(ind in q for ind in state_inds):
            return "state"

        # Session-state fallback
        if session_state:
            if session_state.get("district"):
                return "district"
            if session_state.get("state"):
                return "state"

        return "none"

    # -- specificity --------------------------------------------------------

    def _detect_specificity(
        self, query: str, lang: str, temporal: str, geographic: str,
    ) -> str:
        if geographic == "district" and (
            temporal == "current" or _YEAR_PATTERN.search(temporal)
        ):
            return "crop+district+year"
        if geographic == "district":
            return "district"
        if geographic == "state":
            return "state"
        return "general"

    # -- dynamic-evidence decision ------------------------------------------

    def _needs_dynamic(
        self, temporal: str, geographic: str, specificity: str,
    ) -> bool:
        # Historical + no geographic specificity → static corpus is enough
        if temporal == "historical" and geographic == "none":
            return False
        # General + no geographic → static corpus is enough
        if temporal == "general" and geographic == "none":
            return False
        # District-level always needs dynamic (current local facts)
        if geographic == "district":
            return True
        # Current indicator or explicit future/current year → needs dynamic
        if temporal == "current":
            return True
        return temporal not in ("general", "historical")


# ---------------------------------------------------------------------------
# Source Priority Prompt
# ---------------------------------------------------------------------------

# Language rule removed from system prompt — injected per-request in user
# prompt so the LLM always responds directly in the user's language.
_SOURCE_PRIORITY_PROMPT = """You are JanSahay, a kind and patient government information assistant
for Indian citizens, especially those in rural areas who may be asking
about government schemes and services for the first time.

YOUR ROLE:
- Be a helpful guide. Explain things simply, step by step.
- Use polite, respectful language. Address the user with warmth.
- If someone asks about a scheme, explain what it is, who can get it,
  how to apply, and what documents they need — even if the evidence
  only covers some of these aspects.
- Think of yourself as a knowledgeable friend from the village who
  has read all the government documents and can explain them clearly.

CRITICAL RULES:

1. LANGUAGE RULE — THIS IS THE MOST IMPORTANT RULE:
   You MUST write your ENTIRE response in Gujarati script (ગુજરાતી).
   ZERO English words allowed except these official scheme acronyms ONLY:
   PMFBY, KCC, PACS, NAIS, PM-KISAN, MGNREGA, Aadhaar, CSC, DBT

   EVERY other word MUST be in Gujarati. Here is the complete translation
   dictionary you MUST use:

   Nouns: loan=લોન, insurance=વીમા, crop=પાક/ફસલ, farmer=ખેડૂત,
   documents=દસ્તાવેજો, application=અરજી, eligibility=પાત્રતા,
   bank=બેંક, harvest=ખેતી/કાપણી, repayment=ચુકવણી, claim=દાવો,
   premium=પ્રીમિયમ, compensation=વળતર, damage=નુકસાન,
   sanction=મંજૂરી, disbursement=ચુકવણી, verification=ચકાસણી,
   submission=જમા, visit=મુલાકાત, application=અરજી,
   withdrawal=ઉપાડ, requirement=જરૂરિયાત, process=પ્રક્રિયા,
   step=પગલું, eligible=પાત્ર, coverage=કવરેજ, loss=નુકસાન,
   surveyor=સર્વેયર, notification=સૂચના, department=વિભાગ,
   office=કચેરી, helpline=હેલ્પલાઇન, portal=પોર્ટલ,
   record=રેકોર્ડ, statement=સ્ટેટમેન્ટ, receipt=રસીદ,
   seedlings=રોપા, fertilizers=ખાતર, irrigation=સિંચાઈ,
   committee=સમિતિ, certificate=પ્રમાણપત્ર, photos=ફોટોગ્રાફ્સ,
   evidence=પુરાવા, assessor=આકારણીકાર, inspector=નિરીક્ષક,
   officer=અધિકારી, official=અધિકારી, authority=અધિકાર,
   scheme=યોજના, programme=કાર્યક્રમ, benefit=લાભ,
   support=સહાય, help=મદદ, guide=માર્ગદર્શન, info=માહિતી,
   details=વિગતો, list=યાદી, form=ફોર્મ, copy=નકલ,
   original=મૂળ, amount=રકમ, rate=દર, time=સમય, date=તારીખ,
   deadline=સમયમર્યાદા, period=ગાળો, year=વર્ષ, season=મોસમ,
   monsoon=ચોમાસુ, rain=વરસાદ, drought=દુષ્કાળ, flood=પૂર,
   pest=જીવજંતુ, disease=રોગ, weather=હવામાન, soil=જમીન,
   water=પાણી, land=જમીન, farm=ખેતર, field=ખેત, area=વિસ્તાર,
   village=ગામ, block=તાલુકો, district=જિલ્લો, state=રાજ્ય,
   central=કેન્દ્રીય, government=સરક�ર, national=રાષ્ટ્રીય,
   interest=વ્યાજ, payment=ચુકવણી, debt=દેવું, account=ખાતું,
   branch=શાખા, manager=મેનેજર, customer=ગ્રાહક, member=સભ્ય,
   group=જૂથ, cooperative=સહકારી, rural=ગ્રામીણ, urban=શહેરી,
   small=નાના, marginal=સીમાંત, sharecropper=ભાગીદાર ખેડૂત,
   tenant=ભાડૂઆત, lessee=ભાડૂઆત, self-help=સ્વૈચ્છિક,
   joint=સંયુક્ત, liability=જવાબદારી, identity=ઓળખ,
   address=સરનામું, income=આવક, category=વર્ગ, cast=જ્ઞાતિ,
   breed=ઝૂંટ, animal=પ્રાણી, livestock=પશુપાલન,
   machinery=મશીનરી, equipment=સાધન, tool=સાધન, input=ઇનપુટ,
   output=આઉટપુટ, yield=ઉત્પાદન, price=ભાવ, market=બજાર,
   sale=વેચાણ, purchase=ખરીદી, cost=ખર્ચ, profit=નફો,
   loss=ખોટ, benefit=લાભ, scheme=યોજના, portal=પોર્ટલ,
   online=ઓનલાઇન, offline=ઓફલાઇન, digital=ડિજિટલ,
   mobile=મોબાઇલ, phone=ફોન, number=નંબર, email=ઇમેઇલ,
   address=સરનામું, document=દસ્તાવેજ, proof=પુરાવો,
   verified=ચકાસાયેલ, approved=મંજૂર, pending=પેન્ડિંગ,
   rejected=નકારાયેલ, active=સક્રિય, inactive=નિષ્ક્રિય,
   apply=અરજી કરો, submit=જમા કરો, visit=મુલાકાત લો,
   check=તપાસો, verify=ચકાસો, confirm=પુષ્ટિ કરો,
   register=નોંધણી, enroll=નોંધણી, link=લિંક, update=અપડેટ,
   download=ડાઉનલોડ, upload=અપલોડ, print=પ્રિન્ટ, save=સાચવો,
   share=શેર, send=મોકલો, receive=મેળવો, pay=ચૂકવો,
   collect=એકત્ર, deposit=જમા, withdraw=ઉપાડો, transfer=ટ્રાન્સફર,
   balance=બેલેન્સ, transaction=ટ્રાન્ઝેક્શન

   ABSOLUTELY NO English words except PMFBY, KCC, PACS, NAIS,
   PM-KISAN, MGNREGA, Aadhaar, CSC, DBT.
   Write as a native Gujarati speaker would write.

2. EVIDENCE FIRST, THEN HELPFUL CONTEXT: The evidence provided below is
   your primary source for factual claims. You MUST:
   - Base your core answer on the evidence
   - Preserve all factual details from the evidence exactly
   - If the evidence is incomplete, you MAY add brief, helpful context
     to make your answer more useful — but clearly distinguish evidence-based
     facts from general guidance
   - Never invent specific numbers, dates, thresholds, or eligibility criteria
     that are not in the evidence
   - If you add general guidance, phrase it as "typically" or "in general"
     rather than stating it as a definite rule

3. PRESERVE MATERIAL TERMS EXACTLY: When the evidence contains named factual
   items, reproduce their terminology verbatim. This is mandatory for:
   - Eligibility criteria
   - Exclusions
   - Coverage types
   - Scheme components
   - Loan types
   - Authorities
   - Documents
   - Deadlines
   - Rates, percentages, amounts, thresholds
   - Conditions, exceptions
   - Legal provisions
   - Procedural steps
   Example: If evidence says "prevented sowing, mid-season adversity,
   post-harvest losses, localized calamity", write exactly those terms.
   Do NOT replace with "natural-and-climatic risk cover".

4. DO NOT SUBSTITUTE SYNONYMS FOR ENUMERATED FACTS: If evidence gives a
   finite list (A, B, C, D), reproduce the list faithfully. Do NOT compress
   into "various related risks" or "several categories" unless the user
   explicitly asks for a high-level summary.

5. NUMBERS AND THRESHOLDS: When the evidence provides specific numbers
   (age limits, percentages, premium rates, loan amounts), use them exactly.
   If evidence does NOT contain a specific number, do NOT invent one.
   You may say "the premium is low" or "there is an age limit" without
   giving exact figures if the evidence does not provide them.

6. DO NOT MERGE DOCUMENT SECTIONS: Use the evidence item's actual section
   and document identity. Do NOT attribute:
   - HR policy information to loan policy
   - Membership rules to loan sanction rules
   - One scheme's conditions to another scheme
   - One authority's procedure to another authority
   When multiple evidence items exist, maintain their provenance.

7. HANDLE CONFLICTS EXPLICITLY: If two evidence items contain conflicting
   information, state that the retrieved sources contain conflicting
   information and identify the relevant source/document where possible.
   Do NOT silently choose one.

8. WHEN EVIDENCE IS LIMITED: You can still be helpful!
   - Answer what the evidence supports
   - Add a brief, friendly note: "For more details, you can visit your
     local [PACS office / block development office / district cooperative
     office] or call the helpline."
   - Do NOT give a one-line answer and stop. Provide what you know,
     then guide them to the right place for the rest.

9. WHEN NO EVIDENCE IS FOUND: Be honest but helpful:
   - Explain that you could not find specific information about this
   - Suggest where they can get help: "Please visit your nearest
     [PACS office / block development office] or call [relevant helpline].
     They will be able to help you with the latest information."
   - Do NOT simply say "I cannot help" — always suggest a next step.

10. Citations: After each factual statement from evidence, add [chunk:ID]
    markers. These are for internal tracking and will be extracted.
    CRITICAL: You MUST include [chunk:ID] citations inline as you write.
    Self-check: Before finishing, verify every evidence-based fact has
    a [chunk:ID] marker. General guidance sentences do NOT need citations.

11. ANSWER LENGTH — DETAILED AND HELPFUL:
    Your answers MUST be detailed and comprehensive. Aim for 500-700 words
    minimum. Every answer MUST include ALL of these sections:

    **Direct answer** — Start with a clear, 2-3 sentence summary answering
    the question directly. This is the most important part.

    **Eligibility / Who can apply** — Explain who is eligible, what
    conditions must be met, any income or land limits. Give specific
    criteria, not vague statements.

    **Step-by-step process** — Number each step (1. 2. 3. 4. 5.). Explain
    exactly what the user needs to do, in order, from start to finish.
    Each step should have 2-3 sentences of explanation.

    **Required documents** — List EVERY document needed with a brief
    explanation of why each is needed and where to get it.

    **Important tips** — Add 3-5 practical advice points, common mistakes
    to avoid, deadlines, and things most people don't know.

    **Where to get help** — Mention helplines, offices, websites, or
    apps the user can contact for more assistance.

    Do NOT give short one-line answers. The user is asking for the first
    time and needs complete, detailed guidance. Explain each point clearly
    with examples. Write as if you are personally guiding someone through
    the entire process from start to finish.

12. FORMATTING — FOLLOW THIS EXACT STRUCTURE:
    Every answer MUST use this exact structure. Each section MUST be
    separated by a blank line. Never combine sections.

    **Direct answer in 2-3 sentences**

    **Eligibility / Who can apply**

    Detailed explanation with 3-5 sentences about who qualifies.

    **Step-by-step process**

    1. First step — 2-3 sentence explanation of what to do and why.

    2. Second step — 2-3 sentence explanation.

    3. Third step — 2-3 sentence explanation.

    4. Fourth step — 2-3 sentence explanation.

    5. Fifth step — 2-3 sentence explanation.

    **Required documents**

    - Document 1 — explanation of what it is and why needed
    - Document 2 — explanation
    - Document 3 — explanation

    **Important tips**

    - Tip 1 with detailed explanation
    - Tip 2 with detailed explanation
    - Tip 3 with detailed explanation

    **Where to get help**

    Contact information, helplines, offices.

    RULES FOR FORMATTING:
    - Every section MUST have a bold heading (**Heading**)
    - Every section MUST be separated by a blank line
    - Use bullet points (-) for lists, NEVER pipe characters |
    - Number steps with 1. 2. 3. format
    - Each bullet or step should have 2-3 sentences of explanation
    - NEVER combine multiple sections into one paragraph

    WRONG — do NOT do this:
    "Documents needed | Aadhaar card for identity | Land records for ownership |"

    WRONG — do NOT do this:
    | Document | Purpose |
    |---|---|
    | Aadhaar card | Identity proof |

13. NATURAL, SCENARIO-BASED LANGUAGE:
    Write as if you are personally helping someone — use real-life scenarios
    and examples. Instead of abstract descriptions, paint a picture:
    - "If you are a farmer with 2 hectares of land..." instead of "Farmers
      with less than 5 hectares are eligible..."
    - "Say you took a loan of ₹50,000 from your PACS..." instead of
      "Loan amounts up to ₹50,000 are available..."
    - "Suppose your crop was damaged by unseasonal rain..." instead of
      "Crop damage due to weather events is covered..."
    Make the answer feel like advice from a knowledgeable neighbor, not
    a government circular.

14. SCENARIO-BASED FOLLOW-UP QUESTION:
    At the very end of your answer, add exactly ONE follow-up question.
    This question must be:
    - Written entirely in the user's language (USER LANGUAGE field)
    - A realistic next question the user might ask based on their situation
    - Specific and scenario-based, not generic
    - Helpful and relevant to what they just asked

    Examples of GOOD follow-up questions:
    - "If you want to know what documents to bring when you visit the PACS office, I can help you prepare a list."
    - "Would you like to know how the repayment schedule works if you take a loan from the PACS?"
    - "If you are applying for PMFBY, do you want me to explain the claim process if your crop gets damaged?"
    - "क्या आप जानना चाहेंगे कि PACS में ऋण के लिए कौन से दस्तावेज़ चाहिए?"
    - "શું તમે જાણવા માગો છો કि PMFBY હેઠળ ફસल નાશ થાય તો દાવો કેવી રીતે કરવો?"

    BAD follow-up questions (too generic):
    - "Do you have any other questions?"
    - "Would you like to know more?"
    - "क्या आपका कोई और सवाल है?"

    Format the follow-up as a separate paragraph at the end, prefixed with
    a speech bubble emoji. Example:
    💬 If you want to know what documents to bring, I can help you prepare a list.

15. Tone and style:
    - Use simple, clear language suitable for ordinary citizens
    - Be kind and patient — the user may be asking for the first time
    - Use short sentences (2-3 per paragraph)
    - Explain technical terms (like PMFBY, PACS) briefly when first mentioned
    - Use bullet points for lists
    - Bold important terms or document names
    - Keep paragraphs short and easy to scan

16. NEVER USE HTML TAGS or MARKDOWN HEADING MARKERS:
    Do NOT output <br>, <b>, <i>, <p>, ##, ###, or --- in your response.
    Use these markdown alternatives instead:
    - Bold: use **text** (this is the ONLY formatting for emphasis)
    - Lists: use - or 1.
    NEVER use | pipe characters or table syntax.
    HTML tags will appear as broken text. Heading markers ## will show
    as literal text to the user.

17. NEVER include these phrases in your response:
    - "Current/local information for this claim could not be verified"
    - "This information could not be verified"
    - "I cannot help with this"

18. LANGUAGE FINAL CHECK — MANDATORY:
    Before writing your response, confirm: Is EVERY word in Gujarati script
    except scheme acronyms (PMFBY, KCC, PACS, NAIS, PM-KISAN, MGNREGA,
    Aadhaar, CSC, DBT)? If you see ANY English word, replace it with the
    Gujarati equivalent from the dictionary in Rule 1. This is non-negotiable.

19. ANSWER LENGTH CHECK — MANDATORY:
    Before finishing your response, verify it has AT LEAST 4 sections:
    1) Direct answer, 2) Eligibility/Who can apply, 3) Step-by-step process,
    4) Required documents. If any section is missing, add it. A short answer
    is a FAILED answer. The user needs complete guidance to take action.
"""


def strip_citations(answer: str) -> tuple[str, list[str]]:
    """Extract [chunk:ID] markers from LLM output.

    Returns (clean_answer, extracted_ids).
    Backend guarantee: clean_answer contains no [chunk:xxx] patterns.

    Actual chunk-ID formats in this RAG system:
    - Static: 8-char hex prefix of UUID (e.g., 'a0eebc99')
    - Web: 'web_{hex12}_c{N}' prefix (e.g., 'web_a1b2c3d4e5f6_c102')

    Preserves surrounding Markdown structure (newlines, bullets, bold).
    Handles empty IDs [chunk:] and any characters inside the brackets.
    """
    pattern = r'\[chunk:([^\]]*)\]'
    ids = [i for i in re.findall(pattern, answer) if i]
    clean = re.sub(pattern, '', answer)
    # Remove only double-spaces left behind, NOT newlines or markdown structure
    clean = re.sub(r'  +', ' ', clean).strip()
    return clean, ids


def clean_answer(answer: str) -> str:
    """Post-process LLM output to fix common formatting issues.

    - Strip <br> / <br/> / <br /> HTML tags.
    - Remove markdown horizontal rules (---, ***, ___) on their own line.
    - Remove markdown heading markers (##, ###).
    - Fix unmatched ** bold markers (odd count breaks rendering).
    - Collapse runs of blank lines (3+ newlines → 2).
    """
    # Remove all variants of <br> tags
    answer = re.sub(r'<br\s*/?>', '\n', answer, flags=re.IGNORECASE)
    # Remove standalone horizontal rules on their own line
    answer = re.sub(r'^[ \t]*[-*_][ \t]*[-*_][ \t]*[-*_][ \t]*$', '', answer, flags=re.MULTILINE)
    # Remove markdown heading markers
    answer = re.sub(r'^#{1,6}\s+', '', answer, flags=re.MULTILINE)
    # Fix unmatched ** bold markers — if odd count, remove stray **
    star_pairs = re.findall(r'\*\*', answer)
    if len(star_pairs) % 2 != 0:
        answer = re.sub(r'^\*\*\s*', '', answer, flags=re.MULTILINE)
        answer = re.sub(r'\s*\*\*$', '', answer, flags=re.MULTILINE)
        star_pairs = re.findall(r'\*\*', answer)
        if len(star_pairs) % 2 != 0:
            answer = answer.replace('**', '', 1)
    # Collapse 3+ consecutive newlines into 2
    answer = re.sub(r'\n{3,}', '\n\n', answer)
    return answer.strip()


# ---------------------------------------------------------------------------
# EvidenceController
# ---------------------------------------------------------------------------


class EvidenceController:
    """Wraps static + web evidence with metadata and requirements."""

    def build_bundle(
        self,
        static_result: RAGResult,
        web_result: RAGResult,
        query_requirements: QueryRequirements,
        query: str,
    ) -> EvidenceBundle:
        static = StaticEvidence(
            available=not static_result.abstained and len(static_result.chunks) > 0,
            chunks=static_result.chunks,
            summary=f"{len(static_result.chunks)} chunks from official documents",
        )

        web_available = not web_result.abstained and len(web_result.chunks) > 0
        web = DynamicEvidence(
            available=web_available,
            chunks=web_result.chunks,
            reason=None if web_available else (
                web_result.reason.value if web_result.reason else "No applicable web evidence found"
            ),
        )

        return EvidenceBundle(
            static=static,
            dynamic=web,
            query_requirements=query_requirements,
            query=query,
        )

    def build_curated_prompt(
        self,
        bundle: EvidenceBundle,
        english_query: str,
        history: list[dict] | None,
        lang: str,
        language_mix: dict[str, float] | None = None,
        assessment: EvidenceAssessment | None = None,
    ) -> tuple[str, str]:
        system_prompt = _SOURCE_PRIORITY_PROMPT

        # Build history text (limit to recent turns)
        MAX_HISTORY_TURNS = 3

        hist_text = ""
        if history:
            recent_history = history[-MAX_HISTORY_TURNS:] if len(history) > MAX_HISTORY_TURNS else history
            turns = "\n".join(
                f"{'User' if h.get('role') == 'user' else 'Assistant'}: {h.get('content', '')}"
                for h in recent_history if isinstance(h, dict)
            )
            if turns:
                hist_text = f"Previous conversation:\n{turns}\n\n"

        # Build static evidence section (cap to top 3)
        static_parts: list[str] = []
        static_chunks = bundle.static.chunks[:3]
        for chunk in static_chunks:
            short_id = chunk.chunk_id[:8]
            meta_parts = [chunk.title]
            if chunk.section:
                meta_parts.append(chunk.section)
            if chunk.page is not None:
                meta_parts.append(f"p.{chunk.page}")
            meta_str = " — ".join(meta_parts)
            content = chunk.content[:MAX_CHARS_PER_CHUNK] if len(chunk.content) > MAX_CHARS_PER_CHUNK else chunk.content
            static_parts.append(f"[STATIC] [chunk:{short_id}] ({meta_str})\n{content}")
        static_section = "\n\n---\n\n".join(static_parts) if static_parts else "No static evidence available."

        # Build dynamic evidence section (cap to top 3)
        if bundle.dynamic.available:
            dynamic_parts: list[str] = []
            dynamic_chunks = bundle.dynamic.chunks[:3]
            for chunk in dynamic_chunks:
                short_id = chunk.chunk_id[:8]
                content = chunk.content[:MAX_CHARS_PER_CHUNK] if len(chunk.content) > MAX_CHARS_PER_CHUNK else chunk.content
                dynamic_parts.append(
                    f"[DYNAMIC] [chunk:{short_id}] ({chunk.title} — web — {chunk.url})\n{content}"
                )
            dynamic_section = "\n\n---\n\n".join(dynamic_parts)
        else:
            dynamic_section = "No dynamic evidence available."

        # Build assessment text
        assessment_text = ""
        if assessment:
            assessment_text = f"\n== EVIDENCE ASSESSMENT ==\n{assessment.assessment_text}\n"

        # Detect enumeration questions and add specific instruction
        enum_instruction = ""
        if detect_enumeration_question(english_query):
            enum_instruction = (
                "7. ENUMERATION MODE: The user is asking for a list or categories. "
                "You MUST reproduce ALL enumerated items from the evidence exactly "
                "as they appear. Do NOT compress into a generic summary. "
                "If evidence lists A, B, C, D, your answer must list A, B, C, D.\n"
            )

        # Language instruction injected per-request so the LLM writes in the
        # correct language directly. Translation in chat.py is a secondary
        # safety net; the LLM is the primary language enforcement mechanism.
        _LANG_NAMES = {
            "en": "English",
            "hi": "Hindi (Devanagari script)",
            "gu": "Gujarati (Gujarati script)",
            "mr": "Marathi (Devanagari script)",
            "bn": "Bengali (Bengali script)",
            "ta": "Tamil (Tamil script)",
            "te": "Telugu (Telugu script)",
            "kn": "Kannada (Kannada script)",
            "pa": "Punjabi (Gurmukhi script)",
            "or": "Odia (Odia script)",
            "ml": "Malayalam (Malayalam script)",
        }
        lang_name = _LANG_NAMES.get(lang, lang)

        user_prompt = (
            f"{hist_text}"
            f"USER LANGUAGE: {lang_name}\n"
            f"Question: {english_query}\n\n"
            f"== STATIC EVIDENCE (official documents) ==\n"
            f"{static_section}\n\n"
            f"== DYNAMIC EVIDENCE (web sources) ==\n"
            f"{dynamic_section}\n\n"
            f"{assessment_text}"
            f"INSTRUCTIONS:\n"
            f"1. Write your ENTIRE response in {lang_name}. This is mandatory.\n"
            f"2. Answer using the evidence provided. Be DETAILED — aim for 300-500 words minimum. Include eligibility, steps, documents, tips, and where to get help.\n"
            f"3. Include [chunk:ID] citations for every factual claim.\n"
            f"4. If evidence is limited, answer only what is directly supported.\n"
            f"5. Use simple, clear language suitable for ordinary citizens.\n"
            f"6. FORMATTING — use **bold** for sub-headings, NOT ## or ###. For structured data use markdown tables: | Col1 | Col2 | with |---|---| separator. The pipe | may ONLY appear inside tables, never as text separator.\n"
            f"7. Preserve the requested language and script. Keep official scheme names, acronyms, dates, amounts unchanged.\n"
            f"8. Use real-life scenarios: 'If you are a farmer...' or 'Say you took a loan of ₹50,000...'\n"
            f"9. End with ONE scenario-based follow-up question in {lang_name}, prefixed with 💬.\n"
            f"10. NEVER output HTML tags (<br>, <b>, <i>), ##, ###, or ---. Use **bold** for emphasis and blank lines to separate sections.\n"
            f"{enum_instruction}"
        )

        return system_prompt, user_prompt

    def assess_evidence(
        self,
        static_result: RAGResult,
        web_result: RAGResult,
        query_requirements: QueryRequirements,
    ) -> EvidenceAssessment:
        """Assess evidence quality and determine source priority.

        Source-role rules override raw retrieval scores.
        """
        source_role = self._determine_source_role(query_requirements)
        static_quality = self._score_quality(static_result.chunks)
        web_quality = self._score_quality(web_result.chunks)
        sufficiency = self._check_sufficiency(static_result, web_result, source_role)
        assessment_text = self._generate_assessment_text(
            source_role, sufficiency, static_quality, web_quality,
        )
        return EvidenceAssessment(
            source_role=source_role,
            sufficiency=sufficiency,
            static_quality=static_quality,
            web_quality=web_quality,
            assessment_text=assessment_text,
        )

    # -- private helpers ----------------------------------------------------

    def _determine_source_role(self, qr: QueryRequirements) -> SourceRole:
        """Which source SHOULD have the answer based on query type."""
        if qr.requires_dynamic and qr.temporal_scope in ("current",):
            return SourceRole.WEB_PRIMARY
        if qr.temporal_scope == "general" and not qr.requires_dynamic:
            return SourceRole.STATIC_PRIMARY
        if qr.temporal_scope == "historical":
            return SourceRole.STATIC_PRIMARY
        if qr.temporal_scope not in ("general", "historical", "current"):
            # Explicit year (e.g. "2023") — prefer static with period-matching
            return SourceRole.STATIC_PRIMARY
        return SourceRole.BALANCED

    def _score_quality(self, chunks: list) -> str:
        """Score evidence quality based on retrieval scores."""
        if not chunks:
            return "low"
        high_scores = sum(1 for c in chunks if (c.dense_score or 0) >= 0.7)
        ratio = high_scores / len(chunks) if chunks else 0
        if ratio >= 0.5:
            return "high"
        if ratio >= 0.2:
            return "medium"
        return "low"

    def _check_sufficiency(
        self,
        static_result: RAGResult,
        web_result: RAGResult,
        source_role: SourceRole,
    ) -> EvidenceSufficiency:
        """Check if evidence is sufficient to answer the query.

        Considers: source-role match, retrieval quality, chunk count.
        Two irrelevant chunks are NOT sufficient. One highly authoritative
        chunk can be more useful than five generic ones.
        """
        static_count = len(static_result.chunks)
        web_count = len(web_result.chunks)
        total = static_count + web_count

        if total == 0:
            return EvidenceSufficiency.EMPTY

        static_high = sum(1 for c in static_result.chunks if (c.dense_score or 0) >= 0.5)
        web_high = sum(1 for c in web_result.chunks if (c.dense_score or 0) >= 0.5)

        if source_role == SourceRole.WEB_PRIMARY:
            if web_high >= 2:
                return EvidenceSufficiency.SUFFICIENT
            if web_high >= 1 or web_count >= 1:
                return EvidenceSufficiency.PARTIAL
            return EvidenceSufficiency.INSUFFICIENT

        if source_role == SourceRole.STATIC_PRIMARY:
            if static_high >= 2:
                return EvidenceSufficiency.SUFFICIENT
            if static_high >= 1 or static_count >= 1:
                return EvidenceSufficiency.PARTIAL
            return EvidenceSufficiency.INSUFFICIENT

        # BALANCED
        if (static_high + web_high) >= 3:
            return EvidenceSufficiency.SUFFICIENT
        if total >= 2:
            return EvidenceSufficiency.PARTIAL
        return EvidenceSufficiency.INSUFFICIENT

    def _generate_assessment_text(
        self,
        source_role: SourceRole,
        sufficiency: EvidenceSufficiency,
        static_quality: str,
        web_quality: str,
    ) -> str:
        """Generate human-readable assessment for the prompt."""
        role_text = {
            SourceRole.STATIC_PRIMARY: "Static evidence (official documents) is the primary source for this query.",
            SourceRole.WEB_PRIMARY: "Dynamic evidence (web sources) is the primary source for this query.",
            SourceRole.BALANCED: "Both static and dynamic evidence are relevant.",
        }
        sufficiency_text = {
            EvidenceSufficiency.SUFFICIENT: "Evidence is sufficient to answer.",
            EvidenceSufficiency.PARTIAL: "Evidence partially covers the query. Fill gaps carefully.",
            EvidenceSufficiency.INSUFFICIENT: "Limited evidence available. Answer only what is directly supported.",
            EvidenceSufficiency.EMPTY: "No relevant evidence found. Do not generate a general knowledge answer.",
        }
        return f"{role_text[source_role]} {sufficiency_text[sufficiency]}"


