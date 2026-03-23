# Implementation concept: Docling → chunking → Neo4j (POC scope)

**Document purpose:** Technical implementation strategy for turning **input standard documents** (e.g. ISO PDFs) into **graph-shaped data** that can feed the **master knowledge graph** described in [`compliance_graph_concept.md`](compliance_graph_concept.md). It binds the concept’s **ingestion** and first steps of **knowledge production** to **Docling**, **native Docling chunking**, and **Neo4j**, with an explicit **first-POC** scope—no feature creep.

This path is **deliberately minimal**: **no separate semantic framework** (e.g. Semantica) in v1—structure and provenance first; **requirement units and rich semantics** are added in **explicit, reviewable** steps after chunks exist.

**Authoritative concept:** Only [`compliance_graph_concept.md`](compliance_graph_concept.md) defines *what* the system is (norm → context → action, master vs session graph, requirement units as hubs, rule-driven reduction). This document defines *how* document conversion and first graph materialization align with that concept.

**External references (read for API details):**

- Docling chunking (Base / Hybrid / Hierarchical chunkers, `chunk` + `contextualize`): [Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)
- Neo4j Python driver (install, Bolt, transactions): [Installation - Neo4j Python Driver Manual](https://neo4j.com/docs/python-manual/current/install/)

---

## 1. Alignment with the compliance concept (why this stack)

### 1.1 Ingestion pipeline (concept §3.1)

The concept requires: **source documents → stable structural backbone** (chapters, clauses, cross-references). Docling’s **`DocumentConverter`** already produces a **`DoclingDocument`** with layout and structure; exporting to Markdown alone (as in the current [`server/app/docling/converter.py`](server/app/docling/converter.py)) is **sufficient for preview** but **not sufficient** for a principled graph backbone, because you lose the **native document model** that chunkers use.

**Implementation direction for the graph POC:** persist the conversion result as a **`DoclingDocument`** (in memory or serialized per Docling’s supported patterns) and run **native Docling chunkers** on it. That matches the concept: structure-first, then semantic objects. The Docling docs describe this split explicitly: either Markdown + ad hoc chunking, or **native chunkers on `DoclingDocument`**—this plan uses the latter for the backbone ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)).

### 1.2 Knowledge production pipeline (concept §3.2)

The concept requires **typed** graph content: requirement units, topics, evidence, rules, dependencies, etc., with **curation and auditability**. **Docling alone is not** that curated master graph:

- **Docling chunking** supplies **bounded text units + structural metadata** (headings, hierarchy). That supports **`Standard` → section/clause structure → text spans** in Neo4j—the **correct POC boundary** for ingestion.

- **Richer semantics** (decomposition into requirement units, topics, candidate relationships) come **after** chunks: via **manual curation**, **rules**, and/or **LLM-assisted extraction** with outputs stored as **draft or pending review**—never as silent ground truth.

**Reasoning:** The concept states that the **orchestrator (rules + graph)** owns deterministic behavior; the LLM “mediates” ([concept §20](compliance_graph_concept.md)). Therefore:

- **Generic triplet or relation mining** (whether from a framework or a one-off script) **must not** automatically populate compliance-critical edges (`APPLIES_IF`, `DEPENDS_ON`, etc.) without curation.
- **Requirement decomposition** ([concept §5](compliance_graph_concept.md)) is **not** replaced by unstructured triplets; it stays an explicit modeling step, possibly LLM-assisted but **reviewed** against the norm text.

