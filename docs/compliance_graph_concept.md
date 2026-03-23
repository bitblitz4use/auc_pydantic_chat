# Context-Aware Compliance Knowledge Graph System

**Document purpose:** Holistic technical concept for stakeholders and implementation planning. It describes *what* the system is and *which* conceptual building blocks exist—not concrete technology choices, schemas, or code.

---

## 1. Vision

**Goal:** Transform abstract standards and regulations into **organization-specific, actionable obligations**.

**Core principle:** Norm → Context → Action.

The system is **not** a classifier of standards. It is a **contextual compliance interpreter**: a structured normative and advisory view that is **interactively narrowed** to what matters for a concrete organization.

**Central idea:** The graph is not merely “queried and answered.” It is **stepwise conditioned** by the organization’s answers. The result is not a flat list but a **subgraph** that contains exactly the requirements, topics, evidence types, roles, risks, and measures that are relevant for *this* organization in *this* context.

---

## 2. Core System Idea

A **master knowledge graph** holds the full normative and advisory space:

- Standards and (where applicable) laws  
- Document structure (e.g. chapters, clauses)  
- Atomic **requirement units**  
- Topic blocks  
- Diagnostic questions  
- Context factors  
- Evidence expectations  
- Measures / actions  
- Roles and dependencies  
- Applicability and interpretation rules  

Through interaction (questions and structured answers), this graph is **iteratively reduced** to a **context-specific subgraph** that states:

- what applies and what does not  
- what must be done  
- how to demonstrate compliance  
- what remains uncertain or open  

---

## 2.1 What “Knowledge Graph” Means Here

Technically, the graph is **not only a static store of facts**. It models **relevance dynamics**: how applicability, priority, and interpretation change as organizational context becomes known.

The **product** is not the raw graph itself but the ability to **shrink, weight, and interpret** compliance in organizational context—repeatedly and traceably.

---

## 3. Three-Pipeline Architecture

### 3.1 Ingestion Pipeline

**Input:** Source documents (e.g. PDF standards such as ISO 9001).

**Output:** A structured representation of the document (sections, clauses, cross-references).

**Role:** Turn unstructured or semi-structured sources into a stable structural backbone for downstream semantic objects. (Concrete tooling—e.g. Docling—is an implementation choice.)

---

### 3.2 Knowledge Production Pipeline

Transforms normative text and advisory knowledge into **typed graph content**:

- **Requirement units** (atomic obligations derived from clauses)  
- **Applicability and exclusion logic**  
- **Evidence expectations**  
- **Implementation patterns / recommended actions**  
- **Dependencies** between requirements, topics, and measures  
- Links from requirements to **diagnostic questions** and **interpretations**  

This pipeline is where curation and quality control live: the master graph should be **versioned and auditable**.

---

### 3.3 Contextualization Pipeline

**Input:** Organization profile and answers collected over time (session).

**Output:** A **contextualized working view** and, ultimately, a **result subgraph**: relevant obligations, explicitly excluded requirements, prioritized actions, gaps, and suggested evidence.

---

## 4. Three Graph States (Conceptual)

The runtime works with **three conceptual states** of the same underlying knowledge:

| State | Role |
|--------|------|
| **Master graph** | Full normative + advisory knowledge: standards, clauses, requirement units, topics, context dimensions, evidence types, measures, rules, dependencies. Immutable **curated truth** for a given knowledge release. |
| **Contextualized graph (session graph)** | After answers exist: nodes marked relevant / excluded; edges activated or deactivated; scores updated. The **active working graph** for one organization (and optionally one engagement or conversation). |
| **Result / advisory graph** | A **dense subgraph** used for explanation and delivery: relevant topics and requirements, concrete obligations, fitting evidence types, recommended measures, **open gaps**. This is what the system explains and may visualize. |

**Important distinction:** Prefer **two persistent layers** in practice:

1. **Knowledge graph** — stable, versioned, curated (master).  
2. **Session graph** — derived view per organization / session; holds **operational state** (active, excluded, unclear, answered, evidence gaps, prioritization) without mutating the master as if it were “the organization’s private copy” of the standard.

