"""NIS-2 wizard JSX (steps 1–7). Custom tags implemented in context-mode-jsx.tsx."""

from __future__ import annotations

_WRAP = (
    '<div className="rounded-lg border bg-card p-6 shadow-sm max-w-xl">'
    "{inner}"
    "</div>"
)

# Step badge (monospace) + title — avoid verbose "Schritt n von 7" before the heading.
_TITLE_ROW = (
    '<div className="flex items-baseline gap-3 gap-y-1 flex-wrap">'
    '<span className="shrink-0 font-mono text-[11px] tabular-nums tracking-wide text-muted-foreground '
    'border border-border/80 rounded-md px-2 py-0.5 bg-muted/40 select-none">{step}</span>'
    '<h2 className="text-base font-semibold leading-snug min-w-0">{title}</h2>'
    "</div>"
)
_HINT = '<p className="text-sm text-muted-foreground mt-1">{h}</p>'
_SEND = (
    '<div className="mt-4 border-t border-border pt-3">'
    "<CtxSendSelection />"
    '<p className="text-xs text-muted-foreground mt-2">Übermittelt die Eingaben dieses Schritts.</p>'
    "</div>"
)

NIS2_STEP_JSX: dict[int, str] = {
    1: _WRAP.format(
        inner=_TITLE_ROW.format(step="1/7", title="Sektor / Tätigkeit")
        + _HINT.format(h="Wählen Sie einen Bereich (Single Choice).")
        + "<CtxSectorGrid />"
        + _SEND
    ),
    2: _WRAP.format(
        inner=_TITLE_ROW.format(step="2/7", title="Unternehmensgröße")
        + _HINT.format(
            h="Angaben in Zahlen (Mio. €). Werden intern zur Größenklassifikation verwendet."
        )
        + "<CtxNumInputs />"
        + _SEND
    ),
    3: _WRAP.format(
        inner=_TITLE_ROW.format(step="3/7", title="Kritikalität")
        + _HINT.format(h="Ja oder Nein wählen.")
        + "<CtxKritikalitaetToggles />"
        + _SEND
    ),
    4: _WRAP.format(
        inner=_TITLE_ROW.format(step="4/7", title="Digitale Dienstleistungen")
        + _HINT.format(h="Mehrfachauswahl möglich. „Keine der genannten“ schließt andere aus.")
        + "<CtxDigitaleGrid />"
        + _SEND
    ),
    5: _WRAP.format(
        inner=_TITLE_ROW.format(step="5/7", title="Lieferketten-Relevanz")
        + _HINT.format(h="Ja oder Nein.")
        + "<CtxLieferketteToggles />"
        + _SEND
    ),
    6: _WRAP.format(
        inner=_TITLE_ROW.format(step="6/7", title="Geografischer Geltungsbereich")
        + _HINT.format(h="Bieten Sie Dienstleistungen innerhalb der EU an?")
        + "<CtxEuToggle />"
        + _SEND
    ),
    7: _WRAP.format(
        inner=_TITLE_ROW.format(step="7/7", title="Sonderfälle")
        + _HINT.format(h="Mehrfachauswahl.")
        + "<CtxSonderfaelleGrid />"
        + _SEND
    ),
}