**Why skip a dedicated semantic framework in v1:** A second stack (e.g. [Docling’s Semantica integration](https://docling-project.github.io/docling/integrations/semantica/), [Semantica](https://hawksight-ai.github.io/semantica/)) adds dependencies and surface area before the **Neo4j structural layer** is proven. Normalization can be **lightweight** (Unicode/whitespace); relationship hints can be added later with the **same** chunk boundaries as input—no need to couple ingestion to a full knowledge-engineering toolkit for the first POC.

### 1.3 What the POC is *not* (concept §18 + this doc)

The concept’s POC explicitly excludes full probabilistic inference, automatic ontology evolution, and autonomous rule learning. This implementation doc adds **tool-level** exclusions so engineering stays aligned:

| Out of scope for **first** Docling→Neo4j POC | Why (concept + technical) |
|-----------------------------------------------|-----------------------------|
| **Third-party semantic / GraphRAG frameworks** as mandatory part of ingestion | Concept needs a **versioned master graph** and **rules**, not an opaque semantic pipeline ([concept §11–§20](compliance_graph_concept.md)). Optional tools can be revisited **after** structure + Neo4j path is stable. |
| **HybridChunker** as mandatory default | Hybrid adds **tokenizer-aligned split/merge** ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/))—valuable for embedding/RAG uniformity; the POC’s first goal is **clause-aligned structure**, not optimal vector chunks. |
| Markdown-only pipeline without `DoclingDocument` | Loses hierarchical chunk metadata; works against **clause-level** traceability in the concept. |
| Replacing **requirement decomposition** with raw triplets or unconstrained extractions | Concept §5 requires **multiple atomic requirement units per clause**; free-form triplets often miss obligations or blur normative nuance. |
| Session graph, question routing, soft scoring | Belong to **contextualization** ([concept §3.3, §10–§11](compliance_graph_concept.md)); **ingestion POC** may stop at **master structural layer** plus **optional draft** semantic nodes under review. |

---

## 2. Observations from existing converted standards (chunking implications)

The files [`converted_iso9001.md`](converted_iso9001.md) and [`converted_iso14001.md`](converted_iso14001.md) show patterns relevant to chunker choice:

1. **Normative body uses headings like** `## 4.1 …`, `## 5 …`, and enumerated **shall**-style obligations (e.g. “Die Organisation muss …”). That is **hierarchical document structure**—exactly what **`HierarchicalChunker`** is designed to respect: one chunk per detected element, with headers/captions attached ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)).

2. **Front matter** (Vorwort, Einleitung, tables of contents) is **dense but low value** for requirement units. The POC should **filter chunks** by heading prefix / section range (e.g. start graph materialization at section **1** or **4**, skip annexes if out of scope) so the graph does not flood with non-normative nodes.

3. **OCR/layout noise** (e.g. garbled blocks in the ISO 9001 export around early pages) is a **quality risk**. Chunking does not repair bad text; the POC needs **simple quality gates** (length thresholds, character entropy, or skip pages) **before** any LLM or enrichment step—otherwise downstream steps amplify garbage.

### 2.1 TOC and non-normative chunks (POC filter)

**Do not** persist **tables of contents** (TOC / **Inhaltsverzeichnis**), purely navigational **Inhalt** blocks, or similar front matter as **normative clauses** — they are not obligations.

**Simple POC approach (no dedicated TOC-detection ML):**

- **Blocklist** heading patterns (configuration), e.g. `Inhaltsverzeichnis`, `Table of contents`, `Inhalt` when it is only the TOC, `Vorwort`, `Einleitung` — adjust per document family (ISO vs RIS law).
- **Normative start:** optionally configure the first **real** section id (e.g. first `§ 1` or section `1` / `4` for ISO body) and **skip** everything before for structural `MERGE` into Neo4j.
- **Light heuristic:** drop chunks that look like TOC lines only (dot leaders, page numbers without substantive text), if easy to implement.

Filtered-out chunks are **omitted** from the clause/chunk spine (see [`compliance_graph_neo4j_schema.md`](compliance_graph_neo4j_schema.md) filter step).

### 2.2 Language of the source document

Each ingested **root document** has **one authoritative language** for stored text (mirror the PDF/edition language). **Do not mix** languages inside the same chunk in POC. Include **language** in the document key / root node properties ([schema](compliance_graph_neo4j_schema.md)). A **second language edition** is a **separate** import (`standard_key` differs, e.g. language suffix) — not inline auto-translation in the pipeline.

