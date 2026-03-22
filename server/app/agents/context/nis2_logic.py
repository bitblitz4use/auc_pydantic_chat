"""NIS-2 Fragekatalog: validation, Unternehmensgröße (FAQ nis.gv.at), LLM prompt."""

from __future__ import annotations

import json
from typing import Any, Literal

# Thresholds aligned with Austrian NIS-2 FAQ (orientation only, not legal advice).
# https://www.nis.gv.at/fragen-und-antworten/nis-2-richtlinie/allgemeine-informationen-zu-nis-2.html


def _f(x: Any) -> float | None:
    if x is None:
        return None
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _i(x: Any) -> int | None:
    if x is None:
        return None
    try:
        return int(float(x))
    except (TypeError, ValueError):
        return None


def classify_unternehmensgroesse(
    employees: int | None,
    revenue_mio: float | None,
    balance_mio: float | None,
) -> str:
    """Return German label: groß, mittel, klein, or unklar."""
    e = employees if employees is not None else -1
    u = revenue_mio if revenue_mio is not None else -1.0
    b = balance_mio if balance_mio is not None else -1.0

    if e < 0 and u < 0 and b < 0:
        return "unklar"

    # Klein: <50 Beschäftigte und <10 Mio Umsatz und <10 Mio Bilanzsumme
    klein_ok = (
        (e < 0 or e < 50)
        and (u < 0 or u < 10.0)
        and (b < 0 or b < 10.0)
    )
    if e >= 0 and u >= 0 and b >= 0:
        if e < 50 and u < 10.0 and b < 10.0:
            return "klein"

    # Groß: ≥250 Beschäftigte oder (≥50 Mio Umsatz und >43 Mio Bilanz)
    if e >= 250:
        return "groß"
    if u >= 50.0 and b > 43.0:
        return "groß"

    # Mittel: 50–249 Beschäftigte oder Umsatz/Bilanz in Mittel-Bereich (FAQ)
    if 50 <= e <= 249:
        return "mittel"
    if 10.0 <= u <= 50.0 or 10.0 <= b <= 43.0:
        return "mittel"

    if klein_ok and e >= 0 and u >= 0 and b >= 0:
        return "klein"

    return "unklar"


def _answers(body_data: dict[str, Any]) -> dict[str, Any]:
    inner = body_data.get("body")
    if isinstance(inner, dict):
        raw = inner.get("contextAnswers")
        if isinstance(raw, dict):
            return raw
    raw = body_data.get("contextAnswers")
    return raw if isinstance(raw, dict) else {}


def _submitted_step(a: dict[str, Any]) -> int:
    try:
        return int(a.get("submittedStep", 0) or 0)
    except (TypeError, ValueError):
        return 0


def _b(x: Any) -> bool:
    return x is True or x is False


def validate_step(step: int, a: dict[str, Any]) -> bool:
    if step == 1:
        return bool(a.get("sector"))
    if step == 2:
        em = _i(a.get("employees"))
        rev = _f(a.get("revenueMio"))
        bal = _f(a.get("balanceMio"))
        return em is not None and em >= 0 and rev is not None and rev >= 0 and bal is not None and bal >= 0
    if step == 3:
        return _b(a.get("wesentlicheDienste")) and _b(a.get("kritischeInfrastruktur"))
    if step == 4:
        d = a.get("digitaleDienste")
        return isinstance(d, list) and len(d) > 0
    if step == 5:
        return _b(a.get("lieferantNis2")) and _b(a.get("beeinflusstSicherheit"))
    if step == 6:
        return _b(a.get("dienstleistungenEu"))
    if step == 7:
        s = a.get("sonderfaelle")
        return isinstance(s, list) and len(s) > 0
    return False


def _all_steps_valid(a: dict[str, Any]) -> bool:
    return all(validate_step(i, a) for i in range(1, 8))


def resolve_context_mode(
    body_data: dict[str, Any],
) -> tuple[Literal["jsx", "llm"], Any]:
    """
    Returns ("jsx", jsx_string) or ("llm", answers_dict for prompt).
    """
    a = _answers(body_data)
    submitted = _submitted_step(a)

    if submitted == 7 and _all_steps_valid(a):
        return ("llm", a)

    if submitted >= 1 and not validate_step(submitted, a):
        return ("jsx", _step_to_jsx(submitted))

    if submitted == 0:
        return ("jsx", _step_to_jsx(1))

    if submitted == 1 and validate_step(1, a):
        return ("jsx", _step_to_jsx(2))
    if submitted == 2 and validate_step(2, a):
        return ("jsx", _step_to_jsx(3))
    if submitted == 3 and validate_step(3, a):
        return ("jsx", _step_to_jsx(4))
    if submitted == 4 and validate_step(4, a):
        return ("jsx", _step_to_jsx(5))
    if submitted == 5 and validate_step(5, a):
        return ("jsx", _step_to_jsx(6))
    if submitted == 6 and validate_step(6, a):
        return ("jsx", _step_to_jsx(7))

    if submitted == 7:
        return ("jsx", _step_to_jsx(7))

    return ("jsx", _step_to_jsx(1))


