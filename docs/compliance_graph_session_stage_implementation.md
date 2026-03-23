# Compliance Graph Session Stage Implementation (Agent-Orchestrated POC)

## 1) Purpose and Direction

This stage implements the **contextualization runtime** as an **agent-orchestrated loop** over the master graph:

- start with full master graph scope
- collect user context through graph-backed questions
- apply deterministic reductions on session state
- progressively narrow to the active requirement subgraph

The primary contract is **chat context mode** (`/chat`, streamed UI), not a frontend-controlled session endpoint workflow.

This aligns with:

- `docs/compliance_graph_concept.md` (norm -> context -> action)
- `docs/compliance_graph_neo4j_schema.md` (master + session layers)
- current task-mode architecture (`client/components/chat-interface.tsx`, `server/app/chat/router.py`)

---

## 2) Key Clarification (Frontend vs Backend Control)

Frontend does **not** decide compliance logic.

Frontend only submits **user interaction payload** (what the user selected/entered) and renders server-streamed JSX.

Backend orchestrator is authoritative for:

- selecting the next question
- normalizing and interpreting answers
- applying `INFLUENCES` rules
- materializing `EXCLUDES` session state
- recomputing active subgraph and completion state

---

## 3) Scope

In scope:

- Session graph runtime entities:
  - `Session`
  - `Answer`
  - `SCOPES`, `SUBMITTED`, `FOR_QUESTION`, `EXCLUDES`
- Agent orchestration service used by `/chat` in `taskMode=context`
- Deterministic answer-application over `INFLUENCES`
- Deterministic next-question selection based on active scope impact
- Streamed JSX question cards from backend
- Final context-aware advisory response once question phase is complete

Out of scope:

- LLM-driven applicability decisions
- probabilistic/hidden routing
- autonomous rule learning
- full recommendation ontology expansion (`Interpretation`, `RecommendedAction`) in this stage

Architectural invariants:

- master graph immutable for normative truth
- session graph contains only runtime state
- applicability behavior deterministic, testable, traceable
- frontend is transport/render layer, not rule engine

---

## 4) Current Drift to Correct

1. Existing context flow is a hardcoded NIS-2 step wizard in backend logic and fixed JSX.
2. Question progression is controlled by step counters (`submittedStep`) rather than graph state.
3. Frontend holds domain state coupled to a specific NIS-2 questionnaire.
4. Session doc framed public endpoints as primary driver, while product interaction is chat-first.

Target correction:

- move from fixed-step questionnaire control to graph-driven question orchestration
- keep chat UX and JSX streaming infrastructure
- keep deterministic runtime in backend orchestration layer

---

## 5) Target Architecture (Holistic)

### 5.1 Layers

1. **Master layer** (already present): `NormativeDocument`, `Clause`, `NormativeChunk`, `RequirementUnit`, `DiagnosticQuestion`, `INFLUENCES`
2. **Session layer** (this stage): `Session`, `Answer`, `EXCLUDES` (plus scope links)
3. **Orchestrator layer** (this stage): deterministic runtime service invoked by chat context mode
4. **UI layer** (reuse existing): streamed JSX renderer and input capture

### 5.2 Runtime Ownership

- **Chat router** delegates context turns to compliance orchestrator
- **Orchestrator** executes state transitions and returns next render payload
- **Frontend** sends user input payload and displays returned JSX/content

---

## 6) Session Data Model (POC)

### 6.1 Nodes

#### `Session`

- `session_id` (unique)
- `conversation_id` (chat-level stable mapping key)
- `language` (UI preference metadata)
- `created_at`
- `status` (`active` | `closed`)

#### `Answer`

- `answer_id` (`session_id::question_key`)
- `value_json` (raw submitted payload JSON)
- `normalized_value_json` (deterministic normalized representation)
- `answered_at`

### 6.2 Relationships

- `(:Session)-[:SCOPES]->(:NormativeDocument)`
- `(:Session)-[:SUBMITTED]->(:Answer)`
- `(:Answer)-[:FOR_QUESTION]->(:DiagnosticQuestion)`
- `(:Session)-[:EXCLUDES {source_question_key, updated_at}]->(:RequirementUnit)`

### 6.3 Idempotency

Use `MERGE` on:

- `Session.session_id`
- `Answer.answer_id`
- `SCOPES`, `SUBMITTED`, `FOR_QUESTION`
- `EXCLUDES` (with re-answer replacement semantics per question)

Constraints:

```cypher
CREATE CONSTRAINT session_session_id_unique IF NOT EXISTS
FOR (s:Session) REQUIRE s.session_id IS UNIQUE;

CREATE CONSTRAINT answer_answer_id_unique IF NOT EXISTS
FOR (a:Answer) REQUIRE a.answer_id IS UNIQUE;
```

---

## 7) Primary Contract: Chat Context Turn

Context mode remains on `POST /chat` and is processed as a stateful turn.

### 7.1 Request semantics (conceptual)