### 2.3 Plain-language explanations and examples (where they belong)

**Ingestion** keeps **verbatim** normative wording. **Lay summaries, organizational examples, and “simple language”** are **advisory** content in the concept ([concept §9.1](compliance_graph_concept.md): Interpretation, Recommended action, consulting layer) — **not** replacements for audited **requirement** text. For a minimal POC, **defer** extra labels until ingest + questions + session run end-to-end; the concept already names **where** that content lives when you add it.

---

## 3. Docling chunking: recommended strategy for this POC

Docling defines a **`BaseChunker`** API: `chunk(dl_doc, **kwargs)` yielding chunks, and `contextualize(chunk) -> str` for **metadata-enriched** text suitable for downstream models or human review ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)).

### 3.1 Primary choice: `HierarchicalChunker`

**Use as the default** for ISO-style standards:

- **Reason:** The compliance concept anchors on **clauses and requirement units** linked to **document structure** ([concept §9.1, §5](compliance_graph_concept.md)). Hierarchical chunking **preserves structure** and attaches **heading/caption metadata** to chunks ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)), which maps cleanly to Neo4j paths like `(:Standard)-[:HAS_SECTION*]->(:Clause)-[:HAS_TEXT]->(:ChunkText)` or equivalent.

- **List handling:** The hierarchical chunker **merges list items by default** (`merge_list_items`)—usually desirable for ISO bullet lists under a clause.

**POC deliverable:** For each chunk, store at minimum: `chunk_id`, **structural path / headings** from metadata, `contextualize(chunk)` output, and **source provenance** (document id, optional page refs if available from Docling metadata).

### 3.2 Secondary choice: `HybridChunker` (opt-in)

**Use when:** some hierarchical chunks exceed practical limits for your **downstream** step (LLM context, embedding batch size), or you need **peer merging** across undersized fragments with the same headings ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)).

**Reason:** Hybrid applies **token-aware** splitting/merging **on top of** hierarchical chunks, with optional `merge_peers`. It optimizes **downstream tokenization**, not legal clause identity—so **keep the hierarchical chunk ids as logical clause anchors** if you split further (parent/child or `PART_OF` edges in Neo4j).

**Not needed** for the first POC if: you only materialize **structure + full clause text** and defer embedding-heavy RAG.

### 3.3 What we explicitly do *not* need for POC

