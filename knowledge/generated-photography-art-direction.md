---
id: generated-photography-art-direction
description: "A fill-in art-direction template for generated photography — subject and casting, light, palette, banned scenes, crop and copy zones, QA checklist."
when: [art-direction, generated-photography, photo-direction, image-prompt, banned-scene, casting, hero-photo, image-qa]
---

# Generated Photography Art Direction

## Purpose

Give a project ONE written direction for every generated photo before the first batch, so the
prompt, the curator and the reviewer judge against the same sentences instead of each one's taste.

## Mental Model

A photo direction is a **contract the generator cannot read between the lines of**. The image model
fills every gap with its own default: a smiling stock office, a person pointing at a chart, a
blue-orange grade, a face in the dead centre where the headline must go. Each gap the direction
leaves open is a decision the model makes for you, once per image, differently each time. The
template below closes the gaps that cost review rounds on real sites: who is in the frame, how the
light falls, which colours are allowed, which scenes are banned, where the copy will sit, and how
each image is checked.

## When to Use / When NOT

**Use** before generating photography for a website or product surface: heroes, section images,
team or customer scenes, editorial illustrations that must read as photographs.

**Do NOT use** for icons, logos, illustrations, UI mock-ups or diagrams — those stay vector or
native (`asset-production-orchestration.md`, When Not to Use). Do NOT use it to describe photos
harvested from an existing site; that is `delivery-assets.md`.

## Where the filled template lives

Copy the template into the project at `design/art-direction/art-direction.md` (the design-directory
contract; `ui design lint` flags art direction stored anywhere else) and fill every slot. A slot
left empty is NOT a neutral default — write `none` with a reason, so a reviewer can tell an open
gap from a decision. Market-, culture- or brand-specific direction (who the people are, the
setting, local props) belongs in the project's filled copy, never in this shared file.

## The template

```markdown
# Photo art direction — <product or campaign>

Status: draft | approved by <owner>, <date>

## 1. Subject and casting
- Who is in the frame (role, age range, how many, how they relate):
- Casting rule — who the audience must recognise as "people like us":
- What they are DOING (a real task with a real object), never what they are posing as:
- Wardrobe and grooming register:
- Setting (place, time of day, season, level of polish):
- Faces: real expressions only; no direct-to-camera grins unless the section is a portrait.

## 2. Light
- Key light (direction, quality, source in the scene):
- Contrast ratio and shadow softness:
- Colour temperature, and whether mixed light is allowed:
- Grade: one sentence (e.g. "neutral, slightly warm, no teal-orange split").

## 3. Palette
- Allowed dominant colours, tied to the design-system tokens they must sit beside:
- Accent colour budget (where the brand accent may appear, how large):
- Colours that must NOT dominate a frame (they fight the UI or a competitor's brand):

## 4. Banned scenes (put this whole list in the common prompt from batch 1)
| Banned scene | Near-variants that count as the same scene |
|---|---|
| <e.g. a person pointing at a chart> | <a finger resting on a printed report; seated pointing at a screen; a pen tapping a graph> |
| <e.g. a handshake across a desk> | <a staged high-five; hands stacked in a circle> |

## 5. Crop and empty copy zones
- Aspect ratios needed per slot (desktop, mobile):
- Where the copy sits per slot, and the zone that must stay quiet (no faces, no detail, low contrast):
- Focal point per slot, and the mobile focal point if the crop moves:
- Minimum margin between a face and any crop edge:
- Layered or parallax use: which plane owns people and everything they touch.

## 6. QA checklist (every image, at 100% zoom or more, before selection)
- [ ] Gesture and hands: no banned scene or near-variant; hands anatomically whole; what each hand touches is plausible.
- [ ] Faces: no distortion, no duplicate faces, gaze matches the story.
- [ ] Text and marks: no readable text, logo, watermark or fake signage in the frame.
- [ ] Casting matches section 1; setting and props match the stated place.
- [ ] Light and grade match section 2 across the whole set (compare side by side).
- [ ] Palette within section 3; accent within budget.
- [ ] The copy zone of section 5 is quiet at every crop the slot will use.
- [ ] Layered heroes: rest check against the original, then recomposed at the largest load and scroll offsets.
- [ ] Verdict and the deciding line recorded in `curation.json`.
```

## Filling it well

ALLOWED: concrete, checkable sentences ("key light from camera left through a window", "copy zone:
left 45% of the desktop frame, no face crosses it"). A reviewer can point at an image and say which
line it breaks.

NOT ALLOWED: adjectives as direction ("authentic", "premium", "warm and human"), because the model
reads them as its own defaults and the curator cannot reject an image against them.

ALLOWED: a banned scene written with its near-variants beside it.

NOT ALLOWED: a banned scene written only as a phrase, because the generator routes around the
literal wording (it stops "pointing" and starts "resting a finger on the report") and the viewer
still sees the same staged gesture.

ALLOWED: a separate mobile focal point when the slot crops differently on a phone.

NOT ALLOWED: one crop decision reused for every slot, because the face or the task that carried the
desktop frame is the first thing a narrow crop cuts off.

## Failure Modes

| Failure | How to spot it | Required response |
|---|---|---|
| The banned list arrived after batch 1 | Early batches contain the banned scene; later ones do not | Put the full list in the common prompt and regenerate the early batches |
| A near-variant passed review | An approved image shows the banned gesture in another pose | Add the variant to the banned list beside its parent; re-curate the set |
| Direction written as adjectives | Two reviewers disagree on the same image and both cite the direction | Rewrite the slot as a checkable sentence before the next batch |
| Copy lands on a face or busy detail | The headline overlaps a face or a high-contrast prop at some width | Fix the section 5 copy zone per slot and re-crop or regenerate |
| The set does not match itself | Light direction or grade changes between neighbouring sections | Pin section 2 harder; reject outliers rather than colour-correct them into place |
| Market-specific direction leaked into this shared file | This file names a market, culture or brand | Move it to the project's `design/art-direction/art-direction.md` |
