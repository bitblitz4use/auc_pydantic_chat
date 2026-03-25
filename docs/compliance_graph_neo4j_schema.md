# Compliance graph — Neo4j schema (full POC)

**Document purpose:** One **Neo4j** model that supports the **end-to-end loop** in [`compliance_graph_concept.md`](compliance_graph_concept.md): master normative knowledge → **diagnostic questions** → **answers** → **session state** → narrowed query / advisory view — without overbuilding infrastructure. Ingestion follows [`compliance_graph_docling_neo4j_implementation.md`](compliance_graph_docling_neo4j_implementation.md).

**Main aim (never optional):** Norm → context → action ([concept §1](compliance_graph_concept.md)); questions are **graph-level operators** ([concept §8](compliance_graph_concept.md)); master stays **stable**, session holds **operational state** ([concept §4, §10](compliance_graph_concept.md)).

**Implementation order (staging):** Ship **1 → 2 → 3 → 4** in engineering; the **schema already lists every label** needed so the product story does not change mid-flight.

| Stage | What you build | Unlocks |
|-------|----------------|---------|
| **1** | Ingest: `NormativeDocument`, `Clause`, `NormativeChunk` | Traceable text in the graph |
| **2** | `RequirementUnit` + links to clauses | Atomic obligations for rules |
| **3** | `DiagnosticQuestion` + `INFLUENCES` (and optional `TopicBlock` / `EvidenceType`) | Server-driven Q&A tied to requirements |
| **4** | `Session` + `Answer` + `EXCLUDES` / facts | Answers change what the graph “means” for this org |

Cross-norm (standard ↔ law) links are **Stage 2b** when you have curated edges — same schema, separate data load.

---

## 1. One structural convention (no parallel options)

**Clause model:** A **tree** of `Clause` nodes under `NormativeDocument`: `(:NormativeDocument)-[:HAS_CHILD {order}]->(:Clause)` and `(:Clause)-[:HAS_CHILD {order}]->(:Clause)`. **Leaf** clauses attach **chunks** via `[:HAS_CHUNK]`.

**Why one tree:** Matches [concept §9.1](compliance_graph_concept.md) (chapter / section / clause) and keeps `clause_path` (e.g. `4/4.1` or `§ 5`) unique per document.

**Chunks:** `(:Clause)-[:HAS_CHUNK {order}]->(:NormativeChunk)`. **HierarchicalChunker only** for POC; `chunk_key = standard_key + "::" + clause_id + "::" + ordinal` (ordinal = 0 if single chunk per leaf clause). If you ever split oversized text, set `part_index` on `NormativeChunk` and include it in `chunk_key`.

---

## 2. Ingestion subprocess (Docling → Neo4j)

Same pipeline as [implementation §7](compliance_graph_docling_neo4j_implementation.md): **convert → chunk → filter → map → persist** (Neo4j Python driver, `MERGE` on keys).

```text
CONVERT   → DoclingDocument
CHUNK     → HierarchicalChunker + contextualize(chunk)
FILTER    → blocklist headings (TOC / Inhaltsverzeichnis / …) + normative_start + OCR/length gates; see below
MAP       → MERGE NormativeDocument; MERGE Clause path; MERGE NormativeChunk; HAS_CHILD / HAS_CHUNK
PERSIST   → write transaction(s)
ENRICH    → separate jobs: RequirementUnit, questions, topics (not blocking ingestion)
```

**FILTER (POC):** Skip chunks whose headings match **config regex / blocklist** (e.g. `Inhaltsverzeichnis`, `Table of contents`) so TOC is **not** merged as `Clause`. Optionally skip everything **before** `normative_start` (first real `§` / section id). **Language:** one authoritative language per `NormativeDocument`; chunks inherit — no mixed-language chunk text in POC ([implementation §2.2](compliance_graph_docling_neo4j_implementation.md)). **Lay summaries / examples** for users are **advisory** in [concept §9.1](compliance_graph_concept.md), not part of verbatim ingestion ([implementation §2.3](compliance_graph_docling_neo4j_implementation.md)).

---

## 3. Master graph — normative & advisory definitions

### 3.1 `(:NormativeDocument)`

| Property | Type | Notes |
|----------|------|--------|
| `standard_key` | string | **UNIQUE** MERGE key, e.g. `ISO9001:2015:de` or `AT-BGBl-II:AStV:2026-03-23` |
| `title` | string | |
| `source_kind` | string | `standard` \| `statute` \| `regulation` |
| `language` | string | e.g. `de` |
| `version_label` | string | Edition / year / “Fassung vom …” |
| `jurisdiction` | string | e.g. `AT` for AStV; omit or `INTL` for ISO |
| `source_hash` | string | Optional audit hash of source file |

