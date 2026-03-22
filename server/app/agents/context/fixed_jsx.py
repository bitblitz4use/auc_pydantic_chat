"""Deterministic JSX for CONTEXT mode — parsed by the client with react-jsx-parser.

Keep this small: intrinsic tags only, className strings, no imports or markdown fences.
"""

# Simpler than the old client mock: one card, title, line of copy, one chip.
FIXED_CONTEXT_JSX = (
    '<div className="rounded-lg border bg-card p-4 shadow-sm">'
    '<h2 className="text-base font-semibold">Context preview</h2>'
    '<p className="text-sm text-muted-foreground mt-1">Fixed JSX streamed from the server.</p>'
    '<div className="mt-3">'
    '<span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">'
    "Prepared sample"
    "</span>"
    "</div>"
    "</div>"
)