- **Export-only Markdown chunking** as the **sole** mechanism: it forfeits Docling’s structural metadata unless you re-parse headings—duplicating work and weakening traceability ([Chunking - Docling](https://docling-project.github.io/docling/concepts/chunking/)).
- **Tuning every HybridChunker parameter** before you have a **Neo4j schema** and a **small requirement-unit curation loop**: premature optimization.

---

## 4. After chunks: knowledge production without a semantic framework

Once chunks exist in Neo4j with stable ids, you can add **requirement units**, **topics**, and **advisory** content in layers—aligned with [concept §3.2, §5](compliance_graph_concept.md):

| Mechanism | Role | Concept fit |
|-----------|------|-------------|
| **Lightweight text normalization** (stdlib, small helpers) | Unicode/whitespace cleanup on chunk text before optional LLM prompts | Reduces noise; no extra dependency |
| **LLM-assisted decomposition (optional)** | Propose **requirement unit** candidates from `contextualize(chunk)` text | Fits “LLM mediates”; outputs must be **reviewed** before master promotion |
| **Manual / spreadsheet curation** | Authoritative for early POC when automation is uncertain | Matches **auditability** of the master graph |

**Optional pattern:** store **draft** nodes or `pending_review` flags on suggested edges so **deterministic rules** and human review remain in control ([concept §20](compliance_graph_concept.md)).

---

## 5. Neo4j: POC graph shape (ingestion-facing)

This section does not replace a full **formal schema** (the concept defers that to a separate artifact [concept §21](compliance_graph_concept.md)); it **scopes** what the Docling→chunking path should **populate first** in Neo4j. **How** those nodes are written (driver, MERGE keys, idempotency) is fixed in **§6**.

### 5.1 In scope for ingestion POC

- **`Standard`** (or `Document`): id, title, version, source file hash.
- **Structural nodes:** `Section` / `Clause` (from hierarchical chunk headings / numbering parsed or carried in metadata).
- **`Chunk` or `SourceSpan`:** links to clause, stores raw and `contextualize` text, offsets/provenance.
- **`RequirementUnit` (stub):** optional **placeholder** nodes only if you already define decomposition rules; otherwise **attach requirement units in a second step** (manual/LLM-assisted) from clause chunks—consistent with concept §5 (decomposition is explicit).

### 5.2 Optional draft semantics (later step)

- **`SemanticCandidate`**, **`DraftRequirement`**, or edge properties with `status = pending_review` for anything inferred from LLM or heuristics.
- **Do not** promote unreviewed suggestions into **production** `APPLIES_IF`, `DEPENDS_ON`, etc.—those edge types carry **compliance meaning** in the concept ([concept §9.2](compliance_graph_concept.md)).

---

## 6. Neo4j persistence: backend contract (POC)

This section makes explicit **how** the structural slice of the **master** graph ([concept §4, §9](compliance_graph_concept.md)) is written in v1. It does **not** replace the separate **formal graph schema** work ([concept §21](compliance_graph_concept.md)); it only fixes **clearance** for ingestion so implementation is unambiguous.

### 6.1 When and where writes happen

- **When:** The backend **persists to Neo4j in the same processing path as chunking**—immediately after **filter** (workflow step 3) and **chunk** (step 2), i.e. **structural nodes and chunks are written as one ingestion transaction or a short sequence of transactions** for the same document run. No requirement for a separate batch ETL product for the POC.
- **What:** **Standard (document)** + **section/clause spine** + **chunk/source-span** nodes and **containment** relationships, as scoped in §5.1. This matches the concept’s **ingestion → structural backbone** ([concept §3.1](compliance_graph_concept.md)).
- **What not in this write path:** **Session** state, **contextualized** graph, question flow, and **full** advisory edge vocabulary remain **out of scope** of this persistence step ([concept §3.3, §10](compliance_graph_concept.md)).

### 6.2 Python driver (recommended)

- Use the **official Neo4j Python driver** (`pip install neo4j`; Python ≥ 3.10 per vendor docs): [Installation - Neo4j Python Driver Manual](https://neo4j.com/docs/python-manual/current/install/). Connect over **Bolt** (default port 7687) to Neo4j **local**, **Docker**, or **Aura**—same driver API.
- **Reasoning:** Parameterized Cypher, explicit **read/write transactions**, and first-class support across Neo4j server versions are enough for ingestion **without** adding an ORM or GraphRAG stack. Optional **Rust extension** (`neo4j-rust-ext`) is a performance choice, not required for the POC.

### 6.3 Minimal identity and idempotency (must decide before coding)

Enough structure to avoid duplicate worlds on re-import, without designing the full schema catalog:

| Decision | POC guidance |
|----------|----------------|
| **Stable keys** | Derive a **business key** per `Standard` (e.g. norm id + version + language) and per **clause/chunk** (e.g. stable **clause path** string from headings/metadata, plus `chunk ordinal` if multiple chunks per clause). Store as **properties** used for `MERGE`. |
| **Idempotent writes** | Prefer **`MERGE`** on those keys for ingestion so **re-running** the same document version **updates** text and metadata instead of duplicating nodes. |
| **Uniqueness** | Add **one** `UNIQUE` constraint per critical label/key when the model stabilizes (e.g. `Standard.standard_key`); avoid a long list of constraints before the first successful import. |
| **Hybrid splits** | If a clause is split (§3.2), **child chunks** keep a **parent clause key** and a **`part_index`** (or similar) so MERGE remains deterministic. |

### 6.4 Explicitly deferred (not needed to “clear” ingestion)

- **Full** node/edge catalog, migration framework, and validation rules for the entire master graph ([concept §21](compliance_graph_concept.md)).
- **APOC**, separate **GraphRAG** libraries, vector indexes—unless a later story requires them.
- **Neo4j cluster** semantics (causal bookmarks, routing) beyond a single-instance dev setup—revisit when moving to production Aura/cluster.

---

## 7. End-to-end POC workflow (recommended order)

1. **Convert:** `DocumentConverter.convert(path)` → **`DoclingDocument`** (extend current wrapper beyond Markdown-only export).
2. **Chunk:** `HierarchicalChunker.chunk(dl_doc)`; optionally **`contextualize`** each chunk for downstream text.
3. **Filter:** drop front matter / out-of-scope annexes by heading rules for the chosen standard slice.
4. **Persist structure:** write **Standard + Clause/Section + Chunk** to **Neo4j** with stable ids.
5. **Enrich (optional, separate):** normalize text lightly; run **curated** decomposition or LLM-assisted drafts into **review queues**—not blocking steps 1–4.

Steps 4–5 align with §6: **persist structure in step 4** via the Python driver; enrichment is optional and later.

---

## 8. Integration with existing code

- Today: [`server/app/docling/converter.py`](server/app/docling/converter.py) exports **Markdown only**. **POC change:** also return or persist **`DoclingDocument`** for chunking.
- **Dependencies:** **`docling`** for conversion/chunking; **`neo4j`** for persistence ([install](https://neo4j.com/docs/python-manual/current/install/)); if using **HybridChunker**, add the **`chunking`** or **`chunking-openai`** extra per [Docling chunking docs](https://docling-project.github.io/docling/concepts/chunking/). Pin versions in whatever dependency file the server adopts.
- **Configuration:** connection URI, user, password (environment variables or app settings)—no prescription of secrets management here.

---

## 9. Summary

| Question | Answer for this concept + POC |
|----------|-------------------------------|
| Markdown vs native chunking? | **Native `DoclingDocument` chunking** for structural fidelity; Markdown export remains useful for **human review** only. |
| Hierarchical vs Hybrid? | **Hierarchical first**; Hybrid only if chunk size / tokenizer alignment blocks downstream use. |
| Semantic framework in v1? | **Not required.** Optional **normalization + curated / LLM-assisted** enrichment **after** chunks. |
| What is Neo4j for in POC? | **Structural backbone + provenance**; reviewed semantics and requirement units in **later** steps. |
| How is data persisted? | **Backend writes after chunking** in the same ingestion path (§6); **official `neo4j` Python driver**, parameterized Cypher, **`MERGE`** on stable keys for idempotency. |
| What is explicitly *not* needed yet? | Mandatory third-party semantic stacks, embedding-optimized RAG as the main goal, session/contextualization graph, autonomous ontology/rule learning—per concept §18 and §21; full schema catalog per concept §21. |

---

## 10. Optional future direction (not v1)

If you later need **triplet-style bootstrapping** or tighter Docling-adjacent pipelines, revisiting a **Docling-integrated** stack (e.g. [Semantica integration](https://docling-project.github.io/docling/integrations/semantica/)) remains possible—the same **chunk ids and curation rules** should remain the integration surface so **compliance truth** stays in the graph and review process, not in the framework defaults.

This document should be read **together with** [`compliance_graph_concept.md`](compliance_graph_concept.md); any future **formal Neo4j schema and rule catalog** ([concept §21](compliance_graph_concept.md)) supersedes naming details here while preserving the **structure-first, curated-semantics-second** order and the **persistence contract** in §6.