The original “session” vs “result” split in early drafts maps to: **working contextualized view** vs **final or staged advisory subgraph** for presentation.

---

## 5. Requirement Decomposition

Each clause is decomposed into **multiple atomic requirement units** so that applicability, evidence, and diagnostics can attach at the right granularity.

**Example (illustrative, ISO 9001-style leadership):** one clause may yield separate units for leadership accountability, quality policy, quality objectives, integration into processes, resource availability, communication, and improvement.

**Principle:** The earlier domain decomposition (norm text → atomic requirements → topics → diagnostics → context → fulfillment signals → evidence → measures) becomes the **semantic backbone** of the graph; the graph **materializes** those relationships explicitly.

---

## 5.1 Requirement Unit as Hub (Semantic Integration)

The **requirement unit** is a central node type, connected—conceptually—to:

- Topic membership (`BELONGS_TO_TOPIC` → topic block)  
- Intent / purpose of the requirement (`HAS_INTENT`)  
- Applicability conditions (`APPLIES_IF` → context / rules)  
- Verification (`VERIFIED_BY` → evidence types)  
- Implementation (`IMPLEMENTED_BY` → measures)  
- Assessment (`ASSESSED_BY` → diagnostic questions)  
- Context-specific readings (`INTERPRETED_BY` → interpretations)  
- Ordering and prerequisites (`DEPENDS_ON` → other requirements)  

This keeps **normative structure**, **advisory content**, and **context logic** in one coherent model.

---

## 6. Reduction: Not Only Smaller, but More Specific

Reduction is **not** only “fewer nodes.”

- **Subgraph selection:** Irrelevant branches disappear.  
- **Path selection within clusters:** A requirement may **remain** relevant while the **interpretation path** narrows (e.g. leadership: “informal but visible” in a small org vs “documented, governed, review-based” in a larger one).  

So the mechanism includes both **excluding** subgraphs and **choosing among** interpretation / evidence / measure variants tied to the same requirement.

---

## 7. Reduction Logic (Two Strategies)

Both are needed in practice.

### 7.1 Hard filtering

Answers **deterministically** deactivate or exclude parts of the graph (e.g. “no product development” → design/development-related requirement nodes and attached evidence/questions excluded; dependent follow-up questions skipped).

**Properties:** Transparent, testable, suitable for early proof-of-concept.

### 7.2 Soft scoring (weighted reduction)

Answers **adjust** scores rather than deleting nodes, e.g.:

- `score_relevance`  
- `score_mandatory`  
- `score_priority`  
- `score_confidence`  

Example: employee count influences how strongly formal governance controls weigh—even where requirements stay nominally applicable.

**In combination:** Hard exclusions for clear scope boundaries; soft scoring for prioritization and “how much” formality.

---

## 8. Question Mechanism

Questions are **graph-level filter and scoring operators**, not mere chat prompts.

Each answer can:

- remove or deactivate nodes and whole topic blocks  
- mark requirements as mandatory or higher priority  
- reprioritize measures  
- shift evidence expectations  
- tighten which interpretation applies  
- unlock or skip follow-up questions  

**Architectural rule:** Questions **must live in the knowledge model**, not only in UI or chat flow. Otherwise reuse across standards (e.g. NIS2, ISO 9001) and consistent behavior break.

### 8.1 Conceptual content of a question node

A diagnostic question node should carry (conceptually):

- Question text  
- Answer type and allowed values  
- Which **context dimension(s)** it populates  
- Which nodes or rules it influences (directly or via rules)  
- Expected **information gain** (e.g. uncertainty reduction for many relevant nodes)  

**Reuse:** The same question (e.g. “Multiple sites?”) can affect leadership requirements, role models, auditability, documentation burden, and incident structures across several standards—if modeled once in the graph.

**Edges:** `APPLIES_IF`, `NOT_APPLICABLE_IF`, and `REDUCES_UNCERTAINTY_FOR` (or equivalent semantics) are central to steering the question flow.