def _step_to_jsx(step: int) -> str:
    from app.agents.context.nis2_fixed_jsx import NIS2_STEP_JSX

    return NIS2_STEP_JSX.get(step, NIS2_STEP_JSX[1])


NIS2_SYSTEM_PROMPT_DE = """Du agierst ausdrücklich als NIS-2-Compliance-Berater:in (Orientierung, keine \
Rechtsberatung). Dein Schwerpunkt: NIS-2 und die österreichische Einordnung (u. a. NIS-Gesetz, \
Anlaufstelle nis.gv.at) für die konkrete Organisation fassbar machen — Compliance immer im Kontext \
ihres Profils (Sektor, Größe, Tätigkeiten, Lieferkette, EU-Bezug, Sonderfälle).

Schreibe auf Deutsch.

Kernanforderung — Begründungspflicht:
- Jede inhaltliche Aussage zu Relevanz, Risiko, Priorität oder nächsten sinnvollen Schritten \
musst du an den übergebenen Organisationskontext knüpfen. Nenne explizit, *welche* Angabe \
(Sektor, Beschäftigte, Umsatz/Bilanz, kritische/wesentliche Dienste, digitale Dienste, \
Lieferkettenrolle, EU-Bezug, Sonderfälle) deine Einschätzung stützt. Vermeide generische \
Compliance-Floskeln ohne Bezug zu diesen Daten.
- Wo die Daten eine Schlussfolgerung nur teilweise tragen, sage das offen und begründe, \
was fehlt oder was Behörden/qualifizierte Beratung klären müsste.

Nutze die strukturierten Antworten und die interne Größenklassifikation nur als \
Entscheidungshilfe, nicht als rechtsverbindliche Einordnung.

Verbindliche Leitplanken:
- Keine Rechtsberatung; verweise bei Bedarf auf qualifizierte Rechts- bzw. Fachberatung und Behörden.
- Trenne sachliche Einordnung (auf Basis der Angaben) von allgemeinem Hintergrundwissen; \
letzteres nur, wenn es die Organisationssituation erhellt.
- Strukturierter, gut lesbarer Text (kurze Absätze oder Aufzählungen); priorisiere Klarheit \
vor Umfang.
"""


def build_nis2_user_prompt_de(answers: dict[str, Any]) -> str:
    em = _i(answers.get("employees"))
    rev = _f(answers.get("revenueMio"))
    bal = _f(answers.get("balanceMio"))
    groesse = classify_unternehmensgroesse(em, rev, bal)

    payload = {
        "Antworten": answers,
        "Interne_Groessenklassifikation": groesse,
        "Hinweis": "Orientierung an FAQ der Anlaufstelle NISG (nis.gv.at), keine Rechtsberatung.",
    }
    return (
        "Erstelle eine kompakte Beratungsantwort im Sinne von NIS-2-Compliance-Orientierung für "
        "genau diese Organisation. Nutze ausschließlich die folgenden JSON-Daten als "
        "Organisationskontext.\n\n"
        "Pflichtinhalte:\n"
        "- Ordne ein, inwieweit NIS-2 für diese Organisation voraussichtlich relevant sein könnte, "
        "und begründe jede zentrale Aussage mit Verweis auf die passenden Felder (Sektor, Größe, "
        "wesentliche/kritische Dienste, digitale Dienste, Lieferkette, EU-Bezug, Sonderfälle).\n"
        "- Leite daraus ab, welche Compliance-Themen (z. B. Risikomanagement, Meldepflichten, "
        "Lieferkette, Meldung digitaler Dienste) für *diese* Organisation am ehesten in den "
        "Vordergrund rücken — immer mit Kurzbegründung aus dem Kontext.\n"
        "- Weise auf Unsicherheiten oder weitere Klärungsbedarfe hin, wenn die Daten nicht "
        "ausreichen.\n\n"
        f"```json\n{json.dumps(payload, ensure_ascii=False, indent=2)}\n```"
    )
