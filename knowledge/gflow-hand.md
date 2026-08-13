---
id: gflow-hand
description: "Driving Google Flow (Veo/Imagen) through the gflow hand — the golden path is `ui gflow i2v`, not raw chaining."
when: [gflow, veo, imagen, video-generation, i2v, flythrough, camera-flight, google-flow]
---

# gflow — the Google Flow hand

`gflow` automates the Google Flow web app (Veo video, Imagen stills) through a
Playwright-driven real Chrome session against a Google AI **Ultra/Pro subscription**:
flat-rate credits, not per-call API billing.

It is an optional hand, like `figma-agent`. It is **NOT** part of the deterministic `ui`
binary, is not installed by `npm install ease-design`, and needs its own login. What IS
part of the binary is a narrow adapter over it — `ui gflow i2v` — and that adapter is the
path this file tells you to use.

> **`gflow` is unofficial and reverse-engineered.** It drives a real browser session as a
> real user, so a UI change upstream breaks it and automation carries account risk.
> Isolate it, fail soft, and never make it a hard dependency of a build.

**gflow vs the API path.** Reach for gflow when the job needs the subscription's flat
credits, character consistency, or start-frame conditioning. Reach for the official
Gemini API (Veo/Imagen, per-call billing, more stable) when the job needs stability more
than it needs those. Pick by billing model and feature need, not by habit.

## Mental Model

**A camera flight is a chain of seams, and every seam is a credit you can lose.** Each
leg is generated from the previous leg's *actual last frame*, so leg N's quality gates
leg N+1's starting point — and a leg whose render succeeded but whose download failed has
already spent its credit while leaving nothing on disk.

That single fact drives every rule below. The failure that matters is not "the model made
a bad clip"; it is **a stranded render** — succeeded upstream, absent locally, paid for.
Design the loop so every leg is verified before the next one spends.

## When to Use / When NOT

**Use** this file when generating a multi-leg camera flight or a conditioned still through
a Flow subscription — a scroll-cinema flight, an i2v sequence, a hero plate.

**Do NOT** use it for one-off text-to-video where the API path is simpler, and do NOT
reach for it inside CI or any unattended build: the auth step is interactive by design and
the account risk is real. `knowledge/scroll-cinema-direction.md` owns *what makes the
flight good*; this file owns *how to make the tool produce it*.

## The golden path — `ui gflow i2v`

**ALLOWED:** drive each leg through the binary's adapter.
**NOT ALLOWED:** call `gflow video chain`, or pass `--end-frame`, from a design:os flow.

```bash
ui gflow i2v "<prompt>" --initial-frame seed.png --out-dir clips \
  --model veo-fast --aspect 16:9 --duration 6 --json
```

The adapter exists because the raw CLI makes the stranded-render failure easy to hit and
hard to see. It runs `gflow video i2v --json`, **verifies that a new non-empty MP4 actually
landed**, and then extracts that video's real last frame with ffmpeg so the next leg has a
correct seed. It never calls `chain` and never supplies `--end-frame`.

- **`chain` is excluded on purpose.** It needs PyAV, and its first link's download races
  the render — a failure that reads as "no local path" after the credit is already gone.
- **The last frame is extracted, not assumed.** Seeding leg N+1 from a frame you *believe*
  is the ending gives a visible jump at the seam; extracting the actual final frame is what
  makes the seam frame-identical.
- **Verify-then-spend is the whole point.** `DOWNLOAD_MISSING` means the render may well
  have succeeded upstream — read the recovery section before regenerating.

Its error codes name the next action rather than the symptom: `DEPENDENCY_MISSING`
(gflow/ffmpeg absent), `FILE_NOT_FOUND` (seed missing), `UPSTREAM_FAILED`,
`BAD_UPSTREAM_JSON`, `DOWNLOAD_MISSING`, `FFMPEG_FAILED`, `FILE_IO_FAILED`.

## Install and auth (the friction is real — do it once, right)

```sh
uv tool install gflow-cli --with pillow --force
```

