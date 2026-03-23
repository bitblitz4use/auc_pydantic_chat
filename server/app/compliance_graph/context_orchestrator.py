"""Deterministic compliance context orchestrator (session-stage runtime)."""

from __future__ import annotations

import base64
import json
import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal

from neo4j import AsyncDriver

from app.compliance_graph.context_contract import (
    ProgressCounters,
    QuestionCardPayload,
    QuestionRenderModel,
    parse_context_session_input,
    resolve_conversation_id,
)

logger = logging.getLogger(__name__)

STATE_PRECEDENCE: dict[str, int] = {
    "not_applicable": 0,
    "gap": 1,
    "unclear": 2,
    "addressed": 3,
    "open": 4,
}


@dataclass(slots=True)
class _InfluenceRow:
    question_key: str
    answer_value: Any
    mode: str
    when_value: str
    ru_key: str


@dataclass(slots=True)
class _QuestionCandidate:
    question_key: str
    prompt: str
    answer_type: str
    allowed_values: list[str]
    language: str
    impact: int


class ComplianceContextOrchestrator:
    """Graph-backed session-state orchestrator for `taskMode=context`."""

    _constraints_ready: bool = False

    def __init__(self, neo4j_driver: AsyncDriver):
        self.neo4j_driver = neo4j_driver

    async def handle_turn(self, body_data: dict[str, Any]) -> tuple[Literal["jsx", "text"], str]:
        """Process one context turn and return streamed payload content."""
        await self._ensure_constraints()
        context_input = parse_context_session_input(body_data)
        conversation_id = resolve_conversation_id(body_data)
        session_id = context_input.session_id.strip() if context_input.session_id else str(uuid.uuid4())

        standard_keys = await self._resolve_standard_keys(context_input.standard_keys)
        if not standard_keys:
            return (
                "text",
                "Kontextmodus kann nicht starten: Es wurden keine Normdokumente im Master-Graph gefunden.",
            )

        await self._ensure_session_scope(
            session_id=session_id,
            conversation_id=conversation_id,
            standard_keys=standard_keys,
        )

        stale_answer_reason = ""
        if context_input.answer is not None:
            valid, reason = await self._validate_answer_target(
                session_id=session_id,
                question_key=context_input.answer.question_key,
            )
            if not valid:
                stale_answer_reason = reason
                logger.info(
                    "Skipping stale/inactive context answer in session=%s question=%s reason=%s",
                    session_id,
                    context_input.answer.question_key,
                    reason,
                )
            else:
                question_meta = await self._load_question_meta(context_input.answer.question_key)
                if question_meta is None:
                    logger.info(
                        "Skipping context answer because question was not found: session=%s question=%s",
                        session_id,
                        context_input.answer.question_key,
                    )
                else:
                    normalized = self._normalize_answer(
                        value=context_input.answer.value,
                        answer_type=question_meta.answer_type,
                        allowed_values=question_meta.allowed_values,
                    )
                    if normalized is None:
                        return (
                            "text",
                            "Antwortformat ungültig für diese Frage. Bitte Eingabe prüfen und erneut senden.",
                        )

                    await self._upsert_answer(
                        session_id=session_id,
                        question_key=context_input.answer.question_key,
                        raw_value=context_input.answer.value,
                        normalized_value=normalized,
                    )

        await self._recompute_session_state(session_id=session_id)
        progress = await self._load_progress(session_id=session_id)
        candidates = await self._load_next_question_candidates(session_id=session_id)

        valid_candidate_found = False
        for candidate in candidates:
            render_model = self._validate_question_candidate(candidate)
            if render_model is None:
                continue
            valid_candidate_found = True
            payload = QuestionCardPayload(
                session_id=session_id,
                standard_keys=standard_keys,
                question=render_model,
                progress=progress,
            )
            return ("jsx", self._build_question_jsx(payload))

        completion_ready = (
            progress.requirements_open == 0 and progress.unanswered_questions == 0
        )
        if completion_ready:
            completion_text = await self._build_completion_text(session_id=session_id, progress=progress)
            return ("text", completion_text)

        no_candidate_text = self._build_no_candidate_text(
            progress=progress,
            stale_answer_reason=stale_answer_reason,
            had_candidates=bool(candidates),
            had_valid_candidate=valid_candidate_found,
        )
        return ("text", no_candidate_text)

    async def _ensure_constraints(self) -> None:
        if ComplianceContextOrchestrator._constraints_ready:
            return
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                CREATE CONSTRAINT session_session_id_unique IF NOT EXISTS
                FOR (s:Session) REQUIRE s.session_id IS UNIQUE
                """
            )
            await session.run(
                """
                CREATE CONSTRAINT answer_answer_id_unique IF NOT EXISTS
                FOR (a:Answer) REQUIRE a.answer_id IS UNIQUE
                """
            )
        ComplianceContextOrchestrator._constraints_ready = True

    async def _resolve_standard_keys(self, provided_keys: list[str] | None) -> list[str]:
        cleaned = sorted(
            {k.strip() for k in (provided_keys or []) if isinstance(k, str) and k.strip()}
        )

        async with self.neo4j_driver.session() as session:
            if cleaned:
                result = await session.run(
                    """
                    UNWIND $keys AS standard_key
                    MATCH (d:NormativeDocument {standard_key: standard_key})
                    RETURN DISTINCT d.standard_key AS standard_key
                    ORDER BY standard_key
                    """,
                    keys=cleaned,
                )
                rows = await result.data()
                resolved = [row["standard_key"] for row in rows if row.get("standard_key")]
                if resolved:
                    return resolved
                logger.warning(
                    "No provided standard_keys resolved to NormativeDocument nodes: %s. "
                    "Falling back to all available standards.",
                    cleaned,
                )

            result = await session.run(
                """
                MATCH (d:NormativeDocument)
                RETURN d.standard_key AS standard_key
                ORDER BY d.standard_key
                """
            )
            rows = await result.data()
        return [row["standard_key"] for row in rows if row.get("standard_key")]

    async def _ensure_session_scope(
        self,
        session_id: str,
        conversation_id: str | None,
        standard_keys: list[str],
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.execute_write(
                self._tx_ensure_session_scope,
                session_id,
                conversation_id,
                standard_keys,
            )

    @staticmethod
    async def _tx_ensure_session_scope(
        tx,
        session_id: str,
        conversation_id: str | None,
        standard_keys: list[str],
    ) -> None:
        await tx.run(
            """
            MERGE (s:Session {session_id: $session_id})
            ON CREATE SET
                s.created_at = datetime(),
                s.status = "active"
            SET s.conversation_id = coalesce(s.conversation_id, $conversation_id)
            """,
            session_id=session_id,
            conversation_id=conversation_id,
        )
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})-[rel:SCOPES]->(d:NormativeDocument)
            WHERE NOT d.standard_key IN $standard_keys
            DELETE rel
            """,
            session_id=session_id,
            standard_keys=standard_keys,
        )
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})
            UNWIND $standard_keys AS standard_key
            MATCH (d:NormativeDocument {standard_key: standard_key})
            MERGE (s)-[:SCOPES]->(d)
            """,
            session_id=session_id,
            standard_keys=standard_keys,
        )

    async def _validate_answer_target(self, session_id: str, question_key: str) -> tuple[bool, str]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                MATCH (q:DiagnosticQuestion {question_key: $question_key})-[:INFLUENCES]->(ru)
                RETURN count(DISTINCT ru) AS active_targets
                """,
                session_id=session_id,
                question_key=question_key,
            )
            row = await result.single()
        active_targets = int(row["active_targets"]) if row and row.get("active_targets") else 0
        if active_targets <= 0:
            return (
                False,
                "Diese Frage liegt außerhalb des aktuellen Scopes oder hat keine verknüpften Anforderungen.",
            )
        return (True, "")

    async def _load_question_meta(self, question_key: str) -> _QuestionCandidate | None:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (q:DiagnosticQuestion {question_key: $question_key})
                RETURN
                    q.question_key AS question_key,
                    q.prompt AS prompt,
                    coalesce(q.answer_type, "boolean") AS answer_type,
                    coalesce(q.allowed_values, []) AS allowed_values,
                    coalesce(q.language, "de") AS language
                """,
                question_key=question_key,
            )
            row = await result.single()
        if not row:
            return None
        allowed_values = row.get("allowed_values") or []
        return _QuestionCandidate(
            question_key=row["question_key"],
            prompt=row["prompt"] or "",
            answer_type=row["answer_type"] or "boolean",
            allowed_values=[str(v) for v in allowed_values],
            language=row["language"] or "de",
            impact=0,
        )

    def _normalize_answer(self, value: Any, answer_type: str, allowed_values: list[str]) -> Any | None:
        at = (answer_type or "boolean").strip().lower()
        if at == "boolean":
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                normalized = value.strip().lower()
                if normalized in {"true", "1", "yes", "ja"}:
                    return True
                if normalized in {"false", "0", "no", "nein"}:
                    return False
            return None

        if at == "single_choice":
            if not isinstance(value, str):
                return None
            normalized = value.strip()
            if not normalized:
                return None
            if allowed_values and normalized not in allowed_values:
                return None
            return normalized

        if at == "multi_choice":
            if not isinstance(value, list):
                return None
            normalized_values = [
                str(item).strip()
                for item in value
                if isinstance(item, (str, int, float)) and str(item).strip()
            ]
            deduped = sorted(set(normalized_values))
            if not deduped:
                return None
            if allowed_values and any(item not in allowed_values for item in deduped):
                return None
            return deduped

        if at == "text":
            if not isinstance(value, str):
                return None
            normalized = value.strip()
            return normalized if normalized else None

        return None

    async def _upsert_answer(
        self,
        session_id: str,
        question_key: str,
        raw_value: Any,
        normalized_value: Any,
    ) -> None:
        answer_id = f"{session_id}::{question_key}"
        raw_json = json.dumps(raw_value, ensure_ascii=False)
        normalized_json = json.dumps(normalized_value, ensure_ascii=False)
        async with self.neo4j_driver.session() as session:
            await session.execute_write(
                self._tx_upsert_answer,
                session_id,
                question_key,
                answer_id,
                raw_json,
                normalized_json,
            )

    @staticmethod
    async def _tx_upsert_answer(
        tx,
        session_id: str,
        question_key: str,
        answer_id: str,
        raw_json: str,
        normalized_json: str,
    ) -> None:
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})
            MATCH (q:DiagnosticQuestion {question_key: $question_key})
            MERGE (a:Answer {answer_id: $answer_id})
            SET
                a.value_json = $raw_json,
                a.normalized_value_json = $normalized_json,
                a.answered_at = datetime()
            MERGE (s)-[:SUBMITTED]->(a)
            MERGE (a)-[:FOR_QUESTION]->(q)
            """,
            session_id=session_id,
            question_key=question_key,
            answer_id=answer_id,
            raw_json=raw_json,
            normalized_json=normalized_json,
        )

    async def _recompute_session_state(self, session_id: str) -> None:
        scoped_ru_keys = await self._load_scoped_requirements(session_id=session_id)
        if not scoped_ru_keys:
            return
        influence_rows = await self._load_influence_rows(
            session_id=session_id,
            scoped_ru_keys=scoped_ru_keys,
        )
        exclusions, states = self._derive_states(scoped_ru_keys=scoped_ru_keys, rows=influence_rows)
        await self._write_derived_state(
            session_id=session_id,
            exclusions=exclusions,
            states=states,
        )

    async def _load_scoped_requirements(self, session_id: str) -> list[str]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                RETURN DISTINCT ru.ru_key AS ru_key
                ORDER BY ru_key
                """,
                session_id=session_id,
            )
            rows = await result.data()
        return [row["ru_key"] for row in rows if row.get("ru_key")]

    async def _load_influence_rows(
        self,
        session_id: str,
        scoped_ru_keys: list[str],
    ) -> list[_InfluenceRow]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SUBMITTED]->(a:Answer)-[:FOR_QUESTION]->(q:DiagnosticQuestion)
                MATCH (q)-[rel:INFLUENCES]->(ru:RequirementUnit)
                WHERE ru.ru_key IN $scoped_ru_keys
                RETURN
                    q.question_key AS question_key,
                    a.normalized_value_json AS normalized_value_json,
                    properties(rel) AS inf_props,
                    ru.ru_key AS ru_key
                """,
                session_id=session_id,
                scoped_ru_keys=scoped_ru_keys,
            )
            rows = await result.data()

        mapped: list[_InfluenceRow] = []
        for row in rows:
            try:
                answer_value = json.loads(row.get("normalized_value_json") or "null")
            except json.JSONDecodeError:
                continue
            mapped.append(
                _InfluenceRow(
                    question_key=row.get("question_key", ""),
                    answer_value=answer_value,
                    mode=str((row.get("inf_props") or {}).get("mode", "")),
                    when_value=str((row.get("inf_props") or {}).get("when_value", "")),
                    ru_key=row.get("ru_key", ""),
                )
            )
        return mapped

    def _derive_states(
        self,
        scoped_ru_keys: list[str],
        rows: list[_InfluenceRow],
    ) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
        excluded_by: dict[str, str] = {}
        effects: dict[str, list[tuple[str, str]]] = defaultdict(list)

        for row in rows:
            if not row.ru_key or row.ru_key not in scoped_ru_keys:
                continue
            matched = self._matches_when_value(row.answer_value, row.when_value)
            mode = row.mode.strip().lower()

            if mode == "exclude_if" and matched:
                excluded_by.setdefault(row.ru_key, row.question_key)
                continue
            if mode == "include_if" and not matched:
                excluded_by.setdefault(row.ru_key, row.question_key)
                continue

            if mode == "gaps_if" and matched:
                effects[row.ru_key].append(("gap", row.question_key))
            elif mode == "unclear_if" and matched:
                effects[row.ru_key].append(("unclear", row.question_key))
            elif mode == "satisfies_if" and matched:
                effects[row.ru_key].append(("addressed", row.question_key))

        exclusions: list[dict[str, str]] = []
        states: list[dict[str, str]] = []
        for ru_key in scoped_ru_keys:
            exclusion_source = excluded_by.get(ru_key, "")
            if exclusion_source:
                exclusions.append(
                    {"ru_key": ru_key, "source_question_key": exclusion_source}
                )
                states.append(
                    {
                        "ru_key": ru_key,
                        "state": "not_applicable",
                        "source_question_key": exclusion_source,
                    }
                )
                continue

            state = "open"
            source = ""
            if effects.get(ru_key):
                best = min(effects[ru_key], key=lambda item: STATE_PRECEDENCE[item[0]])
                state, source = best
            states.append({"ru_key": ru_key, "state": state, "source_question_key": source})

        return exclusions, states

    def _matches_when_value(self, answer_value: Any, when_value: str) -> bool:
        if when_value == "":
            return True
        try:
            expected = json.loads(when_value)
        except json.JSONDecodeError:
            expected = when_value

        if isinstance(answer_value, list):
            return expected in answer_value
        return answer_value == expected

    async def _write_derived_state(
        self,
        session_id: str,
        exclusions: list[dict[str, str]],
        states: list[dict[str, str]],
    ) -> None:
        async with self.neo4j_driver.session() as session:
            await session.execute_write(
                self._tx_write_derived_state,
                session_id,
                exclusions,
                states,
            )

    @staticmethod
    async def _tx_write_derived_state(
        tx,
        session_id: str,
        exclusions: list[dict[str, str]],
        states: list[dict[str, str]],
    ) -> None:
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})-[r:EXCLUDES]->(:RequirementUnit)
            DELETE r
            """,
            session_id=session_id,
        )
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})-[r:HAS_STATE]->(:RequirementUnit)
            DELETE r
            """,
            session_id=session_id,
        )
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})
            UNWIND $rows AS row
            MATCH (ru:RequirementUnit {ru_key: row.ru_key})
            MERGE (s)-[rel:EXCLUDES]->(ru)
            SET
                rel.source_question_key = row.source_question_key,
                rel.updated_at = datetime()
            """,
            session_id=session_id,
            rows=exclusions,
        )
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})
            UNWIND $rows AS row
            MATCH (ru:RequirementUnit {ru_key: row.ru_key})
            MERGE (s)-[rel:HAS_STATE]->(ru)
            SET
                rel.state = row.state,
                rel.source_question_key = row.source_question_key,
                rel.updated_at = datetime()
            """,
            session_id=session_id,
            rows=states,
        )

    async def _load_progress(self, session_id: str) -> ProgressCounters:
        counters = ProgressCounters()
        async with self.neo4j_driver.session() as session:
            state_result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[rel:HAS_STATE]->(:RequirementUnit)
                RETURN rel.state AS state, count(*) AS count
                """,
                session_id=session_id,
            )
            for row in await state_result.data():
                state = row.get("state")
                count = int(row.get("count") or 0)
                if state == "open":
                    counters.requirements_open = count
                elif state == "addressed":
                    counters.requirements_addressed = count
                elif state == "gap":
                    counters.requirements_gap = count
                elif state == "not_applicable":
                    counters.requirements_not_applicable = count
                elif state == "unclear":
                    counters.requirements_unclear = count
            counters.requirements_total = (
                counters.requirements_open
                + counters.requirements_addressed
                + counters.requirements_gap
                + counters.requirements_not_applicable
                + counters.requirements_unclear
            )

            q_result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                WHERE NOT EXISTS { MATCH (s)-[:EXCLUDES]->(ru) }
                MATCH (q:DiagnosticQuestion)-[:INFLUENCES]->(ru)
                WHERE NOT EXISTS {
                    MATCH (s)-[:SUBMITTED]->(:Answer)-[:FOR_QUESTION]->(q)
                }
                RETURN count(DISTINCT q) AS unanswered_questions
                """,
                session_id=session_id,
            )
            q_row = await q_result.single()
            counters.unanswered_questions = int(q_row["unanswered_questions"]) if q_row else 0

        return counters

    async def _load_next_question_candidates(self, session_id: str) -> list[_QuestionCandidate]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (d)-[:HAS_CHILD*1..]->(:Clause)-[:CONTAINS_REQUIREMENT]->(ru:RequirementUnit)
                WHERE NOT EXISTS { MATCH (s)-[:EXCLUDES]->(ru) }
                MATCH (q:DiagnosticQuestion)-[:INFLUENCES]->(ru)
                WHERE NOT EXISTS {
                    MATCH (s)-[:SUBMITTED]->(:Answer)-[:FOR_QUESTION]->(q)
                }
                WITH q, count(DISTINCT ru) AS impact
                OPTIONAL MATCH (:DiagnosticQuestion)-[f:FOLLOWS]->(q)
                WITH q, impact, min(f.order) AS follow_order
                RETURN
                    q.question_key AS question_key,
                    q.prompt AS prompt,
                    coalesce(q.answer_type, "boolean") AS answer_type,
                    coalesce(q.allowed_values, []) AS allowed_values,
                    coalesce(q.language, "de") AS language,
                    impact AS impact
                ORDER BY impact DESC, coalesce(follow_order, 2147483647), q.question_key
                LIMIT 20
                """,
                session_id=session_id,
            )
            rows = await result.data()

        candidates: list[_QuestionCandidate] = []
        for row in rows:
            candidates.append(
                _QuestionCandidate(
                    question_key=row.get("question_key", ""),
                    prompt=row.get("prompt") or "",
                    answer_type=row.get("answer_type") or "boolean",
                    allowed_values=[str(v) for v in (row.get("allowed_values") or [])],
                    language=row.get("language") or "de",
                    impact=int(row.get("impact") or 0),
                )
            )
        return candidates

    def _validate_question_candidate(self, candidate: _QuestionCandidate) -> QuestionRenderModel | None:
        answer_type = candidate.answer_type.strip().lower()
        if answer_type not in {"boolean", "single_choice", "multi_choice", "text"}:
            logger.warning("Skipping invalid question answer_type for %s", candidate.question_key)
            return None
        if not candidate.prompt.strip():
            logger.warning("Skipping empty prompt for %s", candidate.question_key)
            return None
        if answer_type in {"single_choice", "multi_choice"} and not candidate.allowed_values:
            logger.warning("Skipping choice question without allowed values: %s", candidate.question_key)
            return None
        return QuestionRenderModel(
            question_key=candidate.question_key,
            prompt=candidate.prompt.strip(),
            answer_type=answer_type,
            allowed_values=candidate.allowed_values,
            language=candidate.language or "de",
        )

    def _build_question_jsx(self, payload: QuestionCardPayload) -> str:
        encoded = base64.b64encode(payload.model_dump_json().encode("utf-8")).decode("ascii")
        return f'<CtxQuestionCard payloadB64="{encoded}" />'

    def _build_no_candidate_text(
        self,
        progress: ProgressCounters,
        stale_answer_reason: str,
        had_candidates: bool,
        had_valid_candidate: bool,
    ) -> str:
        """Fallback text when the session is not complete but no question can be rendered."""
        lines: list[str] = []
        if stale_answer_reason:
            lines.append(f"Hinweis: {stale_answer_reason}")
            lines.append("")

        lines.extend(
            [
                "Kontextphase ist noch nicht abgeschlossen, aber es konnte keine nächste Frage gerendert werden.",
                "",
                f"- Anforderungen gesamt: {progress.requirements_total}",
                f"- Offen: {progress.requirements_open}",
                f"- Addressiert: {progress.requirements_addressed}",
                f"- Gaps: {progress.requirements_gap}",
                f"- Nicht anwendbar: {progress.requirements_not_applicable}",
                f"- Unklar: {progress.requirements_unclear}",
                f"- Unbeantwortete Fragen: {progress.unanswered_questions}",
                "",
                "- Bitte Datenqualität prüfen: fehlende/ungültige prompts, answer_type oder allowed_values.",
            ]
        )

        if had_candidates and not had_valid_candidate:
            lines.append("- Kandidaten vorhanden, aber alle wurden durch die Fragevalidierung verworfen.")
        elif not had_candidates:
            lines.append("- Keine Kandidaten im aktuellen Scope gefunden.")

        return "\n".join(lines)

    async def _build_completion_text(self, session_id: str, progress: ProgressCounters) -> str:
        gap_lines: list[str] = []
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[rel:HAS_STATE {state: "gap"}]->(ru:RequirementUnit)
                RETURN coalesce(ru.title, ru.statement, ru.ru_key) AS label
                ORDER BY label
                LIMIT 5
                """,
                session_id=session_id,
            )
            rows = await result.data()
            gap_lines = [f"- {row['label']}" for row in rows if row.get("label")]

        lines = [
            "Kontextphase abgeschlossen.",
            "",
            f"- Anforderungen gesamt: {progress.requirements_total}",
            f"- Offen: {progress.requirements_open}",
            f"- Addressiert: {progress.requirements_addressed}",
            f"- Gaps: {progress.requirements_gap}",
            f"- Nicht anwendbar: {progress.requirements_not_applicable}",
            f"- Unklar: {progress.requirements_unclear}",
        ]
        if gap_lines:
            lines.extend(["", "Top Gap-Kandidaten:", *gap_lines])
        return "\n".join(lines)
