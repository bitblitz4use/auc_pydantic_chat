"""Deterministic compliance context orchestrator (session-stage runtime)."""

from __future__ import annotations

import base64
import json
import logging
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal

from neo4j import AsyncDriver

from app.compliance_graph.context_assist import ContextAssistService
from app.compliance_graph.context_contract import (
    ContextChallengeBriefing,
    ContextChallengeChunkEvidence,
    ProgressCounters,
    QuestionBriefing,
    QuestionBriefingChunk,
    QuestionBriefingClause,
    QuestionConversationCue,
    QuestionBriefingDocument,
    QuestionBriefingEvidence,
    QuestionBriefingImpact,
    QuestionCardPayload,
    QuestionRenderModel,
    parse_context_session_input,
    resolve_conversation_id,
    resolve_latest_user_text,
)
from app.compliance_graph.context_document_service import ContextDocumentService

logger = logging.getLogger(__name__)

STATE_PRECEDENCE: dict[str, int] = {
    "not_applicable": 0,
    "gap": 1,
    "unclear": 2,
    "addressed": 3,
    "open": 4,
}

NON_NORMATIVE_CLAUSE_TOKENS = (
    "bild",
    "abbildung",
    "figure",
    "table",
    "tabelle",
    "anhang",
    "appendix",
)

NORMATIVE_SIGNAL_TOKENS = (
    " muss ",
    " müssen ",
    " hat ",
    " haben ",
    " soll ",
    " sollen ",
    " shall ",
    " should ",
)


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
        key="context.org_handbook_upload",
        prompt="Unternehmenshandbuch / Kontextdokument hochladen",
        answer_type="file_upload",
    ),
    _ContextQuestionDef(
        key="context.org_selected_standards",
        prompt="Standards / Gesetze / Regulierungen",
        answer_type="multi_choice",
        allowed_values=[],
    ),
]

CONTEXT_QUESTION_BY_KEY = {item.key: item for item in CONTEXT_QUESTION_ORDER}
CHALLENGE_CONFIRM_QUESTION_KEY = "context.run_full_challenge_now"