- `taskMode = "context"`
- optional `contextSession`:
  - `session_id` (if existing)
  - `standard_keys` (required at bootstrap)
  - `answer` payload (question key + user input)

### 7.2 Response semantics (streamed)

Server streams one of:

1. **Next question JSX card** + metadata
2. **Completion/advisory response** based on active subgraph
3. **Deterministic validation feedback** if payload invalid

### 7.3 Why no frontend business control

Frontend only forwards user input event from UI controls.  
Backend performs all graph/rule transitions.

---

## 8) JSX Rendering Reliability Contract

Question streaming must be reliable and deterministic even when LLM output quality varies.

### 8.1 Authoritative JSX producer

- Question JSX is always produced by a backend utility (for example `build_question_jsx`).
- The utility is called whenever orchestrator selects a question.
- LLM output is never used directly as JSX for question cards.

### 8.2 Input model for renderer

Renderer input is a strict structured object derived from `DiagnosticQuestion`:

- `question_key`
- `prompt`
- `answer_type`
- `allowed_values`
- `language`
- optional UI hints (for example `help_text`, `placeholder`)

This input is validated before JSX generation.

### 8.3 Output model for stream

Prefer one stable JSX shell with encoded payload:

- `<CtxQuestionCard payloadB64="..."/>`

The payload contains the validated structured question object.  
This keeps streamed JSX shape stable and avoids escaping problems from arbitrary prompt text.

### 8.4 Backend guarantees before streaming

- `answer_type` must be one of supported UI types.
- `allowed_values` required for choice types.
- empty/invalid prompt rejected.
- if validation fails, send deterministic fallback message (text response), not broken JSX.

### 8.5 Frontend contract

- Frontend provides a stable `CtxQuestionCard` component in JSX parser map.
- Component decodes payload and renders controls by `answer_type`.
- Component submits structured interaction payload back to backend; no rule logic in UI.

### 8.6 Why this is required

- avoids known pydantic/LLM JSX wrapping instability
- prevents malformed JSX from dynamic text content
- keeps transport robust with existing streaming parser safeguards

---

## 9) Orchestration State Machine

For each context turn:

1. **BOOTSTRAP**
   - resolve/create session by conversation id
   - ensure scope (`SCOPES`) exists
2. **APPLY_ANSWER** (if input present)
   - validate question is in scope and active
   - normalize answer
   - upsert `Answer`
   - apply `INFLUENCES`
   - re-materialize question-owned `EXCLUDES`
3. **RECOMPUTE**
   - derive active requirement set
   - derive per-requirement session state (`open` | `addressed` | `gap` | `not_applicable` | `unclear`)
   - derive answered/unanswered question set
   - derive todo/progress counters (remaining open requirements, open critical requirements, unanswered high-impact questions)
4. **SELECT_NEXT**
   - deterministic impact-aware question ranking
5. **EMIT**
   - stream next question card JSX or final advisory output

No LLM call is required for state transitions.  
LLM is optional for natural-language explanation in final/advisory responses.

---

## 10) Deterministic Rule Application

### 10.1 Answer normalization

- booleans -> `"true"` / `"false"`
- numbers -> canonical string
- strings -> trimmed lower-case
- lists -> normalized list values

Persist both raw and normalized forms.

### 10.2 Influence modes (POC)

For `(q)-[inf:INFLUENCES]->(ru)`:

- `exclude_if`: match => add `EXCLUDES`
- `include_if`: no-match => add `EXCLUDES`; match => do not exclude
- `prioritize_if`: match => metadata counter only (no write yet)
- `unclear_if`: match => metadata counter only (no write yet)

### 10.3 Re-answer behavior

On new answer for same `question_key`:

- remove old exclusions from that question
- recompute exclusions for current value
- remove or overwrite old requirement-state effects from that question
- recompute requirement-state effects for current value
- keep exclusions from other questions
- keep requirement-state effects from other questions

### 10.4 Requirement completion semantics (POC)

The session runtime must not only shrink applicability scope; it must also track **work closure**.

For each active `RequirementUnit` in a session, maintain exactly one derived session state:

- `open`: relevant, unresolved, still to be clarified or implemented
- `addressed`: answer(s) indicate requirement is currently fulfilled/covered
- `gap`: answer(s) indicate requirement is currently not fulfilled or missing evidence
- `not_applicable`: requirement excluded by deterministic applicability logic
- `unclear`: conflicting or insufficient information after normalization/rules

State transitions are deterministic and rule-driven from answer effects, never LLM-authored.

### 10.5 Influence modes for closure

In addition to scope modes, support requirement-closure effects:

- `satisfies_if`: match => set RU state to `addressed`
- `gaps_if`: match => set RU state to `gap`
- `unclear_if`: match => set RU state to `unclear`
- `exclude_if` / `include_if`: continue to drive `not_applicable` via `EXCLUDES`

If multiple matched influences target the same RU in one recompute cycle, apply deterministic precedence:

1. `not_applicable` (from exclusion logic)
2. `gap`
3. `unclear`
4. `addressed`
5. fallback `open`

Precedence and tie-breaking are fixed and test-covered.