### 3.2 `(:Clause)`

| Property | Type | Notes |
|----------|------|--------|
| `clause_id` | string | **UNIQUE** with document: `standard_key + "/" + normalized_path` |
| `clause_path` | string | Human-readable: `4/4.1`, `§ 5`, etc. |
| `heading_text` | string | From Docling / heading |

### 3.3 `(:NormativeChunk)`

| Property | Type | Notes |
|----------|------|--------|
| `chunk_key` | string | **UNIQUE** |
| `text_contextualized` | string | Primary text for RAG / review ([Docling contextualize](https://docling-project.github.io/docling/concepts/chunking/)) |
| `text_raw` | string | Optional |

### 3.4 `(:RequirementUnit)`

Atomic obligations ([concept §5](compliance_graph_concept.md)); hub for edges from questions and topics.

| Property | Type | Notes |
|----------|------|--------|
| `ru_key` | string | **UNIQUE** |
| `statement` | string | Curated obligation text |
| `status` | string | `draft` → `reviewed` → `published` (orchestrator uses `published` for production rules) |
| `title` | string | Short label |

**Edges:** `(:Clause)-[:CONTAINS_REQUIREMENT]->(:RequirementUnit)` ([concept §9.2](compliance_graph_concept.md)).  
Provenance: `(:NormativeChunk)-[:SOURCE_FOR]->(:RequirementUnit)` so every obligation traces to text.

### 3.5 `(:TopicBlock)` and `(:EvidenceType)` (minimal)

| Label | Use |
|-------|-----|
| `TopicBlock` | Grouping for reduction / UI ([concept §9.1](compliance_graph_concept.md)) |
| `EvidenceType` | Evidence expectations |

**Edges:** `(:RequirementUnit)-[:BELONGS_TO_TOPIC]->(:TopicBlock)`, `(:RequirementUnit)-[:VERIFIED_BY]->(:EvidenceType)`.

### 3.6 `(:DiagnosticQuestion)` — required for the Q&A agent

Questions **live in the graph** ([concept §8](compliance_graph_concept.md)); the server selects the next question and persists answers against **session** (below).

| Property | Type | Notes |
|----------|------|--------|
| `question_key` | string | **UNIQUE** stable id, e.g. `org.multiple_sites` |
| `prompt` | string | Text shown to user |
| `answer_type` | string | `boolean` \| `single_choice` \| `multi_choice` \| `text` |
| `allowed_values` | list | Optional; for choice types |

**Edges to requirements (concept §8.1, §9.2):**

- `(:DiagnosticQuestion)-[:INFLUENCES { mode, when_value }]->(:RequirementUnit)`  
  - **`mode`:** `exclude_if` \| `include_if` \| `prioritize_if` \| `unclear_if` (start with `exclude_if` / `include_if` for POC).  
  - **`when_value`:** JSON-serialized value that must match the user’s answer for this edge to apply (e.g. `"false"`, `"yes"`).  

Reuse one question across standards by linking **INFLUENCES** to many `RequirementUnit` nodes ([concept §8.1](compliance_graph_concept.md)).

**Question order:** `(:DiagnosticQuestion)-[:FOLLOWS {order}]->(:DiagnosticQuestion)` when more than one question exists in a flow.

### 3.7 Cross-norm links (standard ↔ law)

When curated ([concept discussion](compliance_graph_concept.md)):  
`(:RequirementUnit)-[:ADDRESSES_LEGAL_OBLIGATION { provenance_type, provenance_ref, confidence }]->(:RequirementUnit)`  
Target RU sits under a **law** `NormativeDocument`. No automatic inference without provenance.

---

## 4. Session graph — answers change the active view

Keeps **master** immutable; session stores **what we know about this org** ([concept §4, §10](compliance_graph_concept.md)).

### 4.1 `(:Session)`

| Property | Type | Notes |
|----------|------|--------|
| `session_id` | string | **UNIQUE** |
| `created_at` | datetime | |
| `label` | string | Optional human name |

### 4.2 `(:Answer)`

One row per question answered in a session (simplest normalized shape).

| Property | Type | Notes |
|----------|------|--------|
| `answer_id` | string | **UNIQUE** or use composite uniqueness below |
| `value_json` | string | Normalized answer (JSON string for booleans / enums) |
| `answered_at` | datetime | |

**Edges:** `(:Session)-[:SUBMITTED]->(:Answer)`, `(:Answer)-[:FOR_QUESTION]->(:DiagnosticQuestion)`.

### 4.3 Requirement state in session (to-do semantics)

Applicability reduction alone is not enough for operational guidance.  
The session layer must track requirement closure state so the runtime acts as a to-do engine.

Recommended POC shape (materialized):

- `(:Session)-[:HAS_STATE {state, source_question_key, updated_at}]->(:RequirementUnit)`

Where `state` is one of:

- `open`
- `addressed`
- `gap`
- `not_applicable`
- `unclear`

Runtime invariant: at most one effective `HAS_STATE` per `(session_id, ru_key)` after each recompute cycle.

`source_question_key` stores traceability for the last state-changing answer effect.

### 4.4 Applying answers (orchestrator)

From `Session` + `Answer` + `INFLUENCES`, compute:

- **excluded / active** `RequirementUnit` keys
- **effective requirement state** for each active requirement

Then either:

- **Materialize:** `(:Session)-[:EXCLUDES]->(:RequirementUnit)` and `[:PRIORITIZES]->` after each answer, **or**
- **Query-time:** pass `$excluded_ru_keys` / `$active_only` from application layer into Cypher `WHERE`.

POC should start with **materialized** `EXCLUDES` and `HAS_STATE` for easy Cypher debugging and auditability.

---

## 5. Worked examples (same schema, two documents)

### 5.1 ISO 9001 — `converted_iso9001.md` style

| Node | Example values |
|------|----------------|
| `NormativeDocument` | `standard_key = "ISO9001:2015:de"`, `source_kind = "standard"`, `title = "ÖNORM EN ISO 9001"`, `version_label = "2015"` |
| `Clause` (path `4`) | `clause_path = "4"`, `heading_text = "Kontext der Organisation"` |
| `Clause` (child) | `clause_path = "4/4.1"`, `heading_text = "Verstehen der Organisation und ihres Kontextes"` |
| `NormativeChunk` | Under `4/4.1`, `text_contextualized` contains *“Die Organisation muss externe und interne Themen bestimmen …”* (see converted file §4.1) |
| `RequirementUnit` | `ru_key = "ISO9001:2015:de#4.1-a"`, `statement = "Determine external and internal issues relevant to QMS purpose"` (curated from chunk) |
| `DiagnosticQuestion` | `question_key = "scope.product_design"`, `prompt = "Do you design products or services in-house?"`, `answer_type = "boolean"` |
| `INFLUENCES` | That question → ISO **design**-related RUs with `mode = exclude_if`, `when_value = "false"` (illustrative; real mapping is curated) |
| Session state example | After answering `q = organisation-hat-momentanes-wissen-beruecksichtigt` with `true`, `(:Session)-[:HAS_STATE {state: "addressed", source_question_key: q}]->(:RequirementUnit {ru_key: "...wissen-der-organisation..."})` |

### 5.2 AStV — `AStV, Fassung vom 23.03.2026.md` style

| Node | Example values |
|------|----------------|
| `NormativeDocument` | `standard_key = "AT-BGBl-II:AStV:2026-03-23"`, `source_kind = "regulation"`, `title = "Arbeitsstättenverordnung (AStV)"`, `jurisdiction = "AT"`, `version_label = "2026-03-23"` |
| `Clause` | `clause_path = "§ 1"`, heading *Anwendungsbereich*; child clauses if paragraphs split to separate nodes, e.g. `§ 1` / `(1)` |
| `NormativeChunk` | Text from § 1 (1) *“Die Bestimmungen dieser Verordnung … gelten für Arbeitsstätten …”* (file ~lines 118–120) |
| `Clause` (illustrative leaf) | `clause_path = "§ 5"` *Beleuchtung und Belüftung* (from Inhaltsverzeichnis) |
| `RequirementUnit` | e.g. `ru_key = "AStV:2026#§5-core"` with obligation text derived from § 5 body after ingestion |

**Linking ISO to law (later data):**  
`(:RequirementUnit {ru_key: "ISO9001:…#…"})-[:ADDRESSES_LEGAL_OBLIGATION {provenance_type: "expert_assertion", …}]->(:RequirementUnit {ru_key: "ASchG:…#…"})` — only when curated.

---

## 6. End-to-end POC query story (orchestrator)

1. **Load master** for `standard_key` (+ optional law keys).  
2. **Open or create** `Session` for this organization.  
3. **Next question:** `MATCH (q:DiagnosticQuestion)` where not yet answered in this session, order by impact / `FOLLOWS` — [concept §11.3](compliance_graph_concept.md).  
4. **Record** `Answer` for `FOR_QUESTION`.  
5. **Apply** `INFLUENCES` → create `EXCLUDES`, update requirement closure state (`HAS_STATE`), and update optional weights for this `Session`.  
6. **Return subgraph:** `RequirementUnit` not `EXCLUDES` from `Session`, with `HAS_STATE`, `TopicBlock`, `EvidenceType` for advisory and to-do view ([concept §4](compliance_graph_concept.md)).

The LLM **explains** paths; it does **not** own exclusion logic ([concept §11](compliance_graph_concept.md)).

---

## 7. Constraints and indexes (minimum)

```text
UNIQUE NormativeDocument.standard_key
UNIQUE Clause.clause_id
UNIQUE NormativeChunk.chunk_key
UNIQUE RequirementUnit.ru_key
UNIQUE DiagnosticQuestion.question_key
UNIQUE Session.session_id
UNIQUE (Session, DiagnosticQuestion) per Answer — implement as `answer_id = session_id + "::" + question_key` + UNIQUE on `answer_id`, or app-enforced uniqueness
INDEX HAS_STATE.state (relationship property index where supported)
INDEX RequirementUnit.status
```

---

## 8. Summary diagram

```text
MASTER (versioned, curated)
  (:NormativeDocument)
      [:HAS_CHILD*]→ (:Clause) [:HAS_CHUNK]→ (:NormativeChunk)
                      [:CONTAINS_REQUIREMENT]→ (:RequirementUnit)
                          [:BELONGS_TO_TOPIC]→ (:TopicBlock)
                          [:VERIFIED_BY]→ (:EvidenceType)
  (:DiagnosticQuestion) [:INFLUENCES {mode, when_value}]→ (:RequirementUnit)
  (:RequirementUnit) [:ADDRESSES_LEGAL_OBLIGATION]→ (:RequirementUnit)   // cross-document, curated

SESSION (per org / engagement)
  (:Session) [:SUBMITTED]→ (:Answer) [:FOR_QUESTION]→ (:DiagnosticQuestion)
  (:Session) [:EXCLUDES]→ (:RequirementUnit)    // materialized after apply answers
  (:Session) [:HAS_STATE {state}]→ (:RequirementUnit) // open/addressed/gap/not_applicable/unclear
```

---

## 9. Document map

| File | Role |
|------|------|
| [`compliance_graph_concept.md`](compliance_graph_concept.md) | Vision — pipelines, questions as operators, session semantics |
| [`compliance_graph_docling_neo4j_implementation.md`](compliance_graph_docling_neo4j_implementation.md) | Docling → chunk → MERGE ingestion |
| **This file** | Neo4j labels + session + questions for a **working** POC loop |

---

## 10. Deferred complexity (not needed for first working loop)

- **`Interpretation` / `RecommendedAction` nodes** for plain-language and org-specific examples — concept §9.1; add after core loop is stable ([implementation §2.3](compliance_graph_docling_neo4j_implementation.md)).  
- Soft scoring on every node (concept §7.2) — add numeric properties later.  
- Full executable rule language — `INFLUENCES` + `when_value` plus deterministic session-state precedence is enough to start.  
- Vector indexes / APOC — [implementation §6.4](compliance_graph_docling_neo4j_implementation.md).  
- Cluster / causal bookmarks — production deployment only.

Refinements stay **backward-compatible** within one **knowledge release** ([concept §4](compliance_graph_concept.md)).

---

## 11. Session context-document extension (implemented)

For session-scoped document challenge, the session layer now includes:

- `(:ContextDocument {context_document_id, session_id, ingest_status, ...})`
- `(:ContextChunk {context_chunk_id, session_id, context_document_id, ...})`
- `(:SessionRequirementState {state_id, manual_state, auto_challenge_state, effective_state, ...})`

Key edges:

- `(:Session)-[:HAS_CONTEXT_DOCUMENT]->(:ContextDocument)`
- `(:ContextDocument)-[:HAS_CONTEXT_CHUNK]->(:ContextChunk)`
- `(:ContextChunk)-[:MATCHES_REQUIREMENT {session_id, method, score}]->(:RequirementUnit)`
- `(:Session)-[:HAS_CHALLENGE_STATE]->(:RequirementUnit)`
- `(:Session)-[:HAS_REQUIREMENT_STATE]->(:SessionRequirementState)-[:FOR_REQUIREMENT]->(:RequirementUnit)`

Effective precedence (deterministic):

1. `not_applicable` (manual) wins
2. manual `gap|unclear|addressed`
3. auto challenge `gap|unclear|addressed`
4. fallback `open`
