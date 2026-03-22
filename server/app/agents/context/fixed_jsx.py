"""Deterministic JSX for CONTEXT mode — parsed by the client with react-jsx-parser.

Intrinsic tags + registered custom components (Ctx*) implemented in `context-mode-jsx.tsx`.
No markdown fences.
"""

from __future__ import annotations

from typing import Any

# Step 1: gender — toggles update local draft; CtxSendSelection POSTs to the server
STEP_GENDER_JSX = (
    '<div className="rounded-lg border bg-card p-4 shadow-sm">'
    '<h2 className="text-base font-semibold">Gender</h2>'
    '<p className="text-sm text-muted-foreground mt-1">Toggle an option, then send.</p>'
    '<div className="mt-3 flex flex-wrap gap-2">'
    "<CtxGenderMale />"
    "<CtxGenderFemale />"
    "</div>"
    '<div className="mt-4 border-t border-border pt-3">'
    "<CtxSendSelection />"
    '<p className="text-xs text-muted-foreground mt-2">Sends your current toggles to the server.</p>'
    "</div>"
    "</div>"
)

# Step 2: region (gender already set)
STEP_REGION_JSX = (
    '<div className="rounded-lg border bg-card p-4 shadow-sm">'
    '<h2 className="text-base font-semibold">Region</h2>'
    '<p className="text-sm text-muted-foreground mt-1">Toggle DE or AUT, then send.</p>'
    '<div className="mt-3 flex flex-wrap gap-2">'
    "<CtxRegionDE />"
    "<CtxRegionAUT />"
    "</div>"
    '<div className="mt-4 border-t border-border pt-3">'
    "<CtxSendSelection />"
    '<p className="text-xs text-muted-foreground mt-2">Sends your current toggles to the server.</p>'
    "</div>"
    "</div>"
)


def _summary_labels(gender: str, region: str) -> tuple[str, str, str]:
    g = "Male" if gender == "male" else "Female"
    r = "Germany" if region == "DE" else "Austria"
    return g, r, f"You chose {g} and region {r} ({region})."


def build_summary_jsx(gender: str, region: str) -> str:
    """Final step: static JSX only (no custom components)."""
    g_label, r_label, line = _summary_labels(gender, region)
    return (
        '<div className="rounded-lg border bg-card p-6 shadow-sm">'
        '<h2 className="text-base font-semibold">Summary</h2>'
        '<p className="text-sm text-muted-foreground mt-3">'
        "Here is what you selected."
        "</p>"
        '<ul className="mt-4 list-disc list-inside space-y-2 pl-2 text-sm text-foreground">'
        f'<li><span className="font-medium">Gender:</span> {g_label}</li>'
        f'<li><span className="font-medium">Region:</span> {r_label} ({region})</li>'
        "</ul>"
        f'<p className="text-sm mt-4 text-foreground leading-relaxed">{line}</p>'
        "</div>"
    )


def _context_answers_dict(body_data: dict[str, Any]) -> dict[str, Any]:
    inner = body_data.get("body")
    if isinstance(inner, dict):
        raw = inner.get("contextAnswers")
        if isinstance(raw, dict):
            return raw
    raw = body_data.get("contextAnswers")
    return raw if isinstance(raw, dict) else {}


# Back-compat name (first step only)
FIXED_CONTEXT_JSX = STEP_GENDER_JSX


def resolve_context_jsx(body_data: dict[str, Any]) -> str:
    """Pick the next assistant JSX from structured answers (no LLM)."""
    answers = _context_answers_dict(body_data)
    gender = answers.get("gender")
    region = answers.get("region")

    if gender not in ("male", "female"):
        return STEP_GENDER_JSX
    if region not in ("DE", "AUT"):
        return STEP_REGION_JSX
    return build_summary_jsx(str(gender), str(region))
