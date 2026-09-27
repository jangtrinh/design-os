"""``design-os audit`` becomes a two-leaf group: ``page`` (the pre-existing
``design-os audit <target>`` behavior, UNCHANGED — see ``commands/audit.py``) is the default
when no subcommand name is given, ``batch`` is the new ``audit.batch.v1`` runner.

Why a group at all, and why a custom ``resolve_command``: a plain Typer/Click command cannot
host a subcommand without breaking its own positional-argument parsing (empirically verified
this session — see evidence/w10b/tp-02-review.md "Known limitation"). This is the standard
``click-default-group`` idiom: the first token is checked against known subcommand names; if
it isn't one (and isn't ``-h``/``--help``), ``page`` is inserted so
``design-os audit <target>`` keeps working exactly as published (docs: knowledge/daily.md,
templates/journeys/deliver.md; callers: heartbeat_runners.py imports ``build_audit`` directly,
unaffected by this registration change).

Limitation: a project directory literally named ``./batch`` or ``./page`` passed as
``design-os audit <that-dir>`` would be misrouted to the subcommand of the same name. Inherent
to any default-command scheme; not applicable to any project in this repo.
"""

from __future__ import annotations

import typer
from typer.core import TyperGroup

from design_os.commands import audit as audit_cmd
from design_os.commands.audit_batch import audit_batch

_DEFAULT_SUBCOMMAND = "page"


class _AuditGroup(TyperGroup):
    def resolve_command(self, ctx, args):  # type: ignore[override]
        if args and args[0] not in self.commands and args[0] not in ("-h", "--help"):
            args = [_DEFAULT_SUBCOMMAND, *args]
        return super().resolve_command(ctx, args)


audit_app = typer.Typer(name="audit", cls=_AuditGroup, no_args_is_help=True, add_completion=False)


@audit_app.callback()
def _audit_root() -> None:
    """Audit HTML file(s)/project dir (page, the default) or a whole project (batch)."""
    # no-op collapse guard — mirrors reference_app/librarian_app (es-typer §2 ⚠); this
    # docstring is also what the root --help screen shows as `audit`'s one-line summary.


audit_app.command(name="page")(audit_cmd.audit)
audit_app.command(name="batch")(audit_batch)