---

## 9. Data Model (Conceptual)

### 9.1 Node families

#### Normative

- Standard  
- Chapter / section (structural)  
- Clause  
- Requirement unit  

#### Advisory / consulting

- Topic block  
- Diagnostic question  
- Interpretation  
- Recommended action  
- Evidence type  
- Gap pattern (optional but useful for advisory depth)  

#### Context

Examples of dimensions (as nodes or typed attributes—implementation detail):

- Company size  
- Industry  
- Business model  
- Process type  
- Leadership / governance structure  
- Regulatory intensity  
- Site / jurisdiction  
- Criticality  
- Maturity  

#### Logic

- Applicability rule  
- Exclusion rule  
- Dependency rule  
- Strength-of-obligation (where modeled explicitly)  
- Confidence / review flags  

#### Output-oriented (optional explicit nodes)

Used when the advisory layer is modeled as first-class objects:

- Obligation / duty  
- Recommendation  
- Priority  
- Next step  
- Monitoring requirement  

The same requirement node can connect across **normative**, **advisory**, **context**, and **logic** layers.

---

### 9.2 Edge types (extended list)

Edges carry much of the expressiveness. Conceptual types include:

| Edge (conceptual name) | Role |
|------------------------|------|
| `HAS_CLAUSE` / document structure | Standard → structure |
| `CONTAINS_REQUIREMENT` | Clause → requirement unit |
| `BELONGS_TO_TOPIC` | Requirement → topic |
| `APPLIES_IF` / `NOT_APPLICABLE_IF` | Rules and context → applicability |
| `DEPENDS_ON` | Requirement / measure dependencies |
| `SUPPORTED_BY_EVIDENCE` / `VERIFIED_BY` | Evidence linkage |
| `IMPLEMENTED_BY` | Measures |
| `REQUIRES_ROLE` | Role obligations |
| `TRIGGERS_QUESTION` | Flow to diagnostics |
| `REDUCES_UNCERTAINTY_FOR` | Question → targets for information gain |
| `OVERRIDES` / `OVERLAPS_WITH` | Conflict and overlap |
| `RELEVANT_FOR_CONTEXT` / `EXCLUDED_BY_CONTEXT` | Context linkage |

The exact enumeration can be refined during schema design; the concept is **rich edge vocabulary** beyond a minimal set.

---

## 10. Session Semantics (Conceptual)

A session graph tracks, among others:

- **Active** vs **excluded** vs **unclear** nodes  
- **Answered** questions and derived **facts**  
- **Requirement closure state** per requirement unit (`open`, `addressed`, `gap`, `not_applicable`, `unclear`)  
- **Evidence gaps**  
- **Prioritization** overlays  

This is essential: contextualization is not only “filtering what applies.”  
It must also close or escalate concrete obligations as answers arrive, so the remaining graph acts as a **live compliance to-do set**.

Operationally, one key success signal is: **no open requirement units remain in active scope** (subject to defined confidence and review rules).

This keeps the **master** stable while the **session** captures the evolving, organization-specific view.

---

## 11. Runtime Flow (Orchestration)

Compliance consistency should come from the **graph and rule model**, not from ad hoc LLM reasoning.

Conceptual loop:

1. Load or reference the **master graph** (for a chosen knowledge release).  
2. Instantiate a **session graph** for the organization (and scope).  
3. Select the **next question** using criteria such as: remaining uncertainty, breadth of impact on relevant nodes, advisory value, user context.  
4. Map the user’s answer to **structured facts** (typed context updates).  
5. Apply **rules** on the session graph: exclude, activate, reweight, set requirement closure state, enable follow-up questions.  
6. Recompute continuously: relevant topics, open gaps, requirement-state totals, candidate next question, provisional recommendations.  
7. Emit or refresh the **result / advisory subgraph** for explanation and export.

**LLM role (conceptual):** Interaction, natural-language explanation, and optional mapping assistance—not the **authoritative** source of compliance logic. The **orchestrator** (rule + graph engine) owns deterministic behavior and traceability.

