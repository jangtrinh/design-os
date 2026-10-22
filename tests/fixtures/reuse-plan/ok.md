# Reuse plan — Orders

## Screen: Orders list
Pattern: Pattern/ListPage

| Slot | Rung | Use | Reason |
|---|---|---|---|
| header | 3 | Page header/Default | — |
| list | 5 | Filter bar/Default + Table/Basic | — |
| status | 4 | Chip/Status (Tone=Info) | — |
| gutter | 6 | spacing.4, colors.surface | — |
| owner chip | 7 | ds-new: Owner chip | no email chip in registry |

## Screen: Order detail
Pattern: none — one-off step with no template in the registry

| Slot | Rung | Use | Reason |
|---|---|---|---|
| summary | 3 | Card/Summary | — |
| actions | 3 | Button/Primary | — |