`--with pillow` is REQUIRED: gflow does not declare Pillow, and frame operations fail with
a bare `ModuleNotFoundError: PIL` that looks like a bug in your own code. `ffmpeg`,
`ffprobe`, and `cwebp` must be on PATH for the seed extraction and the web encode.

```sh
GFLOW_CLI_AUTH_LOGIN_TIMEOUT=1200 gflow auth login --profile <name> --browser chrome
```

- **Interactive by design.** It opens a real browser and a human signs in. Run it from an
  interactive shell — NEVER headless, never from an agent's own Bash tool.
- `--browser chrome` avoids Google's automation block; the default timeout is too short for
  a real login, so raise it.
- You must reach the **Flow editor** — prompt box and projects visible — and then **close
  the browser**: gflow verifies and saves the session on close. Anything short of the
  editor saves nothing.
- **One attempt at a time.** A second `login` while the first holds the profile fails with
  a profile lock; kill the stale process before retrying.
- Check without spending: `gflow auth list`, `gflow auth status --profile <name>`.

## Models and frame conditioning

- **`veo-fast` for the flight, by default.** Not because it looks better — because the
  post-render download grows flakier as renders get longer, and a stranded leg costs a
  credit and a restart. Buy sharpness back in the encode (see the scrub-encode floor in
  `knowledge/scroll-cinema-direction.md`) or with an upscale pass.
- **`veo-quality` is viable through the submit→collect split**, not through the inline
  grab. If you drive it, plan for recovery rather than hoping.
- **A model that silently drops the seed frame is unusable for a flight**, whatever its
  output quality: it falls back to text-to-video and the seam breaks. Verify that a model
  honours `--initial-frame` before committing a chain to it.
- **Stills (Imagen)** come from `gflow image t2i` with a *static* prompt. Motion words
  ("cinematic", "descent", "camera pushes") can make the agentic path return a **video**
  for a still request. Its `--out` takes a **directory**, not a file path.

## Recovering a stranded render — do NOT regenerate blindly

When a leg reports success upstream but nothing lands locally, the clip usually **exists
server-side**. Regenerating spends a second credit for a render you already own.

- Look first: `gflow data list videos` (an entry with no local path is a stranded media),
  `gflow data list errors`.
- **Download-by-media-id exists at the CLIENT boundary, not the CLI.** The bash CLI has no
  way to separate submit from grab, so no shell wrapper can decouple them. The Python
  client can: render with download disabled, keep the returned media id, then pull it —
  retryable, and it recovers the existing media instead of paying again.
- `chain --resume-from` regenerates the first failed link. It does **not** re-download an
  orphaned media, so it is not a recovery path — it is a second purchase.

## Failure Modes

- **Regenerating a stranded render.** The most expensive mistake here: a download failure
  reads like a render failure, so the reflex is to re-run the leg. Check `data list` first;
  the credit is usually already spent on a clip that exists.
- **Seeding from an assumed frame.** Using a still you *think* matches the clip's ending,
  or a frame grabbed at a rounded timestamp, puts a visible jump at the seam. The seam is
  the one thing a continuous flight cannot have.
- **Treating `veo-quality` as strictly better.** Through the inline grab it strands more
  often than it improves; the sharper model that never lands is worth less than the faster
  one that does.
- **Running auth unattended.** It is interactive by design; an agent that tries to automate
  it burns the timeout and leaves a locked profile behind for the human who tries next.
- **Making gflow a build dependency.** It is an unofficial browser automation against a
  personal subscription. A pipeline that cannot proceed without it will break on an
  upstream UI change, and the failure will land on whoever runs the build.
- **Motion words in a still prompt.** The request quietly returns a video, and the error
  surfaces as a wire-format complaint rather than "your prompt asked for motion".

---

> Distilled from the `es-gflow` field skill and proven live in the spec-021 pilot
> (studio repo: `specs/021-scrollworld-gflow-video-track`), captured 2026-08. The adapter
> this file points at, `ui gflow i2v`, encodes the same rules in code — when they disagree,
> the adapter is the one that runs.