class ComplianceContextOrchestrator:
    """Graph-backed session-state orchestrator for `taskMode=context`."""

    _constraints_ready: bool = False

    def __init__(
        self,
        neo4j_driver: AsyncDriver,
        model_id: str | None = None,
        qdrant_client: Any | None = None,
    ):
        self.neo4j_driver = neo4j_driver
        self.assist_service = ContextAssistService(model_id=model_id)
        self.model_id = model_id
        self.qdrant_client = qdrant_client

    async def handle_turn(self, body_data: dict[str, Any]) -> tuple[Literal["jsx", "text", "handoff"], str]:
        """Process one context turn and return streamed payload content."""
        await self._ensure_constraints()
        context_input = parse_context_session_input(body_data)
        conversation_id = resolve_conversation_id(body_data)
        latest_user_text = (context_input.free_text or resolve_latest_user_text(body_data)).strip()
        latest_user_text = re.sub(r"\n?\u200bctx-\d+\s*$", "", latest_user_text).strip()
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
        interaction_mode = await self._load_interaction_mode(session_id=session_id)

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
        include_transition_cue = False
        has_explicit_control = context_input.control is not None
        if context_input.control is not None:
            action = context_input.control.action
            control_reason = (context_input.control.reason or "").strip()
            control_confirm = bool(context_input.control.confirm)
            if action == "status":
                status_text = await self._build_interaction_status_text(
                    session_id=session_id,
                    interaction_mode=interaction_mode,
                )
                return ("text", status_text)
            if action == "pause":
                if interaction_mode == "paused":
                    return ("text", "Fragebogen ist bereits pausiert.")
                await self._set_interaction_mode(
                    session_id=session_id,
                    mode="paused",
                    reason=control_reason or "user_control_pause",
                )
                return ("text", "Fragebogen ist pausiert. Du kannst normal weiter chatten.")
            if action == "stop":
                if interaction_mode == "stopped":
                    return ("text", "Fragebogen ist bereits gestoppt.")
                if not control_confirm:
                    return (
                        "text",
                        "Soll ich den Fragebogen wirklich stoppen? Sende Stop erneut mit Bestätigung.",
                    )
                await self._set_interaction_mode(
                    session_id=session_id,
                    mode="stopped",
                    reason=control_reason or "user_control_stop",
                )
                return ("text", "Fragebogen wurde gestoppt. Du kannst jederzeit mit Resume fortsetzen.")
            if action == "resume":
                if interaction_mode == "active":
                    return ("text", "Fragebogen ist bereits aktiv.")
                await self._set_interaction_mode(
                    session_id=session_id,
                    mode="active",
                    reason=control_reason or "user_control_resume",
                )
                interaction_mode = "active"
                include_transition_cue = await self._consume_transition_cue_flag(session_id=session_id)

        if (
            context_input.answer is None
            and context_input.assist is None
            and latest_user_text
            and not has_explicit_control
            and not self._is_context_bootstrap_text(latest_user_text)
        ):
            implied_action = self._detect_control_intent(latest_user_text)
            if implied_action is not None:
                if implied_action == "status":
                    status_text = await self._build_interaction_status_text(
                        session_id=session_id,
                        interaction_mode=interaction_mode,
                    )
                    return ("text", status_text)
                if implied_action == "pause":
                    await self._set_interaction_mode(
                        session_id=session_id,
                        mode="paused",
                        reason="implicit_pause_intent",
                    )
                    return ("text", "Fragebogen ist pausiert. Du kannst normal weiter chatten.")
                if implied_action == "stop":
                    await self._set_interaction_mode(
                        session_id=session_id,
                        mode="stopped",
                        reason="implicit_stop_intent",
                    )
                    return ("text", "Fragebogen wurde gestoppt. Mit 'resume' kannst du wieder einsteigen.")
                if implied_action == "resume":
                    await self._set_interaction_mode(
                        session_id=session_id,
                        mode="active",
                        reason="implicit_resume_intent",
                    )
                    interaction_mode = "active"
                    include_transition_cue = await self._consume_transition_cue_flag(session_id=session_id)
            else:
                if interaction_mode == "active":
                    await self._set_interaction_mode(
                        session_id=session_id,
                        mode="paused",
                        reason="auto_pause_for_free_chat",
                    )
                return ("handoff", latest_user_text)

        if interaction_mode in {"paused", "stopped"} and context_input.answer is None and context_input.assist is None:
            if interaction_mode == "paused":
                return ("text", "Fragebogen ist pausiert. Sende 'resume' zum Fortsetzen oder chatte normal weiter.")
            return ("text", "Fragebogen ist gestoppt. Sende 'resume', falls du ihn wieder aufnehmen möchtest.")
        if interaction_mode in {"paused", "stopped"} and (
            context_input.answer is not None or context_input.assist is not None
        ):
            if interaction_mode == "paused":
                return ("text", "Fragebogen ist pausiert. Bitte zuerst 'resume' senden, bevor du Antworten übermittelst.")
            return ("text", "Fragebogen ist gestoppt. Bitte zuerst 'resume' senden, bevor du Antworten übermittelst.")

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
            await self._set_pending_question_key(
                session_id=session_id,
                question_key=assist_payload.question.question_key,
            )
            return ("jsx", self._build_question_jsx(assist_payload))

        if context_input.answer is not None:
            question_key = context_input.answer.question_key
            if question_key == CHALLENGE_CONFIRM_QUESTION_KEY:
                normalized = self._normalize_answer(
                    value=context_input.answer.value,
                    answer_type="boolean",
                    allowed_values=[],
                )
                if normalized is None:
                    return (
                        "text",
                        "Bitte Ja oder Nein auswählen, um den vollständigen Challenge-Lauf zu starten oder zu überspringen.",
                    )
                await self._record_challenge_prompt_decision(
                    session_id=session_id,
                    run_now=bool(normalized),
                )
                if bool(normalized):
                    challenge_service = ContextDocumentService(
                        neo4j_driver=self.neo4j_driver,
                        qdrant_client=self.qdrant_client,
                        model_id=self.model_id,
                    )
                    run_result = await challenge_service.run_full_challenge(
                        session_id=session_id,
                        model_id=self.model_id,
                    )
                    return ("jsx", self._build_challenge_status_jsx(run_result))
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
                                manual_rationale=context_input.answer.manual_rationale,
                                manual_citations=context_input.answer.manual_citations,
                                manual_evidence_text=context_input.answer.manual_evidence_text,
                            )
                            if bool(context_input.answer.trigger_auto_challenge):
                                challenge_service = ContextDocumentService(
                                    neo4j_driver=self.neo4j_driver,
                                    qdrant_client=self.qdrant_client,
                                    model_id=self.model_id,
                                )
                                await challenge_service.run_question_challenge(
                                    session_id=session_id,
                                    question_key=question_key,
                                    draft_answer_value=normalized,
                                    manual_evidence_text=str(
                                        context_input.answer.manual_evidence_text or ""
                                    ).strip(),
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
                include_transition_cue=include_transition_cue,
            )
            if context_payload is None:
                return (
                    "text",
                    "Kontextphase konnte nicht fortgesetzt werden. Bitte prüfen Sie die Kontextkonfiguration.",
                )
            await self._set_pending_question_key(
                session_id=session_id,
                question_key=context_payload.question.question_key,
            )
            return ("jsx", self._build_question_jsx(context_payload))

        should_prompt_baseline = await self._should_prompt_context_challenge_baseline(session_id=session_id)
        if should_prompt_baseline:
            await self._mark_context_challenge_prompted(session_id=session_id)
            await self._recompute_session_state(session_id=session_id)
            progress = await self._load_progress(session_id=session_id)
            confirm_payload = self._build_challenge_confirmation_payload(
                session_id=session_id,
                standard_keys=standard_keys,
                progress=progress,
            )
            await self._set_pending_question_key(
                session_id=session_id,
                question_key=confirm_payload.question.question_key,
            )
            return ("jsx", self._build_question_jsx(confirm_payload))

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
            conversation = None
            if include_transition_cue:
                conversation = await self._build_question_conversation_cue(
                    session_id=session_id,
                    stage="graph",
                    question_prompt=render_model.prompt,
                    context_profile=context_profile,
                    unanswered_questions=progress.unanswered_questions,
                    requirements_open=progress.requirements_open,
                    impact=candidate.impact,
                )
            payload = QuestionCardPayload(
                session_id=session_id,
                standard_keys=standard_keys,
                question=render_model,
                conversation=conversation,
                question_briefing=briefing,
                progress=progress,
            )
            await self._set_pending_question_key(
                session_id=session_id,
                question_key=render_model.question_key,
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

    async def _should_prompt_context_challenge_baseline(self, session_id: str) -> bool:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                OPTIONAL MATCH (s)-[:HAS_CONTEXT_DOCUMENT]->(d:ContextDocument)
                RETURN
                    coalesce(s.context_challenge_baseline_confirmed_run, false) AS baseline_run,
                    coalesce(s.context_challenge_prompted_once, false) AS prompted_once,
                    count(
                        CASE
                            WHEN coalesce(d.ingest_status, "") IN ["completed", "completed_with_warnings"] THEN 1
                        END
                    ) AS completed_docs
                """,
                session_id=session_id,
            )
            row = await result.single()
        if not row:
            return False
        baseline_run = bool(row.get("baseline_run"))
        prompted_once = bool(row.get("prompted_once"))
        completed_docs = int(row.get("completed_docs") or 0)
        return completed_docs > 0 and not baseline_run and not prompted_once

    async def _mark_context_challenge_prompted(self, session_id: str) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET s.context_challenge_prompted_once = true
                """,
                session_id=session_id,
            )

    async def _record_challenge_prompt_decision(self, *, session_id: str, run_now: bool) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET
                    s.context_challenge_prompted_once = true,
                    s.context_challenge_last_decision = $decision,
                    s.context_challenge_last_decision_at = datetime()
                """,
                session_id=session_id,
                decision="run_now" if run_now else "not_now",
            )

    @staticmethod
    def _build_challenge_confirmation_payload(
        *,
        session_id: str,
        standard_keys: list[str],
        progress: ProgressCounters,
    ) -> QuestionCardPayload:
        return QuestionCardPayload(
            session_id=session_id,
            standard_keys=standard_keys,
            question=QuestionRenderModel(
                question_key=CHALLENGE_CONFIRM_QUESTION_KEY,
                prompt="Kontextdokumente sind indexiert. Vollständigen Challenge-Lauf jetzt starten?",
                answer_type="boolean",
                allowed_values=[],
                options=[],
                assist_tools=[],
                prefill_value=None,
                assist_note="Ja startet den Baseline-Lauf, Nein setzt den Fragebogen direkt fort.",
                language="de",
            ),
            conversation=None,
            question_briefing=None,
            progress=progress,
        )

    @staticmethod
    def _build_challenge_status_jsx(run_result: dict[str, Any]) -> str:
        payload = {
            "session_id": str(run_result.get("session_id", "")),
            "challenge_job_id": str(run_result.get("challenge_job_id", "")),
            "status": str(run_result.get("status", "queued")),
        }
        encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode("utf-8")).decode("ascii")
        return f'<CtxChallengeStatusCard payloadB64="{encoded}" />'

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
            await session.run(
                """
                CREATE CONSTRAINT context_document_id_unique IF NOT EXISTS
                FOR (d:ContextDocument) REQUIRE d.context_document_id IS UNIQUE
                """
            )
            await session.run(
                """
                CREATE CONSTRAINT context_chunk_id_unique IF NOT EXISTS
                FOR (c:ContextChunk) REQUIRE c.context_chunk_id IS UNIQUE
                """
            )
            await session.run(
                """
                CREATE CONSTRAINT session_requirement_state_id_unique IF NOT EXISTS
                FOR (rs:SessionRequirementState) REQUIRE rs.state_id IS UNIQUE
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
                s.context_status = "missing",
                s.interaction_mode = "active",
                s.emit_transition_cue_once = false
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

    @staticmethod
    def _is_context_bootstrap_text(user_text: str) -> bool:
        lowered = user_text.strip().lower()
        if not lowered:
            return True
        return lowered in {"compliance context resume", "compliance context start"}

    @staticmethod
    def _detect_control_intent(
        user_text: str,
    ) -> Literal["pause", "resume", "stop", "status"] | None:
        normalized = " ".join(user_text.strip().lower().split())
        if not normalized:
            return None
        if any(token in normalized for token in ("status", "fortschritt", "where am i", "wo stehe ich")):
            return "status"
        if any(token in normalized for token in ("pause", "paus", "später", "later", "break")):
            return "pause"
        if any(token in normalized for token in ("stop", "beenden", "abbrechen", "cancel questionnaire")):
            return "stop"
        if any(token in normalized for token in ("resume", "weiter", "fortsetzen", "continue")):
            return "resume"
        return None

    async def _load_interaction_mode(
        self,
        session_id: str,
    ) -> Literal["active", "paused", "stopped"]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                RETURN coalesce(s.interaction_mode, "active") AS interaction_mode
                """,
                session_id=session_id,
            )
            row = await result.single()
        value = str(row.get("interaction_mode") or "active") if row else "active"
        if value not in {"active", "paused", "stopped"}:
            return "active"
        return value  # type: ignore[return-value]

    async def _set_interaction_mode(
        self,
        session_id: str,
        mode: Literal["active", "paused", "stopped"],
        reason: str = "",
    ) -> None:
        previous_mode = await self._load_interaction_mode(session_id=session_id)
        emit_transition_cue_once = mode == "active" and previous_mode in {"paused", "stopped"}
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET
                    s.interaction_mode = $mode,
                    s.interaction_reason = $reason,
                    s.interaction_updated_at = datetime(),
                    s.emit_transition_cue_once = $emit_transition_cue_once
                """,
                session_id=session_id,
                mode=mode,
                reason=reason,
                emit_transition_cue_once=emit_transition_cue_once,
            )

    async def _consume_transition_cue_flag(self, session_id: str) -> bool:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                WITH s, coalesce(s.emit_transition_cue_once, false) AS should_emit
                SET s.emit_transition_cue_once = false
                RETURN should_emit AS should_emit
                """,
                session_id=session_id,
            )
            row = await result.single()
        return bool(row.get("should_emit")) if row else False

    async def _set_pending_question_key(self, session_id: str, question_key: str) -> None:
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET s.pending_question_key = $question_key
                """,
                session_id=session_id,
                question_key=question_key,
            )

    async def _build_interaction_status_text(
        self,
        session_id: str,
        interaction_mode: Literal["active", "paused", "stopped"],
    ) -> str:
        pending_question_key = ""
        async with self.neo4j_driver.session() as session:
            pending_result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                RETURN coalesce(s.pending_question_key, "") AS pending_question_key
                """,
                session_id=session_id,
            )
            pending_row = await pending_result.single()
            if pending_row:
                pending_question_key = str(pending_row.get("pending_question_key") or "").strip()
        profile = await self._load_context_profile(session_id=session_id)
        missing_context_keys = self._missing_required_context_keys(profile)
        if missing_context_keys:
            text = (
                f"Fragebogen-Status: {interaction_mode}\n"
                f"- Fehlende Basisangaben: {len(missing_context_keys)}\n"
                "- Mit 'resume' geht es weiter."
            )
            if pending_question_key:
                text += f"\n- Letzte Frage: {pending_question_key}"
            return text
        await self._recompute_session_state(session_id=session_id)
        progress = await self._load_progress(session_id=session_id)
        text = (
            f"Fragebogen-Status: {interaction_mode}\n"
            f"- Offen: {progress.requirements_open}\n"
            f"- Addressiert: {progress.requirements_addressed}\n"
            f"- Gaps: {progress.requirements_gap}\n"
            f"- Unbeantwortete Fragen: {progress.unanswered_questions}"
        )
        if pending_question_key:
            text += f"\n- Letzte Frage: {pending_question_key}"
        return text

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
            elif item.answer_type == "file_upload":
                if not isinstance(value, dict):
                    missing.append(item.key)
                    continue
                status = str(value.get("ingest_status") or "").strip().lower()
                if not str(value.get("context_document_id") or "").strip():
                    missing.append(item.key)
                elif status in {"failed", "unknown"}:
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
        include_transition_cue: bool = False,
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
        required_total = len([item for item in CONTEXT_QUESTION_ORDER if item.required])
        current_index = max(1, required_total - len(missing_keys) + 1)
        conversation = None
        if include_transition_cue:
            conversation = await self._build_question_conversation_cue(
                session_id=session_id,
                stage="context",
                question_prompt=question.prompt,
                context_profile=context_profile,
                question_index=current_index,
                total_questions=required_total,
                unanswered_questions=len(missing_keys),
                requirements_open=0,
                impact=0,
            )
        return QuestionCardPayload(
            session_id=session_id,
            standard_keys=standard_keys,
            question=question,
            conversation=conversation,
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
            conversation=None,
            question_briefing=None,
            progress=progress,
        )

    async def _build_question_conversation_cue(
        self,
        *,
        session_id: str,
        stage: Literal["context", "graph"],
        question_prompt: str,
        context_profile: dict[str, Any],
        question_index: int | None = None,
        total_questions: int | None = None,
        unanswered_questions: int | None = None,
        requirements_open: int | None = None,
        impact: int | None = None,
    ) -> QuestionConversationCue | None:
        if not question_prompt.strip():
            return None

        recent_cues = await self._load_recent_question_cues(session_id=session_id)
        cue = await self.assist_service.compose_question_cue(
            stage=stage,
            question_index=question_index,
            total_questions=total_questions,
            unanswered_questions=unanswered_questions,
            requirements_open=requirements_open,
            impact=impact,
            context_profile=context_profile,
            recent_cues=recent_cues,
        )
        lead_text = self._compact_conversation_text(cue.lead_text if cue else "")
        followup_text = self._compact_conversation_text(cue.followup_text if cue else "")

        # Deterministic fallback only for transition-triggered cue moments.
        if not lead_text and not followup_text:
            if stage == "context":
                lead_text = "Weiter geht's - wir nehmen den Fragebogen wieder auf."
            else:
                followup_text = "Super, wir sind wieder im Flow."

        if not lead_text and not followup_text:
            return None

        await self._store_recent_question_cues(
            session_id=session_id,
            cues=[*recent_cues, lead_text, followup_text],
        )
        return QuestionConversationCue(
            lead_text=lead_text,
            followup_text=followup_text,
        )

    @staticmethod
    def _compact_conversation_text(value: str, max_len: int = 160) -> str:
        text = " ".join(str(value or "").split()).strip()
        if not text:
            return ""
        if len(text) <= max_len:
            return text
        shortened = text[: max_len - 1].rstrip()
        return f"{shortened}..."

    async def _load_recent_question_cues(self, session_id: str) -> list[str]:
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                RETURN s.context_recent_cues_json AS cues_json
                """,
                session_id=session_id,
            )
            row = await result.single()

        raw_json = row.get("cues_json") if row else None
        if not isinstance(raw_json, str) or not raw_json.strip():
            return []
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            return []
        if not isinstance(parsed, list):
            return []
        return [
            str(item).strip()
            for item in parsed
            if isinstance(item, str) and str(item).strip()
        ][:3]

    async def _store_recent_question_cues(self, session_id: str, cues: list[str]) -> None:
        compacted = [
            cue
            for cue in (" ".join(str(item).split()).strip() for item in cues)
            if cue
        ]
        if not compacted:
            return
        recent = compacted[-3:]
        cues_json = json.dumps(recent, ensure_ascii=False)
        async with self.neo4j_driver.session() as session:
            await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                SET s.context_recent_cues_json = $cues_json
                """,
                session_id=session_id,
                cues_json=cues_json,
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

        if at == "file_upload":
            if not isinstance(value, dict):
                return None
            context_document_id = str(value.get("context_document_id") or "").strip()
            if not context_document_id:
                return None
            ingest_status = str(value.get("ingest_status") or "queued").strip().lower()
            filename = str(value.get("filename") or "").strip()
            return {
                "context_document_id": context_document_id,
                "ingest_status": ingest_status,
                "filename": filename,
                "ingest_job_id": str(value.get("ingest_job_id") or "").strip(),
            }

        return None

    async def _upsert_answer(
        self,
        session_id: str,
        question_key: str,
        raw_value: Any,
        normalized_value: Any,
        manual_rationale: str | None = None,
        manual_citations: list[dict[str, Any]] | None = None,
        manual_evidence_text: str | None = None,
    ) -> None:
        answer_id = f"{session_id}::{question_key}"
        raw_json = json.dumps(raw_value, ensure_ascii=False)
        normalized_json = json.dumps(normalized_value, ensure_ascii=False)
        manual_citations_json = json.dumps(manual_citations or [], ensure_ascii=False)
        async with self.neo4j_driver.session() as session:
            await session.execute_write(
                self._tx_upsert_answer,
                session_id,
                question_key,
                answer_id,
                raw_json,
                normalized_json,
                str(manual_rationale or "").strip(),
                manual_citations_json,
                str(manual_evidence_text or "").strip(),
            )

    @staticmethod
    async def _tx_upsert_answer(
        tx,
        session_id: str,
        question_key: str,
        answer_id: str,
        raw_json: str,
        normalized_json: str,
        manual_rationale: str,
        manual_citations_json: str,
        manual_evidence_text: str,
    ) -> None:
        await tx.run(
            """
            MATCH (s:Session {session_id: $session_id})
            MATCH (q:DiagnosticQuestion {question_key: $question_key})
            MERGE (a:Answer {answer_id: $answer_id})
            SET
                a.value_json = $raw_json,
                a.normalized_value_json = $normalized_json,
                a.manual_rationale = $manual_rationale,
                a.manual_citations_json = $manual_citations_json,
                a.manual_evidence_text = $manual_evidence_text,
                a.answered_at = datetime()
            MERGE (s)-[:SUBMITTED]->(a)
            MERGE (a)-[:FOR_QUESTION]->(q)
            """,
            session_id=session_id,
            question_key=question_key,
            answer_id=answer_id,
            raw_json=raw_json,
            normalized_json=normalized_json,
            manual_rationale=manual_rationale,
            manual_citations_json=manual_citations_json,
            manual_evidence_text=manual_evidence_text,
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
            MATCH (s:Session {session_id: $session_id})
            UNWIND $rows AS row
            MATCH (ru:RequirementUnit {ru_key: row.ru_key})
            OPTIONAL MATCH (s)-[:SUBMITTED]->(a:Answer {answer_id: $session_id + "::" + row.source_question_key})
            MERGE (rs:SessionRequirementState {state_id: $session_id + "::" + row.ru_key})
            SET
                rs.session_id = $session_id,
                rs.ru_key = row.ru_key,
                rs.manual_state = row.state,
                rs.manual_source_question_key = row.source_question_key,
                rs.manual_rationale = coalesce(a.manual_rationale, ""),
                rs.manual_citations_json = coalesce(a.manual_citations_json, "[]"),
                rs.manual_evidence_text = coalesce(a.manual_evidence_text, ""),
                rs.updated_at = datetime()
            MERGE (s)-[:HAS_REQUIREMENT_STATE]->(rs)
            MERGE (rs)-[:FOR_REQUIREMENT]->(ru)
            """,
            session_id=session_id,
            rows=states,
        )
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
            MATCH (s)-[:HAS_REQUIREMENT_STATE]->(rs:SessionRequirementState)-[:FOR_REQUIREMENT]->(ru:RequirementUnit)
            WITH s, rs, ru,
                 coalesce(rs.manual_state, "open") AS manual_state,
                 coalesce(rs.auto_challenge_state, "open") AS auto_state
            WITH s, rs, ru,
                CASE
                    WHEN manual_state = "not_applicable" THEN "not_applicable"
                    WHEN manual_state IN ["gap", "unclear", "addressed"] THEN manual_state
                    WHEN auto_state IN ["gap", "unclear", "addressed"] THEN auto_state
                    ELSE "open"
                END AS effective_state
            SET
                rs.effective_state = effective_state,
                rs.updated_at = datetime()
            MERGE (s)-[rel:HAS_STATE]->(ru)
            SET
                rel.state = effective_state,
                rel.source = CASE
                    WHEN coalesce(rs.manual_state, "open") IN ["not_applicable", "gap", "unclear", "addressed"] THEN "manual_state"
                    WHEN coalesce(rs.auto_challenge_state, "open") IN ["gap", "unclear", "addressed"] THEN "auto_challenge_state"
                    ELSE "open"
                END,
                rel.source_question_key = coalesce(rs.manual_source_question_key, ""),
                rel.updated_at = datetime()
            """,
            session_id=session_id,
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
        if answer_type not in {"boolean", "single_choice", "multi_choice", "text", "number", "file_upload"}:
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
        context_challenge = await self._load_context_challenge_briefing(
            session_id=session_id,
            question_key=question_key,
        )
        briefing = QuestionBriefing(
            context_challenge=context_challenge,
            impact=QuestionBriefingImpact(requirements_count=max(0, int(impact or 0)))
        )
        async with self.neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})-[:SCOPES]->(d:NormativeDocument)
                MATCH (q:DiagnosticQuestion {question_key: $question_key})-[:INFLUENCES]->(ru:RequirementUnit)
                MATCH (d)-[:HAS_CHILD*1..]->(c:Clause)-[:CONTAINS_REQUIREMENT]->(ru)
                WHERE NOT EXISTS { MATCH (s)-[:EXCLUDES]->(ru) }
                WITH DISTINCT d, c, ru
                OPTIONAL MATCH (ch:NormativeChunk)-[:SOURCE_FOR]->(ru)
                WITH d, c, ru, head(collect(ch)) AS source_chunk
                OPTIONAL MATCH (ru)-[:VERIFIED_BY]->(ev:EvidenceType)
                WITH d, c, ru, source_chunk, collect(DISTINCT ev)[0..3] AS evidence_nodes
                ORDER BY ru.ru_key
                RETURN
                    coalesce(d.standard_key, "") AS standard_key,
                    coalesce(d.title, "") AS document_title,
                    coalesce(d.version_label, "") AS version_label,
                    coalesce(c.clause_id, "") AS clause_id,
                    coalesce(c.clause_path, "") AS clause_path,
                    coalesce(c.heading_text, "") AS heading_text,
                    count(DISTINCT ru) AS clause_impact,
                    collect(DISTINCT {
                        ru_key: coalesce(ru.ru_key, ""),
                        title: coalesce(ru.title, ""),
                        statement: coalesce(ru.statement, ""),
                        chunk_key: coalesce(source_chunk.chunk_key, ""),
                        chunk_preview: left(coalesce(source_chunk.text_contextualized, source_chunk.text_raw, ""), 280),
                        evidence: [ev IN evidence_nodes | {
                            title: coalesce(ev.title, ""),
                            hint: coalesce(ev.hint, ""),
                            example: coalesce(ev.example, "")
                        }]
                    }) AS requirements
                ORDER BY clause_impact DESC, clause_path, clause_id
                LIMIT 25
                """,
                session_id=session_id,
                question_key=question_key,
            )
            rows = await result.data()

        clause_row = self._select_anchor_clause_candidate(rows)
        if clause_row is None:
            return briefing

        requirement_rows = [
            item for item in (clause_row.get("requirements") or []) if isinstance(item, dict)
        ]
        chunk_ref = next(
            (
                req
                for req in requirement_rows
                if str(req.get("chunk_preview", "")).strip()
            ),
            requirement_rows[0] if requirement_rows else {},
        )
        summary = self._compose_clause_summary(requirement_rows)
        evidence_items = self._collect_clause_evidence(requirement_rows, limit=6)

        return QuestionBriefing(
            document=QuestionBriefingDocument(
                standard_key=str(clause_row.get("standard_key", "")),
                title=str(clause_row.get("document_title", "")),
                version_label=str(clause_row.get("version_label", "")),
            ),
            clause=QuestionBriefingClause(
                clause_id=str(clause_row.get("clause_id", "")),
                clause_path=str(clause_row.get("clause_path", "")),
                heading_text=str(clause_row.get("heading_text", "")),
            ),
            chunk=QuestionBriefingChunk(
                chunk_key=str(chunk_ref.get("chunk_key", "")),
                preview=str(chunk_ref.get("chunk_preview", "")),
            ),
            summary=summary,
            evidence=evidence_items,
            context_challenge=context_challenge,
            impact=briefing.impact,
        )

    async def _load_context_challenge_briefing(
        self,
        *,
        session_id: str,
        question_key: str,
    ):
        async with self.neo4j_driver.session() as session:
            status_result = await session.run(
                """
                MATCH (s:Session {session_id: $session_id})
                OPTIONAL MATCH (s)-[:HAS_CONTEXT_DOCUMENT]->(d:ContextDocument)
                RETURN
                    coalesce(s.context_challenge_ready, false) AS challenge_ready,
                    coalesce(s.context_challenge_baseline_confirmed_run, false) AS baseline_run,
                    coalesce(s.challenge_status, "idle") AS challenge_status,
                    count(d) AS document_count,
                    count(
                        CASE
                            WHEN coalesce(d.ingest_status, "") IN ["completed", "completed_with_warnings"] THEN 1
                        END
                    ) AS completed_docs
                """,
                session_id=session_id,
            )
            status_row = await status_result.single()

            evidence_result = await session.run(
                """
                MATCH (q:DiagnosticQuestion {question_key: $question_key})-[:INFLUENCES]->(ru:RequirementUnit)
                MATCH (ch:ContextChunk)-[m:MATCHES_REQUIREMENT {session_id: $session_id}]->(ru)
                OPTIONAL MATCH (s:Session {session_id: $session_id})-[hs:HAS_CHALLENGE_STATE]->(ru)
                OPTIONAL MATCH (d:ContextDocument {context_document_id: ch.context_document_id})
                RETURN
                    ch.context_chunk_id AS chunk_key,
                    coalesce(d.filename, "") AS document_title,
                    coalesce(ch.page_no, "") AS page_no,
                    coalesce(ch.heading_path, "") AS heading_path,
                    coalesce(ch.source_ref, "") AS source_ref,
                    coalesce(m.method, "hybrid") AS method,
                    coalesce(m.score, 0.0) AS score,
                    coalesce(hs.confidence, 0.0) AS confidence,
                    coalesce(hs.rationale, "") AS rationale
                ORDER BY score DESC, chunk_key
                LIMIT 3
                """,
                session_id=session_id,
                question_key=question_key,
            )
            evidence_rows = await evidence_result.data()

        ready = bool(status_row.get("challenge_ready")) if status_row else False
        baseline_run = bool(status_row.get("baseline_run")) if status_row else False
        challenge_status = str(status_row.get("challenge_status") or "") if status_row else ""
        completed_docs = int(status_row.get("completed_docs") or 0) if status_row else 0
        document_count = int(status_row.get("document_count") or 0) if status_row else 0

        note = ""
        run_recommended = False
        if document_count <= 0:
            note = "Noch keine Kontextdokumente hochgeladen."
        elif completed_docs <= 0:
            note = "Dokument-Indexierung läuft noch."
        elif not baseline_run and ready:
            note = "Dokumente sind indexiert. Starte den vollständigen Challenge-Lauf für Baseline-Ergebnisse."
            run_recommended = True
        elif challenge_status in {"queued", "running"}:
            note = "Challenge-Lauf wird aktuell berechnet."

        chunks = [
            ContextChallengeChunkEvidence(
                chunk_key=str(row.get("chunk_key", "")),
                document_title=str(row.get("document_title", "")),
                page_no=str(row.get("page_no", "")),
                heading_path=str(row.get("heading_path", "")),
                source_ref=str(row.get("source_ref", "")),
                method=str(row.get("method", "")),
                confidence=float(row.get("confidence") or 0.0),
                rationale=str(row.get("rationale", "")),
            )
            for row in evidence_rows
            if str(row.get("chunk_key", "")).strip()
        ]
        return ContextChallengeBriefing(
            status=challenge_status,
            run_recommended=run_recommended,
            note=note,
            chunks=chunks,
        )

    @staticmethod
    def _select_anchor_clause_candidate(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not rows:
            return None

        def rank(row: dict[str, Any]) -> tuple[int, int, int, int, str]:
            clause_path = str(row.get("clause_path", "") or "")
            heading_text = str(row.get("heading_text", "") or "")
            is_non_normative = ComplianceContextOrchestrator._looks_non_normative_clause(
                clause_path=clause_path,
                heading_text=heading_text,
            )
            has_numeric_path = ComplianceContextOrchestrator._looks_numeric_clause_path(clause_path)
            requirements = row.get("requirements") or []
            normative_hits = ComplianceContextOrchestrator._count_normative_signals(requirements)
            impact_value = int(row.get("clause_impact") or 0)
            return (
                0 if not is_non_normative else 1,
                0 if has_numeric_path else 1,
                -normative_hits,
                -impact_value,
                clause_path.casefold(),
            )

        ranked = sorted(
            [row for row in rows if isinstance(row, dict)],
            key=rank,
        )
        return ranked[0] if ranked else None

    @staticmethod
    def _looks_non_normative_clause(clause_path: str, heading_text: str) -> bool:
        joined = f"{clause_path} {heading_text}".casefold()
        return any(token in joined for token in NON_NORMATIVE_CLAUSE_TOKENS)

    @staticmethod
    def _looks_numeric_clause_path(clause_path: str) -> bool:
        value = (clause_path or "").strip()
        if not value:
            return False
        return bool(re.search(r"(^|[\s/§])\d", value))

    @staticmethod
    def _count_normative_signals(requirements: Any) -> int:
        if not isinstance(requirements, list):
            return 0
        text_parts: list[str] = []
        for item in requirements:
            if not isinstance(item, dict):
                continue
            title = " ".join(str(item.get("title", "")).split())
            statement = " ".join(str(item.get("statement", "")).split())
            if title:
                text_parts.append(title)
            if statement:
                text_parts.append(statement)
        haystack = f" {' '.join(text_parts).casefold()} "
        return sum(haystack.count(token) for token in NORMATIVE_SIGNAL_TOKENS)

    @staticmethod
    def _compose_clause_summary(requirements: list[dict[str, Any]]) -> str:
        snippets: list[str] = []
        seen: set[str] = set()
        for req in requirements:
            title = " ".join(str(req.get("title", "")).split())
            statement = " ".join(str(req.get("statement", "")).split())
            candidate = title or statement
            if not candidate:
                continue
            dedupe_key = candidate.casefold()
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            snippets.append(candidate)
            if len(snippets) >= 3:
                break
        if not snippets:
            return ""
        if len(snippets) == 1:
            return snippets[0]
        if len(snippets) == 2:
            return f"Schwerpunkte dieser Frage: {snippets[0]} sowie {snippets[1]}."
        return f"Schwerpunkte dieser Frage: {snippets[0]}; {snippets[1]}; sowie {snippets[2]}."

    @staticmethod
    def _collect_clause_evidence(
        requirements: list[dict[str, Any]],
        limit: int = 6,
    ) -> list[QuestionBriefingEvidence]:
        collected: list[QuestionBriefingEvidence] = []
        seen: set[tuple[str, str, str]] = set()
        for req in requirements:
            raw_items = req.get("evidence")
            if not isinstance(raw_items, list):
                continue
            for raw in raw_items:
                if not isinstance(raw, dict):
                    continue
                title = " ".join(str(raw.get("title", "")).split())
                hint = " ".join(str(raw.get("hint", "")).split())
                example = " ".join(str(raw.get("example", "")).split())
                if not hint:
                    continue
                dedupe_key = (title.casefold(), hint.casefold(), example.casefold())
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                collected.append(
                    QuestionBriefingEvidence(
                        title=title,
                        hint=hint,
                        example=example,
                    )
                )
                if len(collected) >= limit:
                    return collected
        return collected

    async def _personalize_briefing(
        self,
        briefing: QuestionBriefing,
        question_prompt: str,
        context_profile: dict[str, Any],
    ) -> QuestionBriefing:
        personalized_summary = briefing.summary

        personalized_evidence = []
        source_evidence: list[dict[str, str]] = []
        for item in briefing.evidence:
            evidence_item = {
                "title": item.title,
                "hint": item.hint,
                "example": item.example,
            }
            source_evidence.append(evidence_item)
            personalized_evidence.append(evidence_item)

        llm_personalization = await self.assist_service.personalize_briefing(
            question_prompt=question_prompt,
            summary=personalized_summary,
            evidence_items=source_evidence,
            context_profile=context_profile,
            clause_path=briefing.clause.clause_path,
            clause_heading=briefing.clause.heading_text,
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
