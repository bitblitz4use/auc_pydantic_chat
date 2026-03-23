# Compliance Graph Neo4j Validation Queries

Use these Cypher queries to validate the current ingest result for:

- `standard_key = "ÖNORM_EN_ISO9001:2015"`

They are aligned to the current POC master-graph pipeline:

- `NormativeDocument`
- `Clause`
- `NormativeChunk`
- `RequirementUnit`
- `DiagnosticQuestion`
- `INFLUENCES`

---

## 1) Whole graph view

```cypher
MATCH p=(n)-[r]->(m)
RETURN p
LIMIT 1500;
```

If your dataset is small and you want everything:

```cypher
MATCH p=(n)-[r]->(m)
RETURN p;
```

---

## 2) Summary counts for this standard

```cypher
MATCH (d:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})
OPTIONAL MATCH (d)-[:HAS_CHILD]->(c:Clause)
OPTIONAL MATCH (c)-[:HAS_CHUNK]->(ch:NormativeChunk)
OPTIONAL MATCH (c)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
OPTIONAL MATCH (q:DiagnosticQuestion {standard_key: d.standard_key})
OPTIONAL MATCH (q)-[:INFLUENCES]->(:RequirementUnit)
RETURN
  d.standard_key AS standard_key,
  d.language AS language,
  count(DISTINCT c) AS clauses,
  count(DISTINCT ch) AS chunks,
  count(DISTINCT ru) AS requirements,
  count(DISTINCT q) AS questions,
  count(DISTINCT (q)-[:INFLUENCES]->()) AS influences;
```

---

## 3) Language consistency check

```cypher
MATCH (d:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})
OPTIONAL MATCH (d)-[:HAS_CHILD]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
OPTIONAL MATCH (q:DiagnosticQuestion {standard_key: d.standard_key})
RETURN
  d.language AS root_language,
  count(CASE WHEN ru.language = d.language THEN 1 END) AS ru_language_ok,
  count(CASE WHEN ru.language <> d.language OR ru.language IS NULL THEN 1 END) AS ru_language_mismatch,
  count(CASE WHEN q.language = d.language THEN 1 END) AS q_language_ok,
  count(CASE WHEN q.language <> d.language OR q.language IS NULL THEN 1 END) AS q_language_mismatch;
```

---

## 4) Clauses by requirement density

```cypher
MATCH (:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})-[:HAS_CHILD]->(c:Clause)
OPTIONAL MATCH (c)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
RETURN c.clause_path AS clause, count(ru) AS requirements
ORDER BY requirements DESC, clause
LIMIT 20;
```

---

## 5) Question coverage and influence modes

```cypher
MATCH (q:DiagnosticQuestion {standard_key: "ÖNORM_EN_ISO9001:2015"})
OPTIONAL MATCH (q)-[i:INFLUENCES]->(ru:RequirementUnit)
RETURN
  q.question_key,
  q.prompt,
  q.answer_type,
  count(DISTINCT ru) AS influenced_requirements,
  collect(DISTINCT i.mode) AS modes
ORDER BY influenced_requirements DESC, q.question_key
LIMIT 50;
```

---

## 6) Find chunks without extracted requirements

```cypher
MATCH (:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})-[:HAS_CHILD]->(c:Clause)-[:HAS_CHUNK]->(ch:NormativeChunk)
WHERE NOT (ch)-[:SOURCE_FOR]->(:RequirementUnit)
RETURN c.clause_path AS clause, ch.chunk_key AS chunk_key, left(ch.text_contextualized, 250) AS preview
LIMIT 200;
```

---

## 7) Whole chain for a single clause

Replace the clause path value with one from query 4.

```cypher
MATCH (d:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})-[:HAS_CHILD]->(c:Clause {clause_path: "4 / 4.1"})
OPTIONAL MATCH (c)-[:HAS_CHUNK]->(ch:NormativeChunk)
OPTIONAL MATCH (c)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
OPTIONAL MATCH (q:DiagnosticQuestion {standard_key: d.standard_key})-[i:INFLUENCES]->(ru)
RETURN
  d.standard_key AS standard_key,
  c.clause_path AS clause,
  c.heading_text AS heading,
  ch.chunk_key AS chunk_key,
  left(ch.text_contextualized, 300) AS chunk_preview,
  ru.ru_key AS ru_key,
  ru.title AS ru_title,
  ru.statement AS ru_statement,
  q.question_key AS question_key,
  q.prompt AS question_prompt,
  i.mode AS influence_mode,
  i.when_value AS influence_when_value
ORDER BY chunk_key, ru_key, question_key
LIMIT 500;
```

---

## 8) Graph visualization for one clause chain

```cypher
MATCH (d:NormativeDocument {standard_key: "ÖNORM_EN_ISO9001:2015"})-[:HAS_CHILD]->(c:Clause {clause_path: "4 / 4.1"})
OPTIONAL MATCH p1=(c)-[:HAS_CHUNK]->(:NormativeChunk)
OPTIONAL MATCH p2=(c)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
OPTIONAL MATCH p3=(q:DiagnosticQuestion {standard_key: d.standard_key})-[:INFLUENCES]->(ru)
RETURN d, c, p1, p2, p3, q
LIMIT 200;
```