### 10.6 Session completion criteria (POC)

A context session is considered operationally complete when both are true:

1. no unanswered high-impact questions remain for active scope
2. no active requirement remains in `open` state

Completion output must expose:

- `requirements_total`
- `requirements_open`
- `requirements_addressed`
- `requirements_gap`
- `requirements_not_applicable`
- `requirements_unclear`
- optional completion ratio and critical-open count

This turns session state into an actionable **compliance to-do list** and enables “zero open items” checks.

---

## 11) Next Question Selection Policy (Deterministic)

Selection candidates:

- unanswered questions in session scope
- influencing at least one currently active requirement

Ranking (deterministic):

1. highest impacted active RU count
2. explicit sequence (`FOLLOWS.order`) if present
3. lexical `question_key` tie-break

This keeps behavior testable while moving beyond naive alphabetical-only flow.

---

## 12) Frontend Integration Plan (Reuse Existing)

Reuse:

- `client/components/chat-interface.tsx` context mode stream handling
- JSX rendering stack (`jsx-preview`, `context-mode-jsx`)

Refactor:

- replace NIS2-specific wizard state as control source
- keep local state only for transient control input
- submit structured interaction payload to backend per card action
- replace fixed step components with a generic `CtxQuestionCard` renderer fed by backend payload

Target FE responsibility:

- render server-sent question cards
- collect user interaction
- send payload
- render next streamed response

---

## 13) Backend Integration Plan (Reuse Existing)

Reuse:

- `server/app/chat/router.py` context branch and SSE streaming
- `server/app/compliance_graph` Neo4j access patterns and schema

Refactor:

- replace fixed `resolve_context_mode` step routing in context flow
- add orchestration service (e.g. compliance context orchestrator)
- move session operations into orchestrator-backed methods
- add backend JSX question builder utility (`DiagnosticQuestion` -> validated JSX card)
- enforce fallback-to-text behavior when JSX builder validation fails

Keep:

- ingestion endpoint unchanged (`/api/compliance-graph/ingest`)
- master graph semantics unchanged

---

## 14) Optional Internal/Debug Endpoints

Session endpoints may still exist for diagnostics and manual QA, but are not the primary product flow:

- create/read session snapshot
- inspect next-question candidate ranking
- inspect active subgraph for a session

These endpoints must execute the same orchestrator logic (no divergence from chat path).

---

## 15) Validation and Observability

Per turn log:

- `session_id`, `question_key`
- normalized answer
- influences evaluated/matched
- exclusions added/removed
- requirement-state effects added/removed
- active requirements delta
- requirement-state delta (open/addressed/gap/not_applicable/unclear)
- progress counters after recompute
- selected next question and rank basis
- JSX build status (`ok` | `fallback`) and reason code

Cypher validation should confirm:

- session scope integrity
- answer linkage
- exclusion traceability by question
- active RU count monotonic behavior across deterministic exclusions
- requirement-state traceability by question and answer replay
- exactly one effective session state per active RU

---

## 16) Rollout Steps

1. Add/adjust session schemas for orchestrator input/output.
2. Implement orchestrator methods:
   - resolve/create session by conversation
   - apply answer and materialize exclusions
   - apply answer and materialize requirement-state effects
   - compute active subgraph and question candidates
   - compute todo/progress counters
   - select next question deterministically
3. Implement backend JSX renderer utility:
   - strict question input validation
   - `DiagnosticQuestion` -> `CtxQuestionCard` JSX output
   - deterministic fallback response for invalid render inputs
4. Wire `/chat` context branch to orchestrator and JSX renderer utility.
5. Keep streamed JSX output contract; replace fixed NIS2 step content with graph-backed question cards.
6. Refactor frontend context controls to submit generic interaction payloads.
7. Add `CtxQuestionCard` to frontend JSX component registry with typed payload decode.
8. Add deterministic tests for:
   - same answer replay
   - re-answer replacement
   - requirement-state precedence and overwrite behavior
   - completion criteria (`open` count and unanswered-impact count)
   - question selection tie-break behavior
   - cross-standard session scope
   - JSX builder validity/fallback behavior
9. Add manual smoke flow:
   - bootstrap context chat
   - answer several questions
   - verify active subgraph narrows
   - verify JSX question cards render for all answer types
   - verify fallback behavior on intentionally invalid question data
   - reach final advisory output

---

## 17) POC Acceptance Criteria

This stage is done when:

- context mode is chat-driven and graph-backed (not hardcoded step wizard logic)
- frontend does not own applicability logic
- backend deterministically updates session graph on each answer
- backend deterministically updates requirement completion state per active requirement
- next question is selected from graph influence and active scope
- each selected question is rendered via backend JSX utility (or explicit deterministic fallback)
- session can be resumed with stable state across turns
- final output reflects narrowed active requirement subgraph
- completion/progress metrics expose remaining to-do scope explicitly

The resulting system now matches the concept objective:  
**initialize from full master graph and iteratively narrow through user answers under backend-controlled orchestration.**
