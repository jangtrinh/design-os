# What only eyes can check

Run [look.mjs](look.mjs) only after [validate.mjs](validate.mjs) printed `ok`. It renders the entry page of an
evidence folder at 375, 768 and 1440 px (`--widths` overrides; `--deadline <ms>` bounds each width, default 45000, and a page that never settles is reported UNVERIFIED) into one sheet PNG, measures `L1`-`L5`,
and blocks every request that is not a local file. Open the sheet, then open the page itself for
anything the sheet shrinks. Responsive extras beyond these three widths run only when the brief asks.

```sh
node <skill>/look.mjs --evidence <folder> --sheet <folder>/look-sheet.png
```

Exit 0 means every machine item passed, 1 means an item failed or is UNVERIFIED, 2 means look could not run. A zero
exit never means "looks good": `L6`-`L10` are yours.

| Item | Check | Home |
| --- | --- | --- |
| L1 | No sideways page scroll at each width | Measured: `scrollWidth` vs `clientWidth` |
| L2 | Every visible target is at least 24 px | Measured: smallest non-inline target |
| L3 | No console error, script error, blocked request, missing local file or WebSocket (all sockets are closed) | Measured: browser events |
| L4 | No broken image; lazy images are switched to eager and the page is scrolled by fixed instant steps (at most 60, two passes); one that never finishes, or a page still growing on the second pass, is UNVERIFIED | Measured: `naturalWidth` after the scroll |
| L5 | The body is not blank | Measured: text length and visual count |
| L6 | The shape and the one primary action read at 375 px without hunting | Human eyes |
| L7 | Copy invents no evidence: numbers, logos, quotes, people | Human eyes |
| L8 | Empty, loading, error and long-content states exist or are declared out of scope | Human eyes |
| L9 | At 25 % zoom the page reads as deliberate groups; type, radius and spacing share one scale | Human eyes |
| L10 | A critic who did not build the page scored each axis with cited evidence | Fresh context |

Right: open the sheet, say which width you looked at and what you saw, then list the measured lines.
Wrong: report a zero exit as "looks right", or grade your own page.

| Symptom | Action | When NOT to take the shortcut |
| --- | --- | --- |
| A machine item fails | Fix the cause, rebuild into a new folder, run validate and look again | Never waive it with a judgment |
| Fine detail unreadable on the sheet | Open the page at the width in a browser and crop | Never grade thumbnails alone |
| The page needs a state a static file cannot show | Build the state as its own entry and run it too | Never imply a state you did not render |
| `blocked request` or `missing file` lines appear | Bundle the asset into the page folder | Never allow the request to make the count zero |

## Without a browser

look needs Playwright and a Chromium-family browser from the user's own environment. It looks in
`DESIGN_OS_PLAYWRIGHT_DIR`, the current project, the ease-design package and
`~/.cache/design-os/playwright`. It never installs anything, in the skill folder or anywhere else. When
either is missing it exits 2 and prints exactly one line:

```text
look: SKIPPED (no Playwright) — capture 375, 768, 1440 with your host's own browser or screenshot tool
```

Then capture the same widths with the host's own browser or screenshot tool and look at them yourself,
and write in the hand-over that `L1`-`L5` were not measured. The browser is also the only check for external
requests and missing local files, so list both as NOT_VERIFIED; no script reads the HTML or CSS instead. A missing look run does not satisfy the
visual check; do not substitute an old screenshot or another build's capture. In this repository's CI the
look tests fail when look cannot run, unless `DESIGN_OS_LOOK_OPTIONAL=1` declares the runner browser-less;
the Ubuntu runners ship Chrome and the repository's own Playwright, so there look runs for real.
