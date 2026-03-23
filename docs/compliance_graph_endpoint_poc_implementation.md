# Compliance Graph Endpoint POC Implementation

This document defines the new server-side endpoint that executes the concept pipeline in one call:

- `ingestion` (document conversion + structural chunking)
- `knowledge production (POC)` (requirement extraction from each chunk)
- `master graph persistence` (NormativeDocument, Clause, NormativeChunk, RequirementUnit)

It is intentionally aligned with:

- `docs/compliance_graph_concept.md`
- `docs/compliance_graph_docling_neo4j_implementation.md`
- `docs/compliance_graph_neo4j_schema.md`

## 1) POC scope and intent

The endpoint is designed for POC velocity but follows the concept:

- one API call performs the complete document-to-graph path
- extraction happens directly from Docling chunks (no additional external step)
- Pydantic AI agents are used for requirement extraction
- writes go to the Neo4j master layer only (no session graph in this endpoint)

Out of scope for this endpoint:

- question/session contextualization loop
- scoring and rule execution over organization answers
- fully curated publication workflow (`draft -> reviewed -> published`)

## 2) Endpoint contract

### Route

- `POST /api/compliance-graph/ingest`

### Form-data inputs

- `file` (required): source document
- `standard_key` (required): stable identity key
- `title` (required): document title
- `language` (optional, default `de`)
- `source_kind` (optional, `standard|statute|regulation`, default `standard`)
- `version_label` (optional)
- `jurisdiction` (optional)
- `model_id` (optional, `provider:model`)

`heading_blocklist` is intentionally **not configurable** in the endpoint.
The pipeline uses a fixed internal starter list (DE/EN):

- `Inhaltsverzeichnis`
- `Table of contents`
- `Vorwort`
- `Einleitung`

### Response

Structured success payload with:

- total chunks discovered
- chunks persisted after filtering
- total extracted requirements
- clauses written
- effective extraction model id

## 3) Runtime pipeline (single request)

1. Read upload and metadata.
2. Convert source via Docling `DocumentConverter`.
3. Chunk with Docling `HierarchicalChunker`.
4. Filter obvious non-normative headings using fixed hardcoded blocklist.
5. For each kept chunk:
   - generate contextualized chunk text (`chunker.contextualize`)
   - run Pydantic AI extraction agent
   - extract all explicit requirement statements (atomic)
6. Persist into Neo4j using async driver:
   - `NormativeDocument`
   - `Clause`
   - `NormativeChunk`
   - `RequirementUnit` + provenance links
7. Return summary metrics.

This keeps the concept order: structure first, then requirement-unit candidate production.

## 4) Extraction behavior (POC)

The extraction agent is constrained to:

- return all explicit requirements from a chunk
- keep requirements atomic
- avoid hallucinated obligations
- keep output language equal to request `language`
- return empty list if none are present

Fallback behavior:

- if the agent fails, a lightweight heuristic extracts normative-looking fragments

This fallback preserves endpoint continuity while still favoring model extraction.

## 5) Graph write model (master layer)

For each request:

- `MERGE (d:NormativeDocument {standard_key})`
- per chunk:
  - `MERGE (c:Clause {clause_id})`
  - `MERGE (d)-[:HAS_CHILD]->(c)`
  - `MERGE (ch:NormativeChunk {chunk_key})`
  - `MERGE (c)-[:HAS_CHUNK]->(ch)`
- per extracted requirement:
  - `MERGE (ru:RequirementUnit {ru_key})`
  - `MERGE (c)-[:CONTAINS_REQUIREMENT]->(ru)`
  - `MERGE (ch)-[:SOURCE_FOR]->(ru)`

Status for extracted requirement nodes is set to `draft` in this POC endpoint.

## 6) Files introduced

- `server/app/compliance_graph/router.py`
- `server/app/compliance_graph/pipeline.py`
- `server/app/compliance_graph/extractor.py`
- `server/app/compliance_graph/schema.py`
- `server/app/compliance_graph/__init__.py`
- route registration in `server/app/main.py`

## 7) Why this satisfies conceptual needs now

- Uses native Docling chunking, not markdown-only parsing.
- Produces requirement-unit level graph nodes from chunk text.
- Keeps provenance from chunk -> requirement.
- Writes directly to Neo4j master graph in a deterministic server path.
- Uses Pydantic AI agents for extraction, as requested.

## 8) Next stage after this endpoint

When you move beyond the POC endpoint, add:

- curation/review workflow for `RequirementUnit` promotion
- diagnostic question nodes + `INFLUENCES` links
- session graph and answer application (`EXCLUDES`, priorities)
- deterministic rule catalog for contextualization

The current endpoint is intentionally a clean master-ingestion foundation for that stage.
