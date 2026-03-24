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

from app.compliance_graph.context_assist import ContextAssistService
from app.compliance_graph.context_contract import (
    ProgressCounters,
    QuestionBriefing,
    QuestionBriefingChunk,
    QuestionBriefingClause,
    QuestionBriefingDocument,
    QuestionBriefingEvidence,
    QuestionBriefingImpact,
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


@dataclass(slots=True)
class _ContextQuestionDef:
    key: str
    prompt: str
    answer_type: str
    required: bool = True
    allowed_values: list[str] | None = None
    assist_tools: list[str] | None = None
    number_kind: str | None = None


SECTOR_OPTIONS = [
    "Energie",
    "Verkehr / Transport",
    "Banken / Finanzwesen",
    "Gesundheitswesen",
    "Digitale Infrastruktur / IT-Dienstleistungen",
    "Öffentliche Verwaltung",
    "Herstellung / Produktion",
    "Lebensmittel / Chemie / Abfallwirtschaft",
    "Sonstige",
]

CONTEXT_QUESTION_ORDER: list[_ContextQuestionDef] = [
    _ContextQuestionDef(key="context.org_name", prompt="Name", answer_type="text"),
    _ContextQuestionDef(key="context.org_address", prompt="Adresse", answer_type="text"),
    _ContextQuestionDef(key="context.org_website", prompt="Website", answer_type="text"),
    _ContextQuestionDef(
        key="context.org_economic_sector",
        prompt="Wirtschaftssektor",
        answer_type="multi_choice",
        allowed_values=SECTOR_OPTIONS,
    ),
    _ContextQuestionDef(
        key="context.org_critical_infrastructure",
        prompt="Kritische Infrastruktur",
        answer_type="boolean",
    ),
    _ContextQuestionDef(
        key="context.org_has_production",
        prompt="Produktion vorhanden",
        answer_type="boolean",
    ),
    _ContextQuestionDef(
        key="context.org_activity_scope",
        prompt="Tätigkeitsbereich",
        answer_type="text",
        assist_tools=["web_lookup"],
    ),
    _ContextQuestionDef(
        key="context.org_employee_count",
        prompt="Mitarbeiteranzahl",
        answer_type="number",
        number_kind="int",
    ),
    _ContextQuestionDef(
        key="context.org_revenue_eur",
        prompt="Umsatz (EUR absolut)",
        answer_type="number",
    ),
    _ContextQuestionDef(
        key="context.org_balance_sheet_total_eur",
        prompt="Bilanzsumme (EUR absolut)",
        answer_type="number",
    ),
    _ContextQuestionDef(
        key="context.org_company_goals",
        prompt="Unternehmensziele",
        answer_type="text",
        assist_tools=["rewrite"],
    ),
    _ContextQuestionDef(
        key="context.org_selected_standards",
        prompt="Standards / Gesetze / Regulierungen",
        answer_type="multi_choice",
        allowed_values=[],
    ),
]

CONTEXT_QUESTION_BY_KEY = {item.key: item for item in CONTEXT_QUESTION_ORDER}


class ComplianceContextOrchestrator:
    """Graph-backed session-state orchestrator for `taskMode=context`."""

    _constraints_ready: bool = False

    def __init__(self, neo4j_driver: AsyncDriver, model_id: str | None = None):
        self.neo4j_driver = neo4j_driver
        self.assist_service = ContextAssistService(model_id=model_id)

    async def handle_turn(self, body_data: dict[str, Any]) -> tuple[Literal["jsx", "text"], str]:
        """Process one context turn and return streamed payload content."""
        await self._ensure_constraints()
        context_input = parse_context_session_input(body_data)
        conversation_id = resolve_conversation_id(body_data)
        session_id = context_input.session_id.strip() if context_input.session_id else ""
        if not session_id and conversation_id:
            recovered_session_id = await self._resolve_session_id_for_conversation(conversation_id)
            if recovered_session_id:
                session_id = recovered_session_id
        if not session_id:
            session_id = str(uuid.uuid4())

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

        context_profile = await self._load_context_profile(session_id=session_id)
        selected_from_context = self._extract_selected_standards(context_profile)
        if selected_from_context:
            standard_keys = await self._resolve_standard_keys(selected_from_context)
            if standard_keys:
                await self._ensure_session_scope(
                    session_id=session_id,
                    conversation_id=conversation_id,
                    standard_keys=standard_keys,
                )

        stale_answer_reason = ""
        if context_input.assist is not None:
            assist_payload = await self._handle_assist_request(
                session_id=session_id,
                standard_keys=standard_keys,
                context_profile=context_profile,
                question_key=context_input.assist.question_key,
                tool=context_input.assist.tool,
                raw_value=context_input.assist.value,
            )
            if assist_payload is None:
                return (
                    "text",
                    "Assist-Aktion konnte nicht ausgeführt werden. Bitte Frage und Tool-Konfiguration prüfen.",
                )
            return ("jsx", self._build_question_jsx(assist_payload))

        if context_input.answer is not None:
            question_key = context_input.answer.question_key
            context_question_def = CONTEXT_QUESTION_BY_KEY.get(question_key)
            if context_question_def is not None:
                allowed_values = context_question_def.allowed_values or []
                if question_key == "context.org_selected_standards":
                    allowed_values = [
                        option["value"] for option in await self._load_standard_options()
                    ]
                normalized = self._normalize_answer(
                    value=context_input.answer.value,
                    answer_type=context_question_def.answer_type,
                    allowed_values=allowed_values,
                    number_kind=context_question_def.number_kind,
                )
                if normalized is None:
                    return (
                        "text",
                        "Antwortformat ungültig für diese Kontextfrage. Bitte Eingabe prüfen und erneut senden.",
                    )
                await self._upsert_context_fact(
                    session_id=session_id,
                    question_key=question_key,
                    value=normalized,
                    answer_type=context_question_def.answer_type,
                    required=context_question_def.required,
                )
                context_profile = await self._load_context_profile(session_id=session_id)
                await self._refresh_context_status(session_id=session_id, context_profile=context_profile)
                selected_from_context = self._extract_selected_standards(context_profile)
                if selected_from_context:
                    selected_resolved = await self._resolve_standard_keys(selected_from_context)
                    if selected_resolved:
                        standard_keys = selected_resolved
                        await self._ensure_session_scope(
                            session_id=session_id,
                            conversation_id=conversation_id,
                            standard_keys=standard_keys,
                        )
            else:
                context_ready = self._is_context_ready(context_profile)
                if not context_ready:
                    stale_answer_reason = (
                        "Kontextprofil ist noch nicht vollständig. "
                        "Bitte zuerst alle erforderlichen Organisationsdaten ausfüllen."
                    )
                else:
                    valid, reason = await self._validate_answer_target(
                        session_id=session_id,
                        question_key=question_key,
                    )
                    if not valid:
                        stale_answer_reason = reason
                        logger.info(
                            "Skipping stale/inactive context answer in session=%s question=%s reason=%s",
                            session_id,
                            question_key,
                            reason,
                        )
                    else:
                        question_meta = await self._load_question_meta(question_key)
                        if question_meta is None:
                            logger.info(
                                "Skipping context answer because question was not found: session=%s question=%s",
                                session_id,
                                question_key,
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
                                question_key=question_key,
                                raw_value=context_input.answer.value,
                                normalized_value=normalized,
                            )

        context_profile = await self._load_context_profile(session_id=session_id)
        await self._refresh_context_status(session_id=session_id, context_profile=context_profile)

        missing_context_keys = self._missing_required_context_keys(context_profile)
        if missing_context_keys:
            context_payload = await self._build_next_context_question_payload(
                session_id=session_id,
                standard_keys=standard_keys,
                context_profile=context_profile,
                missing_keys=missing_context_keys,
            )
            if context_payload is None:
                return (
                    "text",
                    "Kontextphase konnte nicht fortgesetzt werden. Bitte prüfen Sie die Kontextkonfiguration.",
                )
            return ("jsx", self._build_question_jsx(context_payload))

        await self._recompute_session_state(session_id=session_id)
        progress = await self._load_progress(session_id=session_id)
        candidates = await self._load_next_question_candidates(session_id=session_id)

        valid_candidate_found = False
        for candidate in candidates:
            render_model = self._validate_question_candidate(candidate)
            if render_model is None:
                continue
            valid_candidate_found = True
            briefing = await self._load_question_briefing(
                session_id=session_id,
                question_key=render_model.question_key,
                impact=candidate.impact,
            )
            briefing = await self._personalize_briefing(
                briefing=briefing,
                question_prompt=render_model.prompt,
                context_profile=context_profile,
            )
            payload = QuestionCardPayload(
                session_id=session_id,
                standard_keys=standard_keys,
                question=render_model,
                question_briefing=briefing,
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
            await session.run(
                """
                CREATE CONSTRAINT context_fact_id_unique IF NOT EXISTS
                FOR (f:ContextFact) REQUIRE f.context_fact_id IS UNIQUE
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
                s.status = "active",
                s.context_status = "missing"
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

    async def _resolve_session_id_for_conversation(self, conversation_id: str) -> str | None:
        conversation = (conversation_id or "").strip()
        if not conversation:
            return None
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {conversation_id: $conversation_id})
                RETURN s.session_id AS session_id
                ORDER BY coalesce(s.context_updated_at, s.created_at) DESC
                LIMIT 1
                """,
                conversation_id=conversation,
            )
            row = await result.single()
        if not row:
            return None
        value = row.get("session_id")
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

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

    async def _upsert_context_fact(
        self,
        session_id: str,
        question_key: str,
        value: Any,
        answer_type: str,
        required: bool,
    ) -> None:
        context_fact_id = f"{session_id}::{question_key}"
        value_json = json.dumps(value, ensure_ascii=False)
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                MERGE (f:ContextFact {context_fact_id: $context_fact_id})
                SET
                    f.session_id = $session_id,
                    f.fact_key = $fact_key,
                    f.value_json = $value_json,
                    f.value_type = $value_type,
                    f.required = $required,
                    f.updated_at = datetime()
                MERGE (s)-[:HAS_CONTEXT]->(f)
                """,
                session_id=session_id,
                context_fact_id=context_fact_id,
                fact_key=question_key,
                value_json=value_json,
                value_type=answer_type,
                required=required,
            )

    async def _load_context_profile(self, session_id: str) -> dict[str, Any]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                OPTIONAL MATCH (s)-[:HAS_CONTEXT]->(f:ContextFact)
                RETURN
                    collect({
                        fact_key: f.fact_key,
                        value_json: f.value_json
                    }) AS facts,
                    s.context_profile_json AS context_profile_json
                """,
                session_id=session_id,
            )
            row = await result.single()

        profile: dict[str, Any] = {}
        if row and isinstance(row.get("context_profile_json"), str):
            try:
                parsed = json.loads(row["context_profile_json"])
                if isinstance(parsed, dict):
                    profile = parsed
            except json.JSONDecodeError:
                profile = {}

        facts = row.get("facts") if row else []
        for fact in facts or []:
            fact_key = str((fact or {}).get("fact_key") or "").strip()
            raw_value = (fact or {}).get("value_json")
            if not fact_key or not isinstance(raw_value, str):
                continue
            try:
                profile[fact_key] = json.loads(raw_value)
            except json.JSONDecodeError:
                continue
        return profile

    async def _refresh_context_status(self, session_id: str, context_profile: dict[str, Any]) -> None:
        missing = self._missing_required_context_keys(context_profile)
        status = "ready" if not missing else "collecting"
        compiled_json = json.dumps(context_profile, ensure_ascii=False)
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET
                    s.context_status = $status,
                    s.context_profile_json = $compiled_json,
                    s.context_updated_at = datetime()
                """,
                session_id=session_id,
                status=status,
                compiled_json=compiled_json,
            )

    @staticmethod
    def _extract_selected_standards(context_profile: dict[str, Any]) -> list[str]:
        raw = context_profile.get("context.org_selected_standards")
        if not isinstance(raw, list):
            return []
        return [str(item).strip() for item in raw if isinstance(item, str) and str(item).strip()]

    @staticmethod
    def _missing_required_context_keys(context_profile: dict[str, Any]) -> list[str]:
        missing: list[str] = []
        for item in CONTEXT_QUESTION_ORDER:
            if not item.required:
                continue
            value = context_profile.get(item.key)
            if value is None:
                missing.append(item.key)
                continue
            if item.answer_type == "text" and (not isinstance(value, str) or not value.strip()):
                missing.append(item.key)
            elif item.answer_type == "boolean" and not isinstance(value, bool):
                missing.append(item.key)
            elif item.answer_type == "number":
                if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                    missing.append(item.key)
            elif item.answer_type == "single_choice" and (
                not isinstance(value, str) or not value.strip()
            ):
                missing.append(item.key)
            elif item.answer_type == "multi_choice":
                if not isinstance(value, list) or len(value) == 0:
                    missing.append(item.key)
        return missing

    @staticmethod
    def _is_context_ready(context_profile: dict[str, Any]) -> bool:
        return len(ComplianceContextOrchestrator._missing_required_context_keys(context_profile)) == 0

    async def _load_standard_options(self) -> list[dict[str, str]]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (d:NormativeDocument)
                RETURN
                    d.standard_key AS standard_key,
                    coalesce(d.title, d.standard_key) AS title,
                    coalesce(d.source_kind, "standard") AS source_kind,
                    coalesce(d.version_label, "") AS version_label
                ORDER BY title, standard_key
                """
            )
            rows = await result.data()

        options: list[dict[str, str]] = []
        for row in rows:
            standard_key = str(row.get("standard_key") or "").strip()
            if not standard_key:
                continue
            title = str(row.get("title") or standard_key).strip()
            source_kind = str(row.get("source_kind") or "standard").strip()
            version_label = str(row.get("version_label") or "").strip()
            suffix = f" ({source_kind}" + (f", {version_label}" if version_label else "") + ")"
            options.append(
                {
                    "value": standard_key,
                    "label": f"{title}{suffix} - {standard_key}",
                }
            )
        return options

    async def _build_next_context_question_payload(
        self,
        session_id: str,
        standard_keys: list[str],
        context_profile: dict[str, Any],
        missing_keys: list[str],
    ) -> QuestionCardPayload | None:
        if not missing_keys:
            return None
        question_key = missing_keys[0]
        question = await self._build_context_question_payload(
            question_key=question_key,
            prefill_value=context_profile.get(question_key),
            assist_note="",
        )
        if question is None:
            return None
        progress = ProgressCounters(
            requirements_total=0,
            requirements_open=0,
            requirements_addressed=0,
            requirements_gap=0,
            requirements_not_applicable=0,
            requirements_unclear=0,
            unanswered_questions=len(missing_keys),
        )
        return QuestionCardPayload(
            session_id=session_id,
            standard_keys=standard_keys,
            question=question,
            question_briefing=None,
            progress=progress,
        )

    async def _build_context_question_payload(
        self,
        question_key: str,
        prefill_value: Any = None,
        assist_note: str = "",
    ) -> QuestionRenderModel | None:
        definition = CONTEXT_QUESTION_BY_KEY.get(question_key)
        if definition is None:
            return None

        allowed_values = list(definition.allowed_values or [])
        options: list[dict[str, str]] = [{"value": value, "label": value} for value in allowed_values]
        if question_key == "context.org_selected_standards":
            options = await self._load_standard_options()
            allowed_values = [option["value"] for option in options]

        return QuestionRenderModel(
            question_key=definition.key,
            prompt=definition.prompt,
            answer_type=definition.answer_type,  # type: ignore[arg-type]
            allowed_values=allowed_values,
            options=options,
            assist_tools=[tool for tool in (definition.assist_tools or []) if tool in {"rewrite", "web_lookup"}],
            prefill_value=prefill_value,
            assist_note=assist_note,
            language="de",
        )

    async def _handle_assist_request(
        self,
        session_id: str,
        standard_keys: list[str],
        context_profile: dict[str, Any],
        question_key: str,
        tool: str,
        raw_value: Any,
    ) -> QuestionCardPayload | None:
        definition = CONTEXT_QUESTION_BY_KEY.get(question_key)
        if definition is None:
            return None
        if tool not in {"rewrite", "web_lookup"}:
            return None
        allowed_tools = definition.assist_tools or []
        if tool not in allowed_tools:
            return None

        source_value = str(raw_value).strip() if isinstance(raw_value, str) else ""
        website_url = ""
        if tool == "web_lookup":
            website_url = str(context_profile.get("context.org_website") or "").strip()

        suggestion = await self.assist_service.suggest(
            tool=tool,  # type: ignore[arg-type]
            question_prompt=definition.prompt,
            user_value=source_value,
            website_url=website_url,
        )
        question = await self._build_context_question_payload(
            question_key=question_key,
            prefill_value=suggestion.suggested_text,
            assist_note=suggestion.note,
        )
        if question is None:
            return None

        missing_keys = self._missing_required_context_keys(context_profile)
        progress = ProgressCounters(
            requirements_total=0,
            requirements_open=0,
            requirements_addressed=0,
            requirements_gap=0,
            requirements_not_applicable=0,
            requirements_unclear=0,
            unanswered_questions=len(missing_keys),
        )
        return QuestionCardPayload(
            session_id=session_id,
            standard_keys=standard_keys,
            question=question,
            question_briefing=None,
            progress=progress,
        )

    def _normalize_answer(
        self,
        value: Any,
        answer_type: str,
        allowed_values: list[str],
        number_kind: str | None = None,
    ) -> Any | None:
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

        if at == "number":
            if isinstance(value, bool):
                return None
            if isinstance(value, (int, float)):
                numeric = float(value)
            elif isinstance(value, str):
                cleaned = value.strip().replace(",", ".")
                if not cleaned:
                    return None
                try:
                    numeric = float(cleaned)
                except ValueError:
                    return None
            else:
                return None

            if numeric < 0:
                return None
            if number_kind == "int":
                return int(numeric)
            return numeric

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
        if answer_type not in {"boolean", "single_choice", "multi_choice", "text", "number"}:
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
            options=[],
            assist_tools=[],
            prefill_value=None,
            assist_note="",
            language=candidate.language or "de",
        )

    def _build_question_jsx(self, payload: QuestionCardPayload) -> str:
        encoded = base64.b64encode(payload.model_dump_json().encode("utf-8")).decode("ascii")
        return f'<CtxQuestionCard payloadB64="{encoded}" />'

    async def _load_question_briefing(
        self,
        session_id: str,
        question_key: str,
        impact: int,
    ) -> QuestionBriefing:
        briefing = QuestionBriefing(
            impact=QuestionBriefingImpact(requirements_count=max(0, int(impact or 0)))
        )
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (q:DiagnosticQuestion {question_key: $question_key})-[:INFLUENCES]->(ru:RequirementUnit)
                MATCH (d)-[:HAS_CHILD*1..]->(c:Clause)-[:CONTAINS_REQUIREMENT]->(ru)
                WHERE NOT EXISTS { MATCH (s)-[:EXCLUDES]->(ru) }
                OPTIONAL MATCH (ch:NormativeChunk)-[:SOURCE_FOR]->(ru)
                OPTIONAL MATCH (ru)-[:VERIFIED_BY]->(ev:EvidenceType)
                WITH d, c, ru, ch, collect(DISTINCT ev)[0..3] AS evidence_nodes
                ORDER BY c.clause_path, ru.ru_key, ch.chunk_key
                LIMIT 1
                RETURN
                    coalesce(d.standard_key, "") AS standard_key,
                    coalesce(d.title, "") AS document_title,
                    coalesce(d.version_label, "") AS version_label,
                    coalesce(c.clause_id, "") AS clause_id,
                    coalesce(c.clause_path, "") AS clause_path,
                    coalesce(c.heading_text, "") AS heading_text,
                    coalesce(ch.chunk_key, "") AS chunk_key,
                    left(coalesce(ch.text_contextualized, ch.text_raw, ""), 280) AS chunk_preview,
                    coalesce(ru.title, left(coalesce(ru.statement, ""), 180)) AS summary,
                    [ev IN evidence_nodes | {
                        title: coalesce(ev.title, ""),
                        hint: coalesce(ev.hint, ""),
                        example: coalesce(ev.example, "")
                    }] AS evidence
                """,
                session_id=session_id,
                question_key=question_key,
            )
            row = await result.single()

        if not row:
            return briefing

        evidence_items = [
            QuestionBriefingEvidence(
                title=str(item.get("title", "")),
                hint=str(item.get("hint", "")),
                example=str(item.get("example", "")),
            )
            for item in (row.get("evidence") or [])
            if isinstance(item, dict)
        ]

        return QuestionBriefing(
            document=QuestionBriefingDocument(
                standard_key=str(row.get("standard_key", "")),
                title=str(row.get("document_title", "")),
                version_label=str(row.get("version_label", "")),
            ),
            clause=QuestionBriefingClause(
                clause_id=str(row.get("clause_id", "")),
                clause_path=str(row.get("clause_path", "")),
                heading_text=str(row.get("heading_text", "")),
            ),
            chunk=QuestionBriefingChunk(
                chunk_key=str(row.get("chunk_key", "")),
                preview=str(row.get("chunk_preview", "")),
            ),
            summary=str(row.get("summary", "")),
            evidence=evidence_items,
            impact=briefing.impact,
        )

    async def _personalize_briefing(
        self,
        briefing: QuestionBriefing,
        question_prompt: str,
        context_profile: dict[str, Any],
    ) -> QuestionBriefing:
        employee_count = context_profile.get("context.org_employee_count")
        size_hint = self._size_hint(employee_count)
        activity_scope = str(context_profile.get("context.org_activity_scope") or "").strip()
        has_production = context_profile.get("context.org_has_production")

        personalized_summary = briefing.summary
        if size_hint:
            personalized_summary = f"Kontext ({size_hint}): {personalized_summary}".strip()
        if activity_scope:
            personalized_summary = (
                f"{personalized_summary}\n"
                f"Organisationskontext Tätigkeitsbereich: {activity_scope}"
            ).strip()

        personalized_evidence = []
        source_evidence: list[dict[str, str]] = []
        for item in briefing.evidence:
            hint = item.hint
            if size_hint:
                hint = f"{hint} (Ausprägung für {size_hint}).".strip()
            if has_production is True:
                hint = f"{hint} Produktionsnachweise bevorzugt ergänzen.".strip()
            elif has_production is False:
                hint = f"{hint} Fokus auf Service-/Prozessnachweise.".strip()
            evidence_item = {
                "title": item.title,
                "hint": hint,
                "example": item.example,
            }
            source_evidence.append(evidence_item)
            personalized_evidence.append(evidence_item)

        llm_personalization = await self.assist_service.personalize_briefing(
            question_prompt=question_prompt,
            summary=personalized_summary,
            evidence_items=source_evidence,
            context_profile=context_profile,
        )
        if llm_personalization is not None:
            candidate_summary = llm_personalization.summary.strip()
            if candidate_summary:
                personalized_summary = candidate_summary

            for idx, hint in enumerate(llm_personalization.evidence_hints):
                if idx >= len(personalized_evidence):
                    break
                hint_text = str(hint).strip()
                if hint_text:
                    personalized_evidence[idx]["hint"] = hint_text

        evidence_models = [
            QuestionBriefingEvidence(
                title=item["title"],
                hint=item["hint"],
                example=item["example"],
            )
            for item in personalized_evidence
        ]

        return QuestionBriefing(
            document=briefing.document,
            clause=briefing.clause,
            chunk=briefing.chunk,
            summary=personalized_summary,
            evidence=evidence_models,
            impact=briefing.impact,
        )

    @staticmethod
    def _size_hint(employee_count: Any) -> str:
        if not isinstance(employee_count, (int, float)) or isinstance(employee_count, bool):
            return ""
        value = int(employee_count)
        if value <= 1:
            return "Ein-Personen-Unternehmen"
        if value < 10:
            return "kleines Unternehmen (<10 Mitarbeitende)"
        if value < 50:
            return "kleines Unternehmen (<50 Mitarbeitende)"
        if value < 250:
            return "mittleres Unternehmen (50-249 Mitarbeitende)"
        return "großes Unternehmen (>=250 Mitarbeitende)"

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