---

## 12. Agent Role: Dialogical Graph Interpreter

The agent is not “a chatbot with documents.” It is a **dialogical graph interpreter** with four conceptual tasks:

1. **Collect context** (through questions and structured capture).  
2. **Reduce, weight, and close** the graph (session + rules + requirement-state transitions).  
3. **Interpret** remaining requirements in light of context (including path selection within clusters).  
4. **Produce advisory output** (gaps, measures, evidence, narrative explanation).  

---

## 13. Consulting Model (Per Requirement)

Each requirement unit can surface:

- **Intent**  
- **Diagnostic questions**  
- **Fulfillment indicators**  
- **Evidence** expectations  
- **Implementation guidance** / measures  

This aligns the graph with **consulting-style** delivery while keeping logic inspectable.

---

## 14. Example Transformation (Illustrative)

**Normative text:** “Top management ensures resources …”

**Becomes:** targeted questions (who is accountable, are resources allocated, how evidenced?), gap analysis, recommendations, and evidence suggestions—**scoped** by what the session graph still considers applicable.

---

## 15. Visualization (Conceptual)

Visualization should reflect **the same transformation** the engine performs:

- **Start:** Large norm graph (many topics visible).  
- **After a few answers:** Irrelevant topic blocks de-emphasized or inactive.  
- **After more answers:** Only relevant topics and requirements emphasized.  
- **End state:** Compact **target subgraph**: obligations, measures, evidence, open questions, and explicit requirement closure status.

The UI stack (e.g. a particular charting library) is implementation; the **concept** is narrating **full → contextualized → advisory** reduction.

---

## 16. Why This Model Scales

1. **Many standards:** New standards add **node sets and links**, not a separate silo per product.  
2. **Reuse:** Shared topics (e.g. leadership, risk) link across standards.  
3. **Contextualization:** The same requirement unit can be **evaluated differently** under different organizational facts—stronger than raw RAG on PDFs, static checklists, or prompt-only logic.  

---

## 17. Metadata for “Advisory-Ready” Graphs

Elements benefit from conceptual metadata so the graph remains **explainable** and **prioritizable**:

- Relevance and exclusion conditions  
- Confidence and review flags  
- Dependency depth  
- Question coverage (what is still unknown)  
- Evidence strength expectations  

Without this, the graph risks being a static ontology rather than a **consulting engine**.

---

## 18. Proof-of-Concept Scope (Conceptual)

**In scope for a POC:**

- One standard (e.g. ISO 9001 or NIS2—product decision).  
- A **limited** set of requirement units (e.g. on the order of tens, not thousands).  
- A **small** question set with clear hard filters and some soft scoring.  
- End-to-end: master → session → result subgraph.  
- Minimal operational stack: a **graph-appropriate** store or serializable representation, rule application, session state, question selection, subgraph extraction.  

**Explicitly out of scope for an initial POC** (unless later prioritized):

- Full probabilistic inference  
- Automatic ontology evolution  
- Fully autonomous rule learning  

---

## 19. Key Innovation (Summary)

- **Dynamic graph reduction + interpretation**, not static checklists or document-only RAG.  
- **Norm → context → action** with traceable structure.  
- **Two-layer separation:** curated knowledge vs. per-organization session state.  

---

## 20. Formal Principle (LLM vs. Graph)

> The LLM does **not** decide compliance by itself. It **mediates** a process in which a **rule- and context-driven knowledge graph** is iteratively reduced to the **organization-relevant core**, with deterministic behavior defined by the model and rules.

---

## 21. Next Step Toward Implementation

The next planning artifact (separate from this concept note) should specify a **formal graph schema**: concrete node and edge types, session state fields, reduction rules, and validation—so implementation and testing can proceed without ambiguity.

---

## 22. Final Principle

The product is the ability to **reduce**, **interpret**, and **explain** compliance in **organizational context**—with a clear path from **master knowledge** to **actionable, evidenced obligations** for that organization.
