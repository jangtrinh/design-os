# shadcn-standard — Design System

Ingested from an existing Figma design system via `ui ingest-figma-ds`.
This is the portable, AI-readable spec — tokens compile with `ui tokens compile`,
components load with `ui registry list --file component-registry.json`.

- **Source:** figma scan-design-system (shadcn-standard-ds.json)
- **Inventory:** 802 variables · 718 components · 1470 icons · 347 styles

## Tokens

Two tiers (see knowledge/token-taxonomy.md): **primitives** are literal values;
**semantic** tokens alias a primitive and are what UI should consume.

### Primitives

| Token | Type | Value (· mode overrides) |
|---|---|---|
| `alpha.5` | color | #FFFFFFF2 |
| `alpha.10` | color | #FFFFFFE5 |
| `alpha.20` | color | #FFFFFFCC |
| `alpha.30` | color | #FFFFFFB2 |
| `alpha.40` | color | #FFFFFF99 |
| `alpha.50` | color | #FFFFFF80 |
| `alpha.60` | color | #FFFFFF66 |
| `alpha.70` | color | #FFFFFF4D |
| `alpha.80` | color | #FFFFFF33 |
| `alpha.90` | color | #FFFFFF1A |
| `blur.2xl` | number | 40 |
| `blur.3xl` | number | 64 |
| `blur.lg` | number | 16 |
| `blur.md` | number | 12 |
| `blur.sm` | number | 8 |
| `blur.xl` | number | 24 |
| `blur.xs` | number | 4 |
| `border-radius.rounded-full` | dimension | 9999px |
| `border-radius.rounded-none` | dimension | 0px |
| `border-width.border` | dimension | 1px |
| `border-width.border-0` | dimension | 0px |
| `border-width.border-2` | dimension | 2px |
| `border-width.border-3` | dimension | 3px |
| `border-width.border-4` | dimension | 4px |
| `border-width.border-5` | dimension | 5px |
| `border-width.border-6` | dimension | 6px |
| `border-width.border-7` | dimension | 6px |
| `border-width.border-8` | dimension | 8px |
| `breakpoint.2xl` | number | 1536 |
| `breakpoint.lg` | number | 1024 |
| `breakpoint.md` | number | 768 |
| `breakpoint.sm` | number | 640 |
| `breakpoint.xl` | number | 1280 |
| `colors.border-dark` | color | #FFFFFF1A |
| `colors.brand-dark` | color | #EF4444 |
| `colors.brand-light` | color | #EA0029 |
| `colors.input-dark` | color | #FFFFFF26 |
| `colors.sidebar-border-dark` | color | #FFFFFF1A |
| `container.2xl` | number | 672 |
| `container.2xs` | number | 288 |
| `container.3xl` | number | 768 |
| `container.3xs` | number | 256 |
| `container.4xl` | number | 896 |
| `container.5xl` | number | 1024 |
| `container.6xl` | number | 1152 |
| `container.7xl` | number | 1280 |
| `container.lg` | number | 512 |
| `container.md` | number | 448 |
| `container.sm` | number | 384 |
| `container.xl` | number | 576 |
| `container.xs` | number | 320 |
| `custom.bg-background-20-dark-bg-background-10` | color | #FFFFFF33 |
| `custom.bg-primary-5-dark-bg-primary-10` | color | #1717170D |
| `custom.dark-input` | color | #FFFFFF00 |
| `custom.destructive-20-dark-destructive-40` | color | #DC262633 |
| `custom.destructive-40-dark-destructive-60` | color | #DC262666 |
| `custom.outline` | color | #A3A3A380 |
| `custom.outline-10-dark-outline-20` | color | #A3A3A31A |
| `drop-shadow.2xl-blur-radius` | dimension | 25px |
| `drop-shadow.2xl-color` | color | #00000026 |
| `drop-shadow.2xl-offset-x` | number | 0 |
| `drop-shadow.2xl-offset-y` | number | 25 |
| `drop-shadow.2xl-spread-radius` | dimension | 0px |
| `drop-shadow.lg-blur-radius` | dimension | 4px |
| `drop-shadow.lg-color` | color | #00000026 |
| `drop-shadow.lg-offset-x` | number | 0 |
| `drop-shadow.lg-offset-y` | number | 4 |
| `drop-shadow.lg-spread-radius` | dimension | 0px |
| `drop-shadow.md-blur-radius` | dimension | 3px |
| `drop-shadow.md-color` | color | #0000001F |
| `drop-shadow.md-offset-x` | number | 0 |
| `drop-shadow.md-offset-y` | number | 3 |
| `drop-shadow.md-spread-radius` | dimension | 0px |
| `drop-shadow.sm-blur-radius` | dimension | 2px |
| `drop-shadow.sm-color` | color | #00000026 |
| `drop-shadow.sm-offset-x` | number | 0 |
| `drop-shadow.sm-offset-y` | number | 1 |
| `drop-shadow.sm-spread-radius` | dimension | 0px |
| `drop-shadow.xl-blur-radius` | dimension | 7px |
| `drop-shadow.xl-color` | color | #0000001A |
| `drop-shadow.xl-offset-x` | number | 0 |
| `drop-shadow.xl-offset-y` | number | 9 |
| `drop-shadow.xl-spread-radius` | dimension | 0px |
| `drop-shadow.xs-blur-radius` | dimension | 1px |
| `drop-shadow.xs-color` | color | #0000000D |
| `drop-shadow.xs-offset-x` | number | 0 |
| `drop-shadow.xs-offset-y` | number | 1 |
| `drop-shadow.xs-spread-radius` | dimension | 0px |
| `font.font-mono` | fontFamily | Geist Mono |
| `font.font-sans` | fontFamily | Inter |
| `font.font-serif` | fontFamily | Georgia |
| `font-weight.black` | fontWeight | 900 |
| `font-weight.bold` | fontWeight | 700 |
| `font-weight.extrabold` | fontWeight | 800 |
| `font-weight.extralight` | fontWeight | 200 |
| `font-weight.light` | fontWeight | 300 |
| `font-weight.medium` | fontWeight | 500 |
| `font-weight.normal` | fontWeight | 400 |
| `font-weight.semibold` | fontWeight | 600 |
| `font-weight.thin` | fontWeight | 100 |
| `heading-lg.letter-spacing` | dimension | 0px |
| `heading-md.letter-spacing` | dimension | 0px |
| `heading-sm.letter-spacing` | dimension | 0px |
| `heading-xl.letter-spacing` | dimension | 0px |
| `height.h-0` | dimension | 0px |
| `height.h-0-5` | dimension | 2px |
| `height.h-1` | dimension | 4px |
| `height.h-1-5` | dimension | 6px |
| `height.h-10` | dimension | 40px |
| `height.h-11` | dimension | 44px |
| `height.h-12` | dimension | 48px |
| `height.h-14` | dimension | 56px |
| `height.h-16` | dimension | 64px |
| `height.h-2` | dimension | 8px |
| `height.h-2-5` | dimension | 10px |
| `height.h-20` | dimension | 80px |
| `height.h-24` | dimension | 96px |
| `height.h-28` | dimension | 112px |
| `height.h-3` | dimension | 12px |
| `height.h-3-5` | dimension | 14px |
| `height.h-32` | dimension | 128px |
| `height.h-36` | dimension | 144px |
| `height.h-4` | dimension | 16px |
| `height.h-44` | dimension | 176px |
| `height.h-48` | dimension | 192px |
| `height.h-5` | dimension | 20px |
| `height.h-52` | dimension | 208px |
| `height.h-56` | dimension | 224px |
| `height.h-6` | dimension | 24px |
| `height.h-64` | dimension | 256px |
| `height.h-7` | dimension | 28px |
| `height.h-72` | dimension | 288px |
| `height.h-8` | dimension | 32px |
| `height.h-80` | dimension | 320px |
| `height.h-9` | dimension | 36px |
| `height.h-96` | dimension | 384px |
| `height.h-px` | dimension | 1px |
| `inset-shadow.2xs-blur-radius` | dimension | 0px |
| `inset-shadow.2xs-color` | color | #0000000D |
| `inset-shadow.2xs-offset-x` | dimension | 0px |
| `inset-shadow.2xs-offset-y` | dimension | 1px |
| `inset-shadow.2xs-spread-radius` | dimension | 0px |
| `inset-shadow.sm-blur-radius` | dimension | 4px |
| `inset-shadow.sm-color` | color | #0000000D |
| `inset-shadow.sm-offset-x` | dimension | 0px |
| `inset-shadow.sm-offset-y` | dimension | 2px |
| `inset-shadow.sm-spread-radius` | dimension | 0px |
| `inset-shadow.xs-blur-radius` | dimension | 1px |
| `inset-shadow.xs-color` | color | #0000000D |
| `inset-shadow.xs-offset-x` | dimension | 0px |
| `inset-shadow.xs-offset-y` | dimension | 1px |
| `inset-shadow.xs-spread-radius` | dimension | 0px |
| `line-height.leading-1` | dimension | 4px |
| `line-height.leading-10` | dimension | 40px |
| `line-height.leading-11` | dimension | 44px |
| `line-height.leading-12` | dimension | 48px |
| `line-height.leading-13` | dimension | 52px |
| `line-height.leading-14` | dimension | 56px |
| `line-height.leading-15` | dimension | 60px |
| `line-height.leading-16` | dimension | 64px |
| `line-height.leading-17` | dimension | 68px |
| `line-height.leading-18` | dimension | 72px |
| `line-height.leading-19` | dimension | 76px |
| `line-height.leading-2` | dimension | 8px |
| `line-height.leading-20` | dimension | 80px |
| `line-height.leading-3` | dimension | 12px |
| `line-height.leading-4` | dimension | 16px |
| `line-height.leading-5` | dimension | 20px |
| `line-height.leading-6` | dimension | 24px |
| `line-height.leading-7` | dimension | 28px |
| `line-height.leading-8` | dimension | 32px |
| `line-height.leading-9` | dimension | 36px |
| `max-width.max-w-none` | dimension | 0px |
| `max-width.max-w-px` | dimension | 1px |
| `min-width.min-w-px` | dimension | 1px |
| `opacity.opacity-0` | number | 0 |
| `opacity.opacity-10` | number | 10 |
| `opacity.opacity-100` | number | 100 |
| `opacity.opacity-15` | number | 15 |
| `opacity.opacity-20` | number | 20 |
| `opacity.opacity-25` | number | 25 |
| `opacity.opacity-30` | number | 30 |
| `opacity.opacity-35` | number | 35 |
| `opacity.opacity-40` | number | 40 |
| `opacity.opacity-45` | number | 45 |
| `opacity.opacity-5` | number | 5 |
| `opacity.opacity-50` | number | 50 |
| `opacity.opacity-55` | number | 55 |
| `opacity.opacity-60` | number | 60 |
| `opacity.opacity-65` | number | 65 |
| `opacity.opacity-70` | number | 70 |
| `opacity.opacity-75` | number | 75 |
| `opacity.opacity-80` | number | 80 |
| `opacity.opacity-85` | number | 85 |
| `opacity.opacity-90` | number | 90 |
| `opacity.opacity-95` | number | 95 |
| `radius.2xl` | dimension | 16px |
| `radius.3xl` | dimension | 24px |
| `radius.4xl` | dimension | 32px |
| `radius.lg` | dimension | 10px |
| `radius.md` | dimension | 8px |
| `radius.sm` | dimension | 6px |
| `radius.xl` | dimension | 14px |
| `radius.xs` | dimension | 2px |
| `shadow.2xl-blur-radius` | dimension | 50px |
| `shadow.2xl-color` | color | #00000040 |
| `shadow.2xl-offset-x` | number | 0 |
| `shadow.2xl-offset-y` | number | 25 |
| `shadow.2xl-spread-radius` | dimension | -12px |
| `shadow.2xs-blur-radius` | dimension | 0px |
| `shadow.2xs-color` | color | #0000000D |
| `shadow.2xs-offset-x` | number | 0 |
| `shadow.2xs-offset-y` | number | 1 |
| `shadow.2xs-spread-radius` | dimension | 0px |
| `shadow.lg-1-blur-radius` | dimension | 15px |
| `shadow.lg-1-color` | color | #0000001A |
| `shadow.lg-1-offset-x` | number | 0 |
| `shadow.lg-1-offset-y` | number | 10 |
| `shadow.lg-1-spread-radius` | dimension | -3px |
| `shadow.lg-2-blur-radius` | dimension | 6px |
| `shadow.lg-2-color` | color | #0000001A |
| `shadow.lg-2-offset-x` | number | 0 |
| `shadow.lg-2-offset-y` | number | 4 |
| `shadow.lg-2-spread-radius` | dimension | -4px |
| `shadow.md-1-blur-radius` | dimension | 6px |
| `shadow.md-1-color` | color | #0000001A |
| `shadow.md-1-offset-x` | number | 0 |
| `shadow.md-1-offset-y` | number | 4 |
| `shadow.md-1-spread-radius` | dimension | -1px |
| `shadow.md-2-blur-radius` | dimension | 4px |
| `shadow.md-2-color` | color | #0000001A |
| `shadow.md-2-offset-x` | number | 0 |
| `shadow.md-2-offset-y` | number | 2 |
| `shadow.md-2-spread-radius` | dimension | -2px |
| `shadow.sm-1-blur-radius` | dimension | 3px |
| `shadow.sm-1-color` | color | #0000001A |
| `shadow.sm-1-offset-x` | number | 0 |
| `shadow.sm-1-offset-y` | number | 1 |
| `shadow.sm-1-spread-radius` | dimension | 0px |
| `shadow.sm-2-blur-radius` | dimension | 2px |
| `shadow.sm-2-color` | color | #0000001A |
| `shadow.sm-2-offset-x` | number | 0 |
| `shadow.sm-2-offset-y` | number | 1 |
| `shadow.sm-2-spread-radius` | dimension | -1px |
| `shadow.xl-1-blur-radius` | dimension | 25px |
| `shadow.xl-1-color` | color | #0000001A |
| `shadow.xl-1-offset-x` | number | 0 |
| `shadow.xl-1-offset-y` | number | 20 |
| `shadow.xl-1-spread-radius` | dimension | -5px |
| `shadow.xl-2-blur-radius` | dimension | 10px |
| `shadow.xl-2-color` | color | #0000001A |
| `shadow.xl-2-offset-x` | number | 0 |
| `shadow.xl-2-offset-y` | number | 8 |
| `shadow.xl-2-spread-radius` | dimension | -6px |
| `shadow.xs-blur-radius` | dimension | 2px |
| `shadow.xs-color` | color | #0000000D |
| `shadow.xs-offset-x` | number | 0 |
| `shadow.xs-offset-y` | number | 1 |
| `shadow.xs-spread-radius` | dimension | 0px |
| `spacing.0` | dimension | 0px |
| `spacing.1` | dimension | 4px |
| `spacing.2` | dimension | 8px |
| `spacing.3` | dimension | 12px |
| `spacing.4` | dimension | 16px |
| `spacing.5` | dimension | 20px |
| `spacing.6` | dimension | 24px |
| `spacing.7` | dimension | 28px |
| `spacing.8` | dimension | 32px |
| `spacing.9` | dimension | 36px |
| `spacing.10` | dimension | 40px |
| `spacing.11` | dimension | 44px |
| `spacing.12` | dimension | 48px |
| `spacing.14` | dimension | 56px |
| `spacing.16` | dimension | 64px |
| `spacing.20` | dimension | 80px |
| `spacing.24` | dimension | 96px |
| `spacing.28` | dimension | 112px |
| `spacing.32` | dimension | 128px |
| `spacing.36` | dimension | 144px |
| `spacing.40` | dimension | 160px |
| `spacing.44` | dimension | 176px |
| `spacing.48` | dimension | 192px |
| `spacing.52` | dimension | 208px |
| `spacing.56` | dimension | 224px |
| `spacing.60` | dimension | 240px |
| `spacing.64` | dimension | 256px |
| `spacing.72` | dimension | 288px |
| `spacing.80` | dimension | 320px |
| `spacing.96` | dimension | 384px |
| `spacing.0-5` | dimension | 2px |
| `spacing.1-5` | dimension | 6px |
| `spacing.2-5` | dimension | 10px |
| `spacing.3-5` | dimension | 14px |
| `spacing.px` | dimension | 1px |
| `stroke-width.stroke-0` | dimension | 0px |
| `stroke-width.stroke-1` | dimension | 1px |
| `stroke-width.stroke-1-33` | dimension | 1.3300000429153442px |
| `stroke-width.stroke-1-5` | dimension | 1.5px |
| `stroke-width.stroke-1-67` | dimension | 1.6699999570846558px |
| `stroke-width.stroke-2` | dimension | 2px |
| `stroke-width.stroke-3` | dimension | 3px |
| `stroke-width.stroke-4` | dimension | 4px |
| `stroke-width.stroke-5` | dimension | 5px |
| `stroke-width.stroke-6` | dimension | 6px |
| `stroke-width.stroke-7` | dimension | 7px |
| `stroke-width.stroke-8` | dimension | 8px |
| `tailwind-colors.amber-100` | color | #FEF3C7 |
| `tailwind-colors.amber-200` | color | #FDE68A |
| `tailwind-colors.amber-300` | color | #FCD34D |
| `tailwind-colors.amber-400` | color | #FBBF24 |
| `tailwind-colors.amber-50` | color | #FFFBEB |
| `tailwind-colors.amber-500` | color | #F59E0B |
| `tailwind-colors.amber-600` | color | #D97706 |
| `tailwind-colors.amber-700` | color | #B45309 |
| `tailwind-colors.amber-800` | color | #92400E |
| `tailwind-colors.amber-900` | color | #78350F |
| `tailwind-colors.amber-950` | color | #451A03 |
| `tailwind-colors.base-black` | color | #000000 |
| `tailwind-colors.base-transparent` | color | #FFFFFF00 |
| `tailwind-colors.base-white` | color | #FFFFFF |
| `tailwind-colors.blue-100` | color | #DBEAFE |
| `tailwind-colors.blue-200` | color | #BFDBFE |
| `tailwind-colors.blue-300` | color | #93C5FD |
| `tailwind-colors.blue-400` | color | #60A5FA |
| `tailwind-colors.blue-50` | color | #EFF6FF |
| `tailwind-colors.blue-500` | color | #3B82F6 |
| `tailwind-colors.blue-600` | color | #2563EB |
| `tailwind-colors.blue-700` | color | #1D4ED8 |
| `tailwind-colors.blue-800` | color | #1E40AF |
| `tailwind-colors.blue-900` | color | #1E3A8A |
| `tailwind-colors.blue-950` | color | #172554 |
| `tailwind-colors.cyan-100` | color | #CFFAFE |
| `tailwind-colors.cyan-200` | color | #A5F3FC |
| `tailwind-colors.cyan-300` | color | #67E8F9 |
| `tailwind-colors.cyan-400` | color | #22D3EE |
| `tailwind-colors.cyan-50` | color | #ECFEFF |
| `tailwind-colors.cyan-500` | color | #06B6D4 |
| `tailwind-colors.cyan-600` | color | #0891B2 |
| `tailwind-colors.cyan-700` | color | #0E7490 |
| `tailwind-colors.cyan-800` | color | #155E75 |
| `tailwind-colors.cyan-900` | color | #164E63 |
| `tailwind-colors.cyan-950` | color | #083344 |
| `tailwind-colors.emerald-100` | color | #D1FAE5 |
| `tailwind-colors.emerald-200` | color | #A7F3D0 |
| `tailwind-colors.emerald-300` | color | #6EE7B7 |
| `tailwind-colors.emerald-400` | color | #34D399 |
| `tailwind-colors.emerald-50` | color | #ECFDF5 |
| `tailwind-colors.emerald-500` | color | #10B981 |
| `tailwind-colors.emerald-600` | color | #059669 |
| `tailwind-colors.emerald-700` | color | #047857 |
| `tailwind-colors.emerald-800` | color | #065F46 |
| `tailwind-colors.emerald-900` | color | #064E3B |
| `tailwind-colors.emerald-950` | color | #022C22 |
| `tailwind-colors.fuchsia-100` | color | #FAE8FF |
| `tailwind-colors.fuchsia-200` | color | #F5D0FE |
| `tailwind-colors.fuchsia-300` | color | #F0ABFC |
| `tailwind-colors.fuchsia-400` | color | #E879F9 |
| `tailwind-colors.fuchsia-50` | color | #FDF4FF |
| `tailwind-colors.fuchsia-500` | color | #D946EF |
| `tailwind-colors.fuchsia-600` | color | #C026D3 |
| `tailwind-colors.fuchsia-700` | color | #A21CAF |
| `tailwind-colors.fuchsia-800` | color | #86198F |
| `tailwind-colors.fuchsia-900` | color | #701A75 |
| `tailwind-colors.fuchsia-950` | color | #4A044E |
| `tailwind-colors.gray-100` | color | #F3F4F6 |
| `tailwind-colors.gray-200` | color | #E5E7EB |
| `tailwind-colors.gray-300` | color | #D1D5DB |
| `tailwind-colors.gray-400` | color | #9CA3AF |
| `tailwind-colors.gray-50` | color | #F9FAFB |
| `tailwind-colors.gray-500` | color | #6B7280 |
| `tailwind-colors.gray-600` | color | #4B5563 |
| `tailwind-colors.gray-700` | color | #374151 |
| `tailwind-colors.gray-800` | color | #1F2937 |
| `tailwind-colors.gray-900` | color | #111827 |
| `tailwind-colors.gray-950` | color | #030712 |
| `tailwind-colors.green-100` | color | #DCFCE7 |
| `tailwind-colors.green-200` | color | #BBF7D0 |
| `tailwind-colors.green-300` | color | #86EFAC |
| `tailwind-colors.green-400` | color | #4ADE80 |
| `tailwind-colors.green-50` | color | #F0FDF4 |
| `tailwind-colors.green-500` | color | #22C55E |
| `tailwind-colors.green-600` | color | #16A34A |
| `tailwind-colors.green-700` | color | #15803D |
| `tailwind-colors.green-800` | color | #166534 |
| `tailwind-colors.green-900` | color | #14532D |
| `tailwind-colors.green-950` | color | #052E16 |
| `tailwind-colors.indigo-100` | color | #E0E7FF |
| `tailwind-colors.indigo-200` | color | #C7D2FE |
| `tailwind-colors.indigo-300` | color | #A5B4FC |
| `tailwind-colors.indigo-400` | color | #818CF8 |
| `tailwind-colors.indigo-50` | color | #EEF2FF |
| `tailwind-colors.indigo-500` | color | #6366F1 |
| `tailwind-colors.indigo-600` | color | #4F46E5 |
| `tailwind-colors.indigo-700` | color | #4338CA |
| `tailwind-colors.indigo-800` | color | #3730A3 |
| `tailwind-colors.indigo-900` | color | #312E81 |
| `tailwind-colors.indigo-950` | color | #1E1B4B |
| `tailwind-colors.lime-100` | color | #ECFCCB |
| `tailwind-colors.lime-200` | color | #D9F99D |
| `tailwind-colors.lime-300` | color | #BEF264 |
| `tailwind-colors.lime-400` | color | #A3E635 |
| `tailwind-colors.lime-50` | color | #F7FEE7 |
| `tailwind-colors.lime-500` | color | #84CC16 |
| `tailwind-colors.lime-600` | color | #65A30D |
| `tailwind-colors.lime-700` | color | #4D7C0F |
| `tailwind-colors.lime-800` | color | #3F6212 |
| `tailwind-colors.lime-900` | color | #365314 |
| `tailwind-colors.lime-950` | color | #1A2E05 |
| `tailwind-colors.neutral-100` | color | #F5F5F5 |
| `tailwind-colors.neutral-200` | color | #E5E5E5 |
| `tailwind-colors.neutral-300` | color | #D4D4D4 |
| `tailwind-colors.neutral-400` | color | #A3A3A3 |
| `tailwind-colors.neutral-50` | color | #FAFAFA |
| `tailwind-colors.neutral-500` | color | #737373 |
| `tailwind-colors.neutral-600` | color | #525252 |
| `tailwind-colors.neutral-700` | color | #404040 |
| `tailwind-colors.neutral-800` | color | #262626 |
| `tailwind-colors.neutral-900` | color | #171717 |
| `tailwind-colors.neutral-950` | color | #0A0A0A |
| `tailwind-colors.orange-100` | color | #FFEDD5 |
| `tailwind-colors.orange-200` | color | #FED7AA |
| `tailwind-colors.orange-300` | color | #FDBA74 |
| `tailwind-colors.orange-400` | color | #FB923C |
| `tailwind-colors.orange-50` | color | #FFF7ED |
| `tailwind-colors.orange-500` | color | #F97316 |
| `tailwind-colors.orange-600` | color | #EA580C |
| `tailwind-colors.orange-700` | color | #C2410C |
| `tailwind-colors.orange-800` | color | #9A3412 |
| `tailwind-colors.orange-900` | color | #7C2D12 |
| `tailwind-colors.orange-950` | color | #431407 |
| `tailwind-colors.pink-100` | color | #FCE7F3 |
| `tailwind-colors.pink-200` | color | #FBCFE8 |
| `tailwind-colors.pink-300` | color | #F9A8D4 |
| `tailwind-colors.pink-400` | color | #F472B6 |
| `tailwind-colors.pink-50` | color | #FDF2F8 |
| `tailwind-colors.pink-500` | color | #EC4899 |
| `tailwind-colors.pink-600` | color | #DB2777 |
| `tailwind-colors.pink-700` | color | #BE185D |
| `tailwind-colors.pink-800` | color | #9D174D |
| `tailwind-colors.pink-900` | color | #831843 |
| `tailwind-colors.pink-950` | color | #500724 |
| `tailwind-colors.purple-100` | color | #F3E8FF |
| `tailwind-colors.purple-200` | color | #E9D5FF |
| `tailwind-colors.purple-300` | color | #D8B4FE |
| `tailwind-colors.purple-400` | color | #C084FC |
| `tailwind-colors.purple-50` | color | #FAF5FF |
| `tailwind-colors.purple-500` | color | #A855F7 |
| `tailwind-colors.purple-600` | color | #9333EA |
| `tailwind-colors.purple-700` | color | #7E22CE |
| `tailwind-colors.purple-800` | color | #6B21A8 |
| `tailwind-colors.purple-900` | color | #581C87 |
| `tailwind-colors.purple-950` | color | #3B0764 |
| `tailwind-colors.red-100` | color | #FEE2E2 |
| `tailwind-colors.red-200` | color | #FECACA |
| `tailwind-colors.red-300` | color | #FCA5A5 |
| `tailwind-colors.red-400` | color | #F87171 |
| `tailwind-colors.red-50` | color | #FEF2F2 |
| `tailwind-colors.red-500` | color | #EF4444 |
| `tailwind-colors.red-600` | color | #E7000B |
| `tailwind-colors.red-700` | color | #B91C1C |
| `tailwind-colors.red-800` | color | #991B1B |
| `tailwind-colors.red-900` | color | #7F1D1D |
| `tailwind-colors.red-950` | color | #450A0A |
| `tailwind-colors.rose-100` | color | #FFE4E6 |
| `tailwind-colors.rose-200` | color | #FECDD3 |
| `tailwind-colors.rose-300` | color | #FDA4AF |
| `tailwind-colors.rose-400` | color | #FB7185 |
| `tailwind-colors.rose-50` | color | #FFF1F2 |
| `tailwind-colors.rose-500` | color | #F43F5E |
| `tailwind-colors.rose-600` | color | #E11D48 |
| `tailwind-colors.rose-700` | color | #BE123C |
| `tailwind-colors.rose-800` | color | #9F1239 |
| `tailwind-colors.rose-900` | color | #881337 |
| `tailwind-colors.rose-950` | color | #4C0519 |
| `tailwind-colors.sky-100` | color | #E0F2FE |
| `tailwind-colors.sky-200` | color | #BAE6FD |
| `tailwind-colors.sky-300` | color | #7DD3FC |
| `tailwind-colors.sky-400` | color | #38BDF8 |
| `tailwind-colors.sky-50` | color | #F0F9FF |
| `tailwind-colors.sky-500` | color | #0EA5E9 |
| `tailwind-colors.sky-600` | color | #0284C7 |
| `tailwind-colors.sky-700` | color | #0369A1 |
| `tailwind-colors.sky-800` | color | #075985 |
| `tailwind-colors.sky-900` | color | #0C4A6E |
| `tailwind-colors.sky-950` | color | #082F49 |
| `tailwind-colors.slate-100` | color | #F1F5F9 |
| `tailwind-colors.slate-200` | color | #E2E8F0 |
| `tailwind-colors.slate-300` | color | #CBD5E1 |
| `tailwind-colors.slate-400` | color | #94A3B8 |
| `tailwind-colors.slate-50` | color | #F8FAFC |
| `tailwind-colors.slate-500` | color | #64748B |
| `tailwind-colors.slate-600` | color | #475569 |
| `tailwind-colors.slate-700` | color | #334155 |
| `tailwind-colors.slate-800` | color | #1E293B |
| `tailwind-colors.slate-900` | color | #0F172A |
| `tailwind-colors.slate-950` | color | #020617 |
| `tailwind-colors.stone-100` | color | #F5F5F4 |
| `tailwind-colors.stone-200` | color | #E7E5E4 |
| `tailwind-colors.stone-300` | color | #D6D3D1 |
| `tailwind-colors.stone-400` | color | #A8A29E |
| `tailwind-colors.stone-50` | color | #FAFAF9 |
| `tailwind-colors.stone-500` | color | #78716C |
| `tailwind-colors.stone-600` | color | #57534E |
| `tailwind-colors.stone-700` | color | #44403C |
| `tailwind-colors.stone-800` | color | #292524 |
| `tailwind-colors.stone-900` | color | #1C1917 |
| `tailwind-colors.stone-950` | color | #0C0A09 |
| `tailwind-colors.teal-100` | color | #CCFBF1 |
| `tailwind-colors.teal-200` | color | #99F6E4 |
| `tailwind-colors.teal-300` | color | #5EEAD4 |
| `tailwind-colors.teal-400` | color | #2DD4BF |
| `tailwind-colors.teal-50` | color | #F0FDFA |
| `tailwind-colors.teal-500` | color | #14B8A6 |
| `tailwind-colors.teal-600` | color | #0D9488 |
| `tailwind-colors.teal-700` | color | #0F766E |
| `tailwind-colors.teal-800` | color | #115E59 |
| `tailwind-colors.teal-900` | color | #134E4A |
| `tailwind-colors.teal-950` | color | #042F2E |
| `tailwind-colors.violet-100` | color | #EDE9FE |
| `tailwind-colors.violet-200` | color | #DDD6FE |
| `tailwind-colors.violet-300` | color | #C4B5FD |
| `tailwind-colors.violet-400` | color | #A78BFA |
| `tailwind-colors.violet-50` | color | #F5F3FF |
| `tailwind-colors.violet-500` | color | #8B5CF6 |
| `tailwind-colors.violet-600` | color | #7C3AED |
| `tailwind-colors.violet-700` | color | #6D28D9 |
| `tailwind-colors.violet-800` | color | #5B21B6 |
| `tailwind-colors.violet-900` | color | #4C1D95 |
| `tailwind-colors.violet-950` | color | #1E1B4B |
| `tailwind-colors.yellow-100` | color | #FEF9C3 |
| `tailwind-colors.yellow-200` | color | #FEF08A |
| `tailwind-colors.yellow-300` | color | #FDE047 |
| `tailwind-colors.yellow-400` | color | #FACC15 |
| `tailwind-colors.yellow-50` | color | #FEFCE8 |
| `tailwind-colors.yellow-500` | color | #EAB308 |
| `tailwind-colors.yellow-600` | color | #CA8A04 |
| `tailwind-colors.yellow-700` | color | #A16207 |
| `tailwind-colors.yellow-800` | color | #854D0E |
| `tailwind-colors.yellow-900` | color | #713F12 |
| `tailwind-colors.yellow-950` | color | #422006 |
| `tailwind-colors.zinc-100` | color | #F4F4F5 |
| `tailwind-colors.zinc-200` | color | #E4E4E7 |
| `tailwind-colors.zinc-300` | color | #D4D4D8 |
| `tailwind-colors.zinc-400` | color | #A1A1AA |
| `tailwind-colors.zinc-50` | color | #FAFAFA |
| `tailwind-colors.zinc-500` | color | #71717A |
| `tailwind-colors.zinc-600` | color | #52525B |
| `tailwind-colors.zinc-700` | color | #3F3F46 |
| `tailwind-colors.zinc-800` | color | #27272A |
| `tailwind-colors.zinc-900` | color | #18181B |
| `tailwind-colors.zinc-950` | color | #09090B |
| `text.2xl-font-size` | dimension | 24px |
| `text.2xl-line-height` | dimension | 32px |
| `text.3xl-font-size` | dimension | 30px |
| `text.3xl-line-height` | dimension | 36px |
| `text.4xl-font-size` | dimension | 36px |
| `text.4xl-line-height` | dimension | 40px |
| `text.5xl-font-size` | dimension | 48px |
| `text.5xl-line-height` | dimension | 48px |
| `text.6xl-font-size` | dimension | 60px |
| `text.6xl-line-height` | dimension | 60px |
| `text.7xl-font-size` | dimension | 72px |
| `text.7xl-line-height` | dimension | 72px |
| `text.8xl-font-size` | dimension | 96px |
| `text.8xl-line-height` | dimension | 96px |
| `text.9xl-font-size` | dimension | 128px |
| `text.9xl-line-height` | dimension | 128px |
| `text.base-font-size` | dimension | 16px |
| `text.base-line-height` | dimension | 24px |
| `text.lg-font-size` | dimension | 18px |
| `text.lg-line-height` | dimension | 28px |
| `text.sm-font-size` | dimension | 14px |
| `text.sm-line-height` | dimension | 20px |
| `text.xl-font-size` | dimension | 20px |
| `text.xl-line-height` | dimension | 28px |
| `text.xs-font-size` | dimension | 12px |
| `text.xs-line-height` | dimension | 16px |
| `width.w-0` | dimension | 0px |
| `width.w-0-5` | dimension | 2px |
| `width.w-1` | dimension | 4px |
| `width.w-1-5` | dimension | 6px |
| `width.w-10` | dimension | 40px |
| `width.w-11` | dimension | 44px |
| `width.w-12` | dimension | 48px |
| `width.w-14` | dimension | 56px |
| `width.w-16` | dimension | 64px |
| `width.w-2` | dimension | 8px |
| `width.w-2-5` | dimension | 10px |
| `width.w-20` | dimension | 80px |
| `width.w-24` | dimension | 96px |
| `width.w-28` | dimension | 112px |
| `width.w-3` | dimension | 12px |
| `width.w-3-5` | dimension | 14px |
| `width.w-32` | dimension | 128px |
| `width.w-36` | dimension | 144px |
| `width.w-4` | dimension | 16px |
| `width.w-44` | dimension | 176px |
| `width.w-48` | dimension | 192px |
| `width.w-5` | dimension | 20px |
| `width.w-52` | dimension | 208px |
| `width.w-56` | dimension | 224px |
| `width.w-6` | dimension | 24px |
| `width.w-64` | dimension | 256px |
| `width.w-7` | dimension | 28px |
| `width.w-72` | dimension | 288px |
| `width.w-8` | dimension | 32px |
| `width.w-80` | dimension | 320px |
| `width.w-9` | dimension | 36px |
| `width.w-96` | dimension | 384px |
| `width.w-px` | dimension | 1px |

### Semantic tokens

| Token | Type | Value (· mode overrides) |
|---|---|---|
| `border-radius.rounded-2xl` | dimension | {radius.2xl} |
| `border-radius.rounded-3xl` | dimension | {radius.3xl} |
| `border-radius.rounded-4xl` | dimension | {radius.4xl} |
| `border-radius.rounded-lg` | dimension | {radius.lg} |
| `border-radius.rounded-md` | dimension | {radius.md} |
| `border-radius.rounded-sm` | dimension | {radius.sm} |
| `border-radius.rounded-xl` | dimension | {radius.xl} |
| `border-radius.rounded-xs` | dimension | {radius.xs} |
| `color.accent` | color | {colors.accent-light} |
| `color.accent-foreground` | color | {colors.accent-foreground-light} |
| `color.attention` | color | {colors.attention-light} |
| `color.attention-foreground` | color | {colors.attention-foreground-light} |
| `color.attention-muted` | color | {colors.attention-muted-light} |
| `color.background` | color | {colors.background-light} |
| `color.border` | color | {colors.border-light} |
| `color.brand` | color | {colors.brand-light} |
| `color.brand-foreground` | color | {colors.brand-foreground-light} |
| `color.card` | color | {colors.card-light} |
| `color.card-foreground` | color | {colors.card-foreground-light} |
| `color.chart-1` | color | {colors.chart-1-light} |
| `color.chart-2` | color | {colors.chart-2-light} |
| `color.chart-3` | color | {colors.chart-3-light} |
| `color.chart-4` | color | {colors.chart-4-light} |
| `color.chart-5` | color | {colors.chart-5-light} |
| `color.destructive` | color | {colors.destructive-light} |
| `color.destructive-foreground` | color | {colors.destructive-foreground-light} |
| `color.destructive-muted` | color | {colors.destructive-muted-light} |
| `color.foreground` | color | {colors.foreground-light} |
| `color.input` | color | {colors.input-light} |
| `color.muted` | color | {colors.muted-light} |
| `color.muted-foreground` | color | {colors.muted-foreground-light} |
| `color.popover` | color | {colors.popover-light} |
| `color.popover-foreground` | color | {colors.popover-foreground-light} |
| `color.positive` | color | {colors.positive-light} |
| `color.positive-foreground` | color | {colors.positive-foreground-light} |
| `color.positive-muted` | color | {colors.positive-muted-light} |
| `color.primary` | color | {colors.primary-light} |
| `color.primary-foreground` | color | {colors.primary-foreground-light} |
| `color.ring` | color | {colors.ring-light} |
| `color.ring-offset` | color | {colors.background-light} |
| `color.secondary` | color | {colors.secondary-light} |
| `color.secondary-foreground` | color | {colors.secondary-foreground-light} |
| `color.sidebar` | color | {colors.sidebar-light} |
| `color.sidebar-accent` | color | {colors.sidebar-accent-light} |
| `color.sidebar-accent-foreground` | color | {colors.sidebar-accent-foreground-light} |
| `color.sidebar-border` | color | {colors.sidebar-border-light} |
| `color.sidebar-foreground` | color | {colors.sidebar-foreground-light} |
| `color.sidebar-primary` | color | {colors.sidebar-primary-light} |
| `color.sidebar-primary-foreground` | color | {colors.sidebar-primary-foreground-light} |
| `color.sidebar-ring` | color | {colors.sidebar-ring-light} |
| `colors.accent-dark` | color | {tailwind-colors.neutral-700} |
| `colors.accent-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.accent-foreground-light` | color | {tailwind-colors.neutral-900} |
| `colors.accent-light` | color | {tailwind-colors.neutral-100} |
| `colors.attention-dark` | color | {tailwind-colors.orange-400} |
| `colors.attention-foreground-dark` | color | {tailwind-colors.zinc-50} |
| `colors.attention-foreground-light` | color | {tailwind-colors.zinc-50} |
| `colors.attention-light` | color | {tailwind-colors.orange-500} |
| `colors.attention-muted-dark` | color | {tailwind-colors.orange-100} |
| `colors.attention-muted-light` | color | {tailwind-colors.orange-100} |
| `colors.background-dark` | color | {tailwind-colors.neutral-950} |
| `colors.background-light` | color | {tailwind-colors.base-white} |
| `colors.border-light` | color | {tailwind-colors.neutral-200} |
| `colors.brand-foreground-dark` | color | {tailwind-colors.base-white} |
| `colors.brand-foreground-light` | color | {tailwind-colors.base-white} |
| `colors.card-dark` | color | {tailwind-colors.neutral-900} |
| `colors.card-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.card-foreground-light` | color | {tailwind-colors.neutral-950} |
| `colors.card-light` | color | {tailwind-colors.base-white} |
| `colors.chart-1-dark` | color | {tailwind-colors.blue-700} |
| `colors.chart-1-light` | color | {tailwind-colors.orange-600} |
| `colors.chart-2-dark` | color | {tailwind-colors.emerald-500} |
| `colors.chart-2-light` | color | {tailwind-colors.teal-600} |
| `colors.chart-3-dark` | color | {tailwind-colors.amber-500} |
| `colors.chart-3-light` | color | {tailwind-colors.cyan-900} |
| `colors.chart-4-dark` | color | {tailwind-colors.purple-500} |
| `colors.chart-4-light` | color | {tailwind-colors.amber-400} |
| `colors.chart-5-dark` | color | {tailwind-colors.rose-500} |
| `colors.chart-5-light` | color | {tailwind-colors.amber-500} |
| `colors.destructive-dark` | color | {tailwind-colors.red-400} |
| `colors.destructive-foreground-dark` | color | {tailwind-colors.zinc-50} |
| `colors.destructive-foreground-light` | color | {tailwind-colors.zinc-50} |
| `colors.destructive-light` | color | {tailwind-colors.red-600} |
| `colors.destructive-muted-dark` | color | {tailwind-colors.red-100} |
| `colors.destructive-muted-light` | color | {tailwind-colors.red-100} |
| `colors.foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.foreground-light` | color | {tailwind-colors.neutral-950} |
| `colors.input-light` | color | {tailwind-colors.neutral-300} |
| `colors.muted-dark` | color | {tailwind-colors.neutral-800} |
| `colors.muted-foreground-dark` | color | {tailwind-colors.neutral-400} |
| `colors.muted-foreground-light` | color | {tailwind-colors.neutral-500} |
| `colors.muted-light` | color | {tailwind-colors.neutral-100} |
| `colors.popover-dark` | color | {tailwind-colors.neutral-800} |
| `colors.popover-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.popover-foreground-light` | color | {tailwind-colors.neutral-950} |
| `colors.popover-light` | color | {tailwind-colors.base-white} |
| `colors.positive-dark` | color | {tailwind-colors.green-400} |
| `colors.positive-foreground-dark` | color | {tailwind-colors.zinc-50} |
| `colors.positive-foreground-light` | color | {tailwind-colors.zinc-50} |
| `colors.positive-light` | color | {tailwind-colors.green-600} |
| `colors.positive-muted-dark` | color | {tailwind-colors.green-100} |
| `colors.positive-muted-light` | color | {tailwind-colors.green-100} |
| `colors.primary-dark` | color | {tailwind-colors.neutral-200} |
| `colors.primary-foreground-dark` | color | {tailwind-colors.neutral-900} |
| `colors.primary-foreground-light` | color | {tailwind-colors.neutral-50} |
| `colors.primary-light` | color | {tailwind-colors.neutral-900} |
| `colors.ring-dark` | color | {tailwind-colors.neutral-500} |
| `colors.ring-light` | color | {tailwind-colors.neutral-400} |
| `colors.secondary-dark` | color | {tailwind-colors.neutral-800} |
| `colors.secondary-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.secondary-foreground-light` | color | {tailwind-colors.neutral-900} |
| `colors.secondary-light` | color | {tailwind-colors.neutral-100} |
| `colors.sidebar-accent-dark` | color | {tailwind-colors.neutral-800} |
| `colors.sidebar-accent-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.sidebar-accent-foreground-light` | color | {tailwind-colors.neutral-900} |
| `colors.sidebar-accent-light` | color | {tailwind-colors.neutral-100} |
| `colors.sidebar-border-light` | color | {tailwind-colors.neutral-200} |
| `colors.sidebar-dark` | color | {tailwind-colors.neutral-900} |
| `colors.sidebar-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.sidebar-foreground-light` | color | {tailwind-colors.neutral-950} |
| `colors.sidebar-light` | color | {tailwind-colors.base-white} |
| `colors.sidebar-primary-dark` | color | {tailwind-colors.blue-700} |
| `colors.sidebar-primary-foreground-dark` | color | {tailwind-colors.neutral-50} |
| `colors.sidebar-primary-foreground-light` | color | {tailwind-colors.neutral-50} |
| `colors.sidebar-primary-light` | color | {tailwind-colors.neutral-900} |
| `colors.sidebar-ring-dark` | color | {tailwind-colors.neutral-600} |
| `colors.sidebar-ring-light` | color | {tailwind-colors.neutral-400} |
| `custom.accent-dark-calendar-50` | color | {color.accent} |
| `custom.accent-dark-input-50` | color | {color.accent} |
| `custom.background-dark-calendar-30` | color | {color.background} |
| `custom.background-dark-input-30` | color | {color.background} |
| `custom.blue-500-dark-blue-600` | color | {tailwind-colors.blue-500} |
| `custom.border-dark-input-dark` | color | {color.border} |
| `custom.destructive-dark-destructive-60` | color | {color.destructive} |
| `custom.destructive-dark-destructive-70` | color | {color.destructive} |
| `custom.destructive-dark-destructive-90` | color | {color.destructive} |
| `custom.input-dark-input-80` | color | {color.input} |
| `custom.ring-dark-input-dark` | color | {color.ring} |
| `custom.ring-dark-input-dark-2` | color | {color.ring} |
| `gap.section-title-gap-lg` | dimension | {spacing.5} |
| `gap.section-title-gap-md` | dimension | {spacing.5} |
| `gap.section-title-gap-sm` | dimension | {spacing.4} |
| `gap.section-title-gap-xl` | dimension | {spacing.6} |
| `heading-lg.font-family` | fontFamily | {font.font-sans} |
| `heading-lg.font-size` | dimension | {text.4xl-font-size} |
| `heading-lg.font-weight` | fontWeight | {font-weight.bold} |
| `heading-lg.line-height` | dimension | {text.4xl-line-height} |
| `heading-md.font-family` | fontFamily | {font.font-sans} |
| `heading-md.font-size` | dimension | {text.3xl-font-size} |
| `heading-md.font-weight` | fontWeight | {font-weight.bold} |
| `heading-md.line-height` | dimension | {text.3xl-line-height} |
| `heading-sm.font-family` | fontFamily | {font.font-sans} |
| `heading-sm.font-size` | dimension | {text.2xl-font-size} |
| `heading-sm.font-weight` | fontWeight | {font-weight.bold} |
| `heading-sm.line-height` | dimension | {text.2xl-line-height} |
| `heading-xl.font-family` | fontFamily | {font.font-sans} |
| `heading-xl.font-size` | dimension | {text.5xl-font-size} |
| `heading-xl.font-weight` | fontWeight | {font-weight.bold} |
| `heading-xl.line-height` | dimension | {text.5xl-line-height} |
| `max-width.max-w-2xl` | number | {container.2xl} |
| `max-width.max-w-2xs` | number | {container.2xs} |
| `max-width.max-w-3xl` | number | {container.3xl} |
| `max-width.max-w-3xs` | number | {container.3xs} |
| `max-width.max-w-4xl` | number | {container.4xl} |
| `max-width.max-w-5xl` | number | {container.5xl} |
| `max-width.max-w-6xl` | number | {container.6xl} |
| `max-width.max-w-7xl` | number | {container.7xl} |
| `max-width.max-w-lg` | number | {container.lg} |
| `max-width.max-w-md` | number | {container.md} |
| `max-width.max-w-sm` | number | {container.sm} |
| `max-width.max-w-xl` | number | {container.xl} |
| `max-width.max-w-xs` | number | {container.xs} |
| `min-width.min-w-2xl` | number | {container.2xl} |
| `min-width.min-w-2xs` | number | {container.2xs} |
| `min-width.min-w-3xl` | number | {container.3xl} |
| `min-width.min-w-3xs` | number | {container.3xs} |
| `min-width.min-w-4xl` | number | {container.4xl} |
| `min-width.min-w-5xl` | number | {container.5xl} |
| `min-width.min-w-6xl` | number | {container.6xl} |
| `min-width.min-w-7xl` | number | {container.7xl} |
| `min-width.min-w-lg` | number | {container.lg} |
| `min-width.min-w-md` | number | {container.md} |
| `min-width.min-w-sm` | number | {container.sm} |
| `min-width.min-w-xl` | number | {container.xl} |
| `min-width.min-w-xs` | number | {container.xs} |
| `padding.container-padding-x` | dimension | {spacing.6} |
| `padding.section-padding-y` | dimension | {spacing.24} |

## Components

| Name | Category | Variants / props |
|---|---|---|
| `__Table / Cell/Custom slot/Default/False/No` | __Table | — |
| `_Alert` | COMPONENT_SET | Variant=Default, Variant=Destructive |
| `_Avatar - Initials` | COMPONENT_SET | Border=False, Border=True, ◐ Color=Blue, ◐ Color=Green, ◐ Color=Orange, ◐ Color=Red, ◐ Color=Yellow, ◐ Shape=Circle, ◐ Shape=Rounded, ◐ Size=24, ◐ Size=40, ◐ Size=56, ◐ Size=80 |
| `_Chart / Card` | _Chart | — |
| `_Combobox` | COMPONENT_SET | State=Default, State=Disabled, State=Focus, State=Hover, State=Pressed, Type=Default, Type=With Group Label |
| `_Combobox / CommandMenu - Avatars` | _Combobox | — |
| `_Combobox / CommandMenu - Groups` | _Combobox | — |
| `_Combobox / CommandMenu - Multiselect` | _Combobox | — |
| `_Combobox / CommandMenu - Simple` | _Combobox | — |
| `_Combobox / MenuItem` | _Combobox | State=Default, State=Hover, Type=Avatar, Type=Checkbox, Type=Icon, Type=Simple |
| `_Combobox / Search` | _Combobox | — |
| `_DataTable` | COMPONENT | — |
| `_DatePicker` | COMPONENT_SET | State=Default, State=Disabled, State=Focus, State=Hover, State=Pressed, Type=Icon Left, Type=Icon Right, Type=With Input |
| `_DatePicker  / Button` | _DatePicker | State=Default, State=Disabled, State=Hover |
| `_Dialog` | COMPONENT_SET | Breakpoint=lg, Breakpoint=sm |
| `_Dialog` | COMPONENT_SET | Breakpoint=lg, Breakpoint=md, Breakpoint=sm, Breakpoint=xlg |
| `_Dialog / Close Icon` | _Dialog | State=Default, State=Focus, State=Hover |
| `_Dialog / Example Content` | _Dialog | Type=Form, Type=Text |
| `_DialogWrapper` | COMPONENT | — |
| `_Docs / Header` | _Docs | — |
| `_Docs Header` | COMPONENT | — |
| `_DrawerDektop - Wrapper` | COMPONENT | — |
| `_DrawerDesktop` | COMPONENT_SET | Has padding=False, Has padding=True |
| `_Field` | COMPONENT_SET | Data Invalid=False, Data Invalid=True, Description Placement=Under Input, Description Placement=Under Label, Orientation=Responsive, Orientation=Vertical |
| `_Field` | COMPONENT_SET | Description Placement=Under Input, Description Placement=Under Label, Orientation=Responsive, Orientation=Vertical |
| `_Field / Buttons` | _Field | Orientation=Horizontal, Orientation=Vertical |
| `_Field / Legend` | _Field | Variant=Label, Variant=Legend |
| `_FieldSet` | COMPONENT_SET | Example=1, Example=2, Example=3 |
| `_Form / 1.` | _Form | — |
| `_Form / 2.` | _Form | — |
| `_Form / 3.` | _Form | — |
| `_Form / 4.` | _Form | — |
| `_Form / 5.` | _Form | — |
| `_Form / 6.` | _Form | Breakpoint=Desktop, Breakpoint=Mobile |
| `_Form / 7.` | _Form | Breakpoint=Desktop, Breakpoint=Mobile |
| `_Input` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, Type=Default, Type=File, Type=Password |
| `_InputGroup` | COMPONENT_SET | State=Default, State=Disabled, State=Error, State=Error (Focus), State=Filled, State=Focus, Type=Input, Type=Textarea |
| `_InputGroup` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, Type=Input, Type=Textarea |
| `_InputGroup / Addon Block` | _InputGroup | Align=End, Align=Start |
| `_InputGroup / Addon Inline` | _InputGroup | Variant=Button, Variant=Check Circle, Variant=Dropdown, Variant=Icon, Variant=Kbd, Variant=Spinner, Variant=Text, Variant=Tooltip |
| `_InputGroup / Button` | _InputGroup | Size=icon-sm, Size=icon-xs, Size=sm, Size=xs, State=Default, State=Disabled, State=Focus, State=Hover, State=Loading, State=Pressed, Variant=Default, Variant=Destructive, Variant=Ghost, Variant=Link, Variant=Outline, Variant=Secondary |
| `_LP / Icon` | _LP | — |
| `_Select` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus |
| `_Select` | COMPONENT_SET | State=Default, State=Disabled, State=Filled, State=Filled (Focus), State=Focus |
| `_Select` | COMPONENT_SET | Align=Menu, Align=Variant2, Align=Variant3 |
| `_Select` | COMPONENT_SET | State=Default, State=Disabled, State=Filled, State=Filled (Focus), State=Focus |
| `_SelectMenu` | COMPONENT_SET | Align=Center, Align=Left, Align=Right |
| `_SelectMenu / Item` | _SelectMenu | Selected=False, Selected=True, State=Default, State=Hover, Variant=Avatar, Variant=Default, Variant=Item |
| `_SelectMenu / Item` | _SelectMenu | State=Default, State=Hover, Variant=Checkbox, Variant=Default |
| `_SelectMenu / Item/Custom slot/False/Default` | _SelectMenu | — |
| `_SelectMenu / Item/Custom slot/False/Hover` | _SelectMenu | — |
| `_SelectMenu / Item/Custom slot/True/Default` | _SelectMenu | — |
| `_SelectMenu / Item/Custom slot/True/Hover` | _SelectMenu | — |
| `_SelectMenu / Label` | _SelectMenu | — |
| `_Sheet` | COMPONENT_SET | Breakpoint=md, Breakpoint=sm, Position=bottom, Position=left, Position=right, Position=top |
| `_Sheet - Desktop/left/False` | _Sheet - Desktop | — |
| `_Sheet - Desktop/left/True` | _Sheet - Desktop | — |
| `_Sheet - Mobile` | COMPONENT_SET | Has padding=False, Has padding=True, Max height=False, Max height=True |
| `_Sheet / Close Icon` | _Sheet | State=Default, State=Focus, State=Hover |
| `_Sheet / Example Content` | _Sheet | — |
| `_Sidebar 01.` | COMPONENT | — |
| `_Sidebar 02.` | COMPONENT | — |
| `_Sidebar 03.` | COMPONENT | — |
| `_Sidebar 04.` | COMPONENT | — |
| `_Sidebar 05.` | COMPONENT | — |
| `_Sidebar 06.` | COMPONENT | — |
| `_Sidebar 07.` | COMPONENT_SET | Collapsed=No, Collapsed=Yes |
| `_Sidebar 08.` | COMPONENT | — |
| `_Sidebar 09.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile |
| `_Sidebar 10.` | COMPONENT | — |
| `_Sidebar 11.` | COMPONENT | — |
| `_Sidebar 12.` | COMPONENT | — |
| `_Sonner / Action` | _Sonner | — |
| `_Table` | COMPONENT | — |
| `_Table / Cell` | _Table | Last Cell=No, Last Cell=Yes, State=Default, State=Hover, Variant=Avatar, Variant=Badge, Variant=Button, Variant=Checkbox, Variant=Default, Variant=Dropdown, Variant=Image, Variant=Input, Variant=Progress, Variant=Switch, Variant=Toggle Group |
| `_Table / Cell/Custom slot/Active/False/No` | _Table | — |
| `_Table / Cell/Custom slot/Active/False/Yes` | _Table | — |
| `_Table / Cell/Custom slot/Active/True/No` | _Table | — |
| `_Table / Cell/Custom slot/Active/True/Yes` | _Table | — |
| `_Table / Cell/Custom slot/Default/False/Yes` | _Table | — |
| `_Table / Cell/Custom slot/Default/True/No` | _Table | — |
| `_Table / Cell/Custom slot/Default/True/Yes` | _Table | — |
| `_Table / Cell/Custom slot/Hover/False/No` | _Table | — |
| `_Table / Cell/Custom slot/Hover/False/Yes` | _Table | — |
| `_Table / Cell/Custom slot/Hover/True/No` | _Table | — |
| `_Table / Cell/Custom slot/Hover/True/Yes` | _Table | — |
| `_Table / Head` | _Table | State=Default, State=Hover |
| `_TimePicker` | COMPONENT_SET | State=Default, State=Disabled, State=Focus, State=Hover |
| `Accordion` | COMPONENT | — |
| `Accordion / AccordionItem` | Accordion | Active=Off, Active=On, State=Default, State=Focus, State=Hover, State=Pressed |
| `Alert` | COMPONENT_SET | Variant=Default, Variant=Destructive |
| `AlertDialog` | COMPONENT_SET | Breakpoint=md, Breakpoint=sm |
| `AlertDialogWrapper` | COMPONENT | — |
| `AspectRatio` | COMPONENT_SET | Ratio=1.618:1, Ratio=10:16, Ratio=16:10, Ratio=16:9, Ratio=1:1, Ratio=1:1.618, Ratio=1:2, Ratio=21:9, Ratio=2:1, Ratio=2:3, Ratio=3:2, Ratio=3:4, Ratio=4:3, Ratio=4:5, Ratio=5:4, Ratio=9:16, Ratio=9:21 |
| `Avatar` | COMPONENT_SET | Size=10 (40px), Size=12 (48px), Size=5 (20px), Size=6 (24px), Size=8 (32px), Type=Fallback, Type=Image |
| `Avatar / Form Field` | Avatar | — |
| `Avatar Group` | COMPONENT | — |
| `BadgeNumber` | COMPONENT_SET | State=Default, State=Focus, State=Hover, Variant=Default, Variant=Destructive, Variant=Outline, Variant=Secondary |
| `BadgeStatus` | COMPONENT_SET | Type=Attention, Type=Custom color, Type=Destructive, Type=Neutral, Type=Positive |
| `BadgeText` | COMPONENT_SET | State=Default, State=Focus, State=Hover, Variant=Custom color, Variant=Default, Variant=Outline, Variant=Secondary, Variant=Verified |
| `BadgeText/Destructive/Default` | BadgeText | — |
| `BadgeText/Destructive/Focus` | BadgeText | — |
| `BadgeText/Destructive/Hover` | BadgeText | — |
| `Blocks / Authentication` | Blocks | size=lg, size=sm |
| `Blocks / Blocks/Calendar-27` | Blocks | — |
| `Blocks / Calendar-01.` | Blocks | — |
| `Blocks / Calendar-02.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-03.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-04.` | Blocks | — |
| `Blocks / Calendar-05.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-06.` | Blocks | — |
| `Blocks / Calendar-07.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-08.` | Blocks | — |
| `Blocks / Calendar-09.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-10.` | Blocks | — |
| `Blocks / Calendar-11.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-12.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-13.` | Blocks | — |
| `Blocks / Calendar-14.` | Blocks | — |
| `Blocks / Calendar-15.` | Blocks | — |
| `Blocks / Calendar-16.` | Blocks | — |
| `Blocks / Calendar-17.` | Blocks | — |
| `Blocks / Calendar-18.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-19.` | Blocks | — |
| `Blocks / Calendar-20.` | Blocks | Mobile=No, Mobile=Yes |
| `Blocks / Calendar-21.` | Blocks | — |
| `Blocks / Calendar-22.` | Blocks | — |
| `Blocks / Calendar-23.` | Blocks | — |
| `Blocks / Calendar-24.` | Blocks | — |
| `Blocks / Calendar-25.` | Blocks | — |
| `Blocks / Calendar-26.` | Blocks | — |
| `Blocks / Calendar-28.` | Blocks | — |
| `Blocks / Calendar-29.` | Blocks | — |
| `Blocks / Calendar-30.` | Blocks | — |
| `Blocks / Calendar-31.` | Blocks | — |
| `Blocks / Calendar-32.` | Blocks | — |
| `Blocks / Components / Menu Item / 2.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile, State=Actual, State=Default, State=Hover, Type=Forms, Type=Mail, Type=Music |
| `Blocks / Components / Message` | Blocks | State=Actual, State=Default, State=Hover |
| `Blocks / Custom Icon / Complete` | Blocks | — |
| `Blocks / Custom Icon / Edit` | Blocks | — |
| `Blocks / Custom Icon / Insert` | Blocks | — |
| `Blocks / Custom Icon / Microphone` | Blocks | — |
| `Blocks / Dashboard` | Blocks | Size=lg, Size=sm |
| `Blocks / Dashboard-01` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Forms` | Blocks | Size=lg, Size=sm, Type=Account, Type=Appearance, Type=Display, Type=Notifications, Type=Profile |
| `Blocks / Legend` | Blocks | — |
| `Blocks / Login-01.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Login-02.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Login-03.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Login-04.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Login-05.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Mail` | Blocks | — |
| `Blocks / Menu / Desktop` | Blocks | — |
| `Blocks / Menu / Mobile` | Blocks | Open=No, Open=Yes, Type=1, Type=2 |
| `Blocks / Menu Item` | Blocks | Direction=Horizontal, Direction=Vertical, Show Icon=No, Show Icon=Yes, State=Current, State=Default, State=Hover |
| `Blocks / Music` | Blocks | Size=lg, Size=sm |
| `Blocks / Nav / 1.` | Blocks | — |
| `Blocks / Nav / 2.` | Blocks | — |
| `Blocks / Nav / Nav Item / 1.` | Blocks | State=Current, State=Default, State=Focused, State=Hover |
| `Blocks / Nav / Nav Item / 2.` | Blocks | State=Current, State=Default, State=Hover |
| `Blocks / Notification Number` | Blocks | — |
| `Blocks / OTP-01.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / OTP-02.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / OTP-03.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / OTP-04.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / OTP-05.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Playground` | Blocks | Size=lg, Size=sm, Type=Complete, Type=Edit, Type=Insert |
| `Blocks / Settings Card` | Blocks | — |
| `Blocks / Settings Card / Example Content` | Blocks | Type=1, Type=2 |
| `Blocks / Sidebar` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar Item` | Blocks | State=Current, State=Default, State=Hover |
| `Blocks / Sidebar-01.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-02.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-03.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-04.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-05.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-06.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-07.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-08.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-09.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-10.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-11.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-12.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-13.` | Blocks | — |
| `Blocks / Sidebar-14.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Sidebar-15.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Signup-01.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Signup-02.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Signup-03.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Signup-04.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Signup-05.` | Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Blocks / Statistic Card` | Blocks | — |
| `Blocks / Tasks` | Blocks | Size=lg, Size=sm |
| `Blocks / Text Editor` | Blocks | State=Default, State=Disabled, State=Filled |
| `Blocks / Uploader` | Blocks | — |
| `Blocks / User Item` | Blocks | — |
| `Breadcrumb` | COMPONENT_SET | Size=md, Size=sm |
| `Breadcrumb / BreadcrumbItem` | Breadcrumb | State=Default, State=Focus, State=Hover, Variant=Dropdown, Variant=Ellipsis, Variant=Link, Variant=Link Current |
| `Browser` | COMPONENT | — |
| `Button` | COMPONENT_SET | Size=default, Size=icon, Size=icon-lg, Size=icon-sm, Size=lg, Size=sm, State=Default, State=Disabled, State=Focus, State=Hover, State=Loading, State=Pressed, Variant=Default, Variant=Destructive, Variant=Ghost, Variant=Link, Variant=Outline, Variant=Secondary |
| `ButtonGroup` | COMPONENT_SET | Orientation=Horizontal, Orientation=Vertical, Variant=Default, Variant=Outline, Variant=Secondary |
| `ButtonGroup / AddonInlineExampleContent` | ButtonGroup | — |
| `ButtonGroup / PopoverExampleContent` | ButtonGroup | — |
| `ButtonGroup + Input` | COMPONENT_SET | ButtonGroup Placement=Both, ButtonGroup Placement=End, ButtonGroup Placement=Start |
| `Calendar / ArrowButton` | Calendar | State=Default, State=Disabled, State=Focus, State=Hover, Type=Default, Type=Outline, Variant=Next, Variant=Previous |
| `Calendar / Basic` | Calendar | Mobile=No, Mobile=Yes, Type=Basic, Type=Month and Year Selector, Type=Persian, Type=Range Calendar, Type=Range Calendar - 3 columns |
| `Calendar / CustomDayButton` | Calendar | Rounded=Left, Rounded=None, Rounded=Right, State=Default, State=Disabled, State=Hover, State=Selected, State=Selected (Focus), Variant=Current, Variant=Default, Variant=Outside, Variant=Range |
| `Calendar / DayButton` | Calendar | Rounded=Left, Rounded=None, Rounded=Right, Size=Default, Size=md, State=Default, State=Disabled, State=Hover, State=Selected, State=Selected (Focus), Variant=Current, Variant=Default, Variant=Outside, Variant=Range, Variant=Unavailable |
| `Calendar / DayHeader` | Calendar | — |
| `Calendar / WeekNumber` | Calendar | Variant=Outside |
| `Card` | COMPONENT | — |
| `Card / ExampleContent` | Card | Type=Login Inputs, Type=Text |
| `Card / ExampleFooter` | Card | Type=Badges, Type=Buttons, Type=Login |
| `Carousel` | COMPONENT_SET | Breakpoint=lg, Breakpoint=md, Breakpoint=sm, Orientation=Horizontal, Orientation=Vertical |
| `Carousel / Arrow Button` | Carousel | Orientation=Horizontal, Orientation=Vertical, State=Default, State=Disabled, State=Focus, State=Hover, State=Pressed, Variant=Next, Variant=Previous |
| `Carousel / Basic` | Carousel | — |
| `Carousel / CarouselItem` | Carousel | — |
| `Chart / Area Chart` | Chart | Gradient=No, Gradient=Yes, Type=Basic, Type=Linear, Type=Stacked, Type=Stacked Expanded, Type=Step |
| `Chart / Bar Chart` | Chart | Type=Active, Type=Basic, Type=Custom Label, Type=Horizontal, Type=Label, Type=Mixed, Type=Multiple, Type=Negative, Type=Stacked |
| `Chart / Line Chart` | Chart | Type=Basic, Type=Dots, Type=Dots Colors, Type=Label, Type=Linear, Type=Multiple, Type=Step |
| `Chart / Pie Chart / Donut` | Chart | Type=Active, Type=Basic, Type=Stacked |
| `Chart / Pie Chart / Donut / Interactive` | Chart | — |
| `Chart / Pie Chart / Full` | Chart | Type=Basic, Type=Label |
| `Chart / Radar Chart` | Chart | Type=Basic, Type=Dots, Type=Grid Circle, Type=Grid Circle Filled, Type=Grid Custom, Type=Grid Filled, Type=Lines Only, Type=Multiple, Type=No lines |
| `Chart / Radial Chart ` | Chart | Type=Basic, Type=Grid, Type=Label, Type=Shape, Type=Stacked, Type=Text |
| `Charts / BarChart / Layer` | Charts | Horizontal=False, Horizontal=True, Rectangles=1, Rectangles=2, Rectangles=3 |
| `Charts / BarChart / Rectangle` | Charts | Active=False, Active=True, Horizontal=False, Horizontal=True, Type=Default, Type=Negative, Type=Stacked |
| `Charts / Dot` | Charts | Custom=False, Custom=True, Size=12, Size=8 |
| `Charts / DotOnStroke` | Charts | Size=10, Size=6, Size=8 |
| `Charts / Grid` | Charts | Horizontal=False, Horizontal=True |
| `Charts / Legend` | Charts | — |
| `Charts / LegendItem` | Charts | Type=Default, Type=Icon |
| `Charts / PieChart / LabelList` | Charts | — |
| `Charts / PieChart / LabelWrapper` | Charts | — |
| `Charts / PieChart / Pie` | Charts | Stroke=No, Stroke=Yes |
| `Charts / Radar Chart / Label Wrapper / Label ` | Charts | — |
| `Charts / Radar Chart / Radius Axis` | Charts | — |
| `Charts / RadarChart / Grid` | Charts | Filled=No, Filled=Yes, Type=Circle, Type=Default |
| `Charts / RadarChart / Label Wrapper` | Charts | Type=Custom, Type=Default |
| `Charts / Tooltip` | Charts | — |
| `Charts / Tooltip / TooltipItem` | Charts | Type=Default, Type=Icon, Type=Line, Type=Total |
| `Charts-1.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile |
| `Checkbox` | COMPONENT_SET | Checked=No, Checked=Yes, Control Placement=End, Control Placement=Start, State=Default, State=Disabled, State=Focus, State=Pressed, Type=Box, Type=Default |
| `CheckboxGroup` | COMPONENT | — |
| `Collapsible` | COMPONENT_SET | State=Active, State=Inactive |
| `Combobox` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus |
| `Combobox - Multiple` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, State=Typing |
| `Combobox / ComboboxChip` | Combobox | — |
| `ComboboxContent` | COMPONENT_SET | Type=Avatar, Type=Default, Type=Group, Type=Icon, Type=Item |
| `ComboboxContent / ComboboxItem` | ComboboxContent | State=Default, State=Hover, Variant=Avatar, Variant=Default, Variant=Item |
| `ComboboxContent / Label` | ComboboxContent | — |
| `Command` | COMPONENT_SET | Variant=Empty, Variant=Suggestions |
| `Command / Input` | Command | State=Default, State=Disabled, State=Filled |
| `Command / Input / Command / Item / Separator` | Command | — |
| `Command / Input / Command / MenuHeading` | Command | — |
| `Command / Item / Default` | Command | Selected=No, Selected=Yes, State=Default, State=Disabled, State=Hover, Variant=Default, Variant=Icon |
| `ContextMenu` | COMPONENT | — |
| `ContextMenu / Item / Default` | ContextMenu | Level=1, Level=2, State=Default, State=Disabled, State=Hover, Variant=Checkbox, Variant=Default, Variant=Radio |
| `ContextMenu / Item / Separator` | ContextMenu | — |
| `ContextMenu / Item / SubTrigger` | ContextMenu | Active=No, Active=Yes |
| `ContextMenu / Item / Title` | ContextMenu | — |
| `Crypto Icon` | COMPONENT_SET | Symbol=0XBTC, Symbol=1INCH, Symbol=2GIVE, Symbol=AAVE, Symbol=ABT, Symbol=ACT, Symbol=ACTN, Symbol=ADA, Symbol=ADD, Symbol=ADX, Symbol=AE, Symbol=AEON, Symbol=AGI, Symbol=AGRS, Symbol=AION, Symbol=ALBT, Symbol=ALGO, Symbol=AMB, Symbol=AMP, Symbol=AMPL, Symbol=ANT, Symbol=APEX, Symbol=APPC, Symbol=ARDR, Symbol=ARG, Symbol=ARK, Symbol=ARN, Symbol=ARNX, Symbol=ARY, Symbol=AST, Symbol=ATM, Symbol=ATOM, Symbol=AUD, Symbol=AUDR, Symbol=AUTO, Symbol=AYWA, Symbol=BAB, Symbol=BAL, Symbol=BAND, Symbol=BAT, Symbol=BAY, Symbol=BCBC, Symbol=BCC, Symbol=BCD, Symbol=BCH, Symbol=BCIO, Symbol=BCN, Symbol=BCO, Symbol=BCPT, Symbol=BDL, Symbol=BEAM, Symbol=BELA, Symbol=BIX, Symbol=BLCN, Symbol=BLK, Symbol=BLOCK, Symbol=BLZ, Symbol=BNB, Symbol=BNT, Symbol=BNTY, Symbol=BOOTY, Symbol=BOS, Symbol=BPT, Symbol=BQ, Symbol=BRD, Symbol=BSD, Symbol=BSV, Symbol=BTC, Symbol=BTCD, Symbol=BTCH, Symbol=BTCP, Symbol=BTCZ, Symbol=BTDX, Symbol=BTG, Symbol=BTM, Symbol=BTS, Symbol=BTT, Symbol=BTX, Symbol=BURST, Symbol=BZE, Symbol=CALL, Symbol=CC, Symbol=CDN, Symbol=CDT, Symbol=CENZ, Symbol=CHAIN, Symbol=CHAT, Symbol=CHIPS, Symbol=CIX, Symbol=CLAM, Symbol=CLOAK, Symbol=CMM, Symbol=CMT, Symbol=CND, Symbol=CNX, Symbol=CNY, Symbol=COB, Symbol=COLX, Symbol=COMP, Symbol=COQUI, Symbol=CRED, Symbol=CRPT, Symbol=CRW, Symbol=CS, Symbol=CTR, Symbol=CTXC, Symbol=CVC, Symbol=D, Symbol=DAI, Symbol=DASH, Symbol=DAT, Symbol=DATA, Symbol=DBC, Symbol=DCN, Symbol=DCR, Symbol=DEEZ, Symbol=DENT, Symbol=DEW, Symbol=DGB, Symbol=DGD, Symbol=DLT, Symbol=DNA, Symbol=DNT, Symbol=DOCK, Symbol=DOGE, Symbol=DOT, Symbol=DRGN, Symbol=DROP, Symbol=DTA, Symbol=DTH, Symbol=DTR, Symbol=EBST, Symbol=ECA, Symbol=EDG, Symbol=EDO, Symbol=EDOGE, Symbol=ELA, Symbol=ELEC, Symbol=ELF, Symbol=ELIX, Symbol=ELLA, Symbol=EMC, Symbol=EMC2, Symbol=ENG, Symbol=ENJ, Symbol=ENTRP, Symbol=EON, Symbol=EOP, Symbol=EOS, Symbol=EQLI, Symbol=EQUA, Symbol=ETC, Symbol=ETH, Symbol=ETHOS, Symbol=ETN, Symbol=ETP, Symbol=EUR, Symbol=EVX, Symbol=EXMO, Symbol=EXP, Symbol=FAIR, Symbol=FCT, Symbol=FIL, Symbol=FJC, Symbol=FLDC, Symbol=FLO, Symbol=FLUX, Symbol=FSN, Symbol=FTC, Symbol=FUEL, Symbol=FUN, Symbol=GAME, Symbol=GAS, Symbol=GBP, Symbol=GBX, Symbol=GBYTE, Symbol=GENERIC, Symbol=GIN, Symbol=GLXT, Symbol=GMR, Symbol=GNO, Symbol=GNT, Symbol=GOLD, Symbol=GRC, Symbol=GRIN, Symbol=GRS, Symbol=GSC, Symbol=GTO, Symbol=GUP, Symbol=GUSD, Symbol=GVT, Symbol=GXS, Symbol=GZR, Symbol=HIGHT, Symbol=HODL, Symbol=HOT, Symbol=HPB, Symbol=HSR, Symbol=HT, Symbol=HTML, Symbol=HTR, Symbol=HUC, Symbol=HUSH, Symbol=ICN, Symbol=ICX, Symbol=IGNIS, Symbol=ILK, Symbol=INK, Symbol=INS, Symbol=ION, Symbol=IOP, Symbol=IOST, Symbol=IOTX, Symbol=IQ, Symbol=ITC, Symbol=JNT, Symbol=JPY, Symbol=KCS, Symbol=KDA, Symbol=KIN, Symbol=KLOWN, Symbol=KMD, Symbol=KNC, Symbol=KRB, Symbol=LBC, Symbol=LEND, Symbol=LEO, Symbol=LINK, Symbol=LKK, Symbol=LOOM, Symbol=LPT, Symbol=LRC, Symbol=LSK, Symbol=LTC, Symbol=LUN, Symbol=LUNA, Symbol=MAID, Symbol=MANA, Symbol=MATIC, Symbol=MCAP, Symbol=MCO, Symbol=MDA, Symbol=MDS, Symbol=MED, Symbol=MEETONE, Symbol=MFT, Symbol=MIOTA, Symbol=MIR, Symbol=MITH, Symbol=MKR, Symbol=MLN, Symbol=MNX, Symbol=MNZ, Symbol=MOAC, Symbol=MOD, Symbol=MONA, Symbol=MSR, Symbol=MTH, Symbol=MTL, Symbol=MUSIC, Symbol=MZC, Symbol=NANO, Symbol=NAS, Symbol=NAV, Symbol=NCASH, Symbol=NDZ, Symbol=NEBL, Symbol=NEO, Symbol=NEOS, Symbol=NEU, Symbol=NEXO, Symbol=NGC, Symbol=NIO, Symbol=NLC2, Symbol=NLG, Symbol=NMC, Symbol=NMR, Symbol=NPXS, Symbol=NULS, Symbol=NXS, Symbol=NXT, Symbol=OAX, Symbol=OCEAN, Symbol=OMG, Symbol=OMNI, Symbol=ONG, Symbol=ONT, Symbol=OOT, Symbol=OST, Symbol=OX, Symbol=OXT, Symbol=PAC, Symbol=PART, Symbol=PASC, Symbol=PASL, Symbol=PAX, Symbol=PAY, Symbol=PAYX, Symbol=PINK, Symbol=PIRL, Symbol=PIVX, Symbol=PLR, Symbol=POA, Symbol=POE, Symbol=POLIS, Symbol=POLY, Symbol=POT, Symbol=POWR, Symbol=PPC, Symbol=PPP, Symbol=PPT, Symbol=PRE, Symbol=PRL, Symbol=PRQ, Symbol=PRQBOOST, Symbol=PUNGO, Symbol=PURA, Symbol=QASH, Symbol=QIWI, Symbol=QLC, Symbol=QRL, Symbol=QSP, Symbol=QTUM, Symbol=R, Symbol=RADS, Symbol=RAP, Symbol=RCN, Symbol=RDD, Symbol=RDN, Symbol=REN, Symbol=REP, Symbol=REPV2, Symbol=REQ, Symbol=RHOC, Symbol=RIC, Symbol=RISE, Symbol=RLC, Symbol=RPX, Symbol=RUB, Symbol=RVN, Symbol=RYO, Symbol=SAFE, Symbol=SAI, Symbol=SALT, Symbol=SAN, Symbol=SBD, Symbol=SBERBANK, Symbol=SC, Symbol=SEK, Symbol=SHIFT, Symbol=SIB, Symbol=SIN, Symbol=SKY, Symbol=SLR, Symbol=SLS, Symbol=SMART, Symbol=SNGLS, Symbol=SNM, Symbol=SNT, Symbol=SNX, Symbol=SOC, Symbol=SPANK, Symbol=SPHTX, Symbol=SRN, Symbol=STAK, Symbol=START, Symbol=STEEM, Symbol=STORJ, Symbol=STORM, Symbol=STQ, Symbol=STRAT, Symbol=STX, Symbol=SUB, Symbol=SUMO, Symbol=SUSHI, Symbol=SYS, Symbol=TAAS, Symbol=TAU, Symbol=TBX, Symbol=TEL, Symbol=TEN, Symbol=TERN, Symbol=TGCH, Symbol=THETA, Symbol=THT, Symbol=TIX, Symbol=TKN, Symbol=TKS, Symbol=TNB, Symbol=TNC, Symbol=TNT, Symbol=TOMO, Symbol=TPAY, Symbol=TRIG, Symbol=TRTL, Symbol=TRX, Symbol=TUSD, Symbol=TZC, Symbol=UBQ, Symbol=UMA, Symbol=UNI, Symbol=UNITY, Symbol=USD, Symbol=USDC, Symbol=USDT, Symbol=UST, Symbol=UTK, Symbol=VERI, Symbol=VET, Symbol=VIA, Symbol=VIB, Symbol=VIBE, Symbol=VIVO, Symbol=VRC, Symbol=VRSC, Symbol=VTC, Symbol=VTHO, Symbol=WABI, Symbol=WAN, Symbol=WAVES, Symbol=WAX, Symbol=WBTC, Symbol=WGR, Symbol=WICC, Symbol=WINGS, Symbol=WPR, Symbol=WTC, Symbol=X, Symbol=XAS, Symbol=XBC, Symbol=XBP, Symbol=XBY, Symbol=XCM, Symbol=XCP, Symbol=XDN, Symbol=XEM, Symbol=XIN, Symbol=XLM, Symbol=XMCC, Symbol=XMG, Symbol=XMO, Symbol=XMR, Symbol=XMY, Symbol=XP, Symbol=XPA, Symbol=XPM, Symbol=XRP, Symbol=XSG, Symbol=XTZ, Symbol=XUC, Symbol=XVC, Symbol=XVG, Symbol=XZC, Symbol=YFI, Symbol=YOYOW, Symbol=ZCL, Symbol=ZEC, Symbol=ZEL, Symbol=ZEN, Symbol=ZEST, Symbol=ZIL, Symbol=ZILLA, Symbol=ZRX |
| `CTA Button` | COMPONENT_SET | Size=default, Size=icon, Size=icon-lg, Size=icon-sm, Size=lg, Size=sm, State=Default, State=Disabled, State=Focus, State=Hover, State=Loading, State=Pressed |
| `Cursor` | COMPONENT_SET | cursor=alias, cursor=all-scroll, cursor=auto, cursor=cell, cursor=col-resize, cursor=conext-menu, cursor=copy, cursor=crosshair, cursor=default, cursor=e-resize, cursor=ew-resize, cursor=grab, cursor=grabbing, cursor=help, cursor=move, cursor=n-resize, cursor=ne-resize, cursor=nesw-resize, cursor=no-drop, cursor=not-allowed, cursor=ns-resize, cursor=nw-resize, cursor=nwse-resize, cursor=pointer, cursor=progress, cursor=row-resize, cursor=s-resize, cursor=se-resize, cursor=sw-resize, cursor=text, cursor=vertical-text, cursor=w-resize, cursor=wait, cursor=zoom-in, cursor=zoom-out |
| `Custom Icon / Brightness` | Custom Icon | — |
| `Custom Icon / Chartbar` | Custom Icon | — |
| `Custom Icon / CirclePlus` | Custom Icon | — |
| `Custom Icon / Dashboard` | Custom Icon | — |
| `Custom Icon / Inner-shadow-top` | Custom Icon | — |
| `Custom Icon /List` | Custom Icon | — |
| `Dashboard-1.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-2.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-3.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-4.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-5.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-6.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `Dashboard-7.` | COMPONENT_SET | Breakpoint=Desktop, Breakpoint=Mobile, Breakpoint=Mobile Open |
| `DatePicker` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, State=Hover (Select only), Type=Select, Type=With Input |
| `DatePicker  / Button` | DatePicker | State=Default, State=Disabled, State=Hover |
| `Dialog / CloseIcon` | Dialog | State=Default, State=Focus, State=Hover |
| `Dialog / ExampleContent` | Dialog | Type=Form, Type=Text |
| `Dialog-v2` | COMPONENT_SET | Breakpoint=lg, Breakpoint=md, Breakpoint=sm, Breakpoint=xlg |
| `DialogWrapper-v2` | COMPONENT | — |
| `Drawer / ExampleContent` | Drawer | Variant=Form, Variant=Statistic |
| `Drawer / ExampleContent / Button` | Drawer | State=Default, State=Focus, State=Hover, State=Pressed, Variant=Minus, Variant=Plus |
| `DrawerDesktop / Button bar` | DrawerDesktop | Type=Inline, Type=Stacked |
| `DrawerDesktop-v2` | COMPONENT_SET | Has padding=False, Has padding=True |
| `DrawerDesktop-Wrapper-v2` | COMPONENT | — |
| `DrawerMobile` | COMPONENT_SET | Breakpoint=md, Breakpoint=sm |
| `DrawerMobile - Wrapper` | COMPONENT_SET | Breakpoint=md, Breakpoint=sm |
| `DropdownMenu` | COMPONENT_SET | Menu alignment=Center, Menu alignment=Left, Menu alignment=Right |
| `DropdownMenu` | COMPONENT_SET | Auto layout=Fill, Auto layout=Hug |
| `DropdownMenu / Item / Custom slot` | DropdownMenu | State=Default, State=Disabled, State=Hover |
| `DropdownMenu / Item / Default` | DropdownMenu | State=Default, State=Disabled, State=Error, State=Hover, Variant=Checkbox, Variant=Default, Variant=Icon, Variant=Radio |
| `DropdownMenu / Item / Label` | DropdownMenu | Level=1, Level=2 |
| `DropdownMenu / Item / Separator` | DropdownMenu | — |
| `DropdownMenu / Item / SubTrigger` | DropdownMenu | Active=No, Active=Yes |
| `DropdownMenu / Item / User` | DropdownMenu | — |
| `DropdownMenu Trigger / Avatar` | DropdownMenu Trigger | State=Default, State=Disabled, State=Focus, State=Hover |
| `Emoji` | COMPONENT | — |
| `Empty` | COMPONENT | — |
| `Empty / Content` | Empty | Content=2 Buttons (Horizontal), Content=2 Buttons (Vertical), Content=3 Buttons, Content=Button, Content=Input + Description |
| `Empty / Media` | Empty | Type=Avatar, Type=AvatarGroup, Type=Icon |
| `Field` | COMPONENT_SET | Description Placement=Under Input, Description Placement=Under Label, Error=False, Error=True, Orientation=Responsive, Orientation=Vertical |
| `Field / Buttons` | Field | Orientation=Horizontal, Orientation=Vertical |
| `Field / Legend` | Field | Variant=Label, Variant=Legend |
| `Field / Separator` | Field | — |
| `Field/Label addtional info` | Field | — |
| `FieldSet` | COMPONENT_SET | Example=1, Example=2, Example=3 |
| `Flag` | COMPONENT_SET | Name=Abkhazia, Name=Afghanistan, Name=Aland Islands, Name=Albania, Name=Algeria, Name=American Samoa, Name=Angola, Name=Anguilla, Name=Antigua and Barbuda, Name=Argentina, Name=Armenia, Name=Aruba, Name=Australia, Name=Austria, Name=Azerbaijan, Name=Azores Islands, Name=Bahamas, Name=Bahrain, Name=Balearic Islands, Name=Bangladesh, Name=Barbados, Name=Basque Country, Name=Belarus, Name=Belgium, Name=Belize, Name=Benin, Name=Bermuda, Name=Bhutan, Name=Bolivia, Name=Bonaire, Name=Bosnia and Herzegovina, Name=Botswana, Name=Brazil, Name=British Columbia, Name=British Indian Ocean Territory, Name=British Virgin Islands, Name=Brunei, Name=Bulgaria, Name=Burkina Faso, Name=Burundi, Name=Cambodia, Name=Cameroon, Name=Canada, Name=Canary Islands, Name=Cape Verde, Name=Cayman Islands, Name=Central African Republic, Name=Ceuta, Name=Chad, Name=Chile, Name=China, Name=Cocos Island, Name=Colombia, Name=Comoros, Name=Cook Islands, Name=Corsica, Name=Costa Rica, Name=Croatia, Name=Cuba, Name=Curacao, Name=Cyprus, Name=Czech Republic, Name=Democratic Republic Of Congo, Name=Denmark, Name=Djibouti, Name=Dominica, Name=Dominican Republic, Name=East Timor, Name=Ecuador, Name=Egypt, Name=El Salvador, Name=England, Name=Equatorial Guinea, Name=Eritrea, Name=Estonia, Name=Ethiopia, Name=European Union, Name=Falkland Islands, Name=Faroe Islands, Name=Fiji, Name=Finland, Name=France, Name=French Polynesia, Name=Gabon, Name=Galapagos Islands, Name=Gambia, Name=Georgia, Name=Germany, Name=Ghana, Name=Gibraltar, Name=Greece, Name=Greenland, Name=Grenada, Name=Guam, Name=Guatemala, Name=Guernsey, Name=Guinea, Name=Guinea Bissau, Name=Guyana, Name=Haiti, Name=Hawaii, Name=Honduras, Name=Hong Kong, Name=Hungary, Name=Iceland, Name=India, Name=Indonesia, Name=Iran, Name=Iraq, Name=Ireland, Name=Isle Of Man, Name=Israel, Name=Italy, Name=Ivory Coast, Name=Jamaica, Name=Japan, Name=Jersey, Name=Jordan, Name=Kazakhstan, Name=Kenya, Name=Kiribati, Name=Kosovo, Name=Kuwait, Name=Kyrgyzstan, Name=Laos, Name=Latvia, Name=Lebanon, Name=Lesotho, Name=Liberia, Name=Libya, Name=Liechtenstein, Name=Lithuania, Name=Luxembourg, Name=Macao, Name=Madagascar, Name=Madeira, Name=Malawi, Name=Malaysia, Name=Maldives, Name=Mali, Name=Malta, Name=Marshall Island, Name=Martinique, Name=Mauritania, Name=Mauritius, Name=Melilla, Name=Mexico, Name=Micronesia, Name=Moldova, Name=Monaco, Name=Mongolia, Name=Montenegro, Name=Montserrat, Name=Morocco, Name=Mozambique, Name=Myanmar, Name=Namibia, Name=Nato, Name=Nauru, Name=Nepal, Name=Netherlands, Name=New Zealand, Name=Nicaragua, Name=Niger, Name=Nigeria, Name=Niue, Name=Norfolk Island, Name=North Korea, Name=Northern Cyprus, Name=Northern Marianas Islands, Name=Norway, Name=Oman, Name=Orkney Islands, Name=Ossetia, Name=Pakistan, Name=Palau, Name=Palestine, Name=Panama, Name=Papua New Guinea, Name=Paraguay, Name=Peru, Name=Philippines, Name=Pitcairn Islands, Name=Poland, Name=Portugal, Name=Puerto Rico, Name=Qatar, Name=Rapa Nui, Name=Republic Of Macedonia, Name=Republic Of The Congo, Name=Romania, Name=Russia, Name=Rwanda, Name=Saba Island, Name=Sahrawi Arab Democratic Republic, Name=Samoa, Name=San Marino, Name=Sao Tome and Prince, Name=Sardinia, Name=Saudi Arabia, Name=Scotland, Name=Senegal, Name=Serbia, Name=Seychelles, Name=Sierra Leone, Name=Singapore, Name=Sint Eustatius, Name=Sint Maarten, Name=Slovakia, Name=Slovenia, Name=Solomon Islands, Name=Somalia, Name=Somaliland, Name=South Africa, Name=South Korea, Name=South Sudan, Name=Spain, Name=Sri Lanka, Name=St Barts, Name=St Lucia, Name=St Vincent and The Grenadines, Name=Sudan, Name=Suriname, Name=Swaziland, Name=Sweden, Name=Switzerland, Name=Syria, Name=Taiwan, Name=Tajikistan, Name=Tanzania, Name=Thailand, Name=Tibet, Name=Togo, Name=Tokelau, Name=Tonga, Name=Transnistria, Name=Trinidad and Tobago, Name=Tunisia, Name=Turkey, Name=Turkmenistan, Name=Turks and Caicos, Name=Tuvalu, Name=Uganda, Name=Ukraine, Name=United Arab Emirates, Name=United Kingdom, Name=United Nations, Name=United States, Name=Uruguay, Name=Uzbekista N, Name=Vanuatu, Name=Vatican City, Name=Venezuela, Name=Vietnam, Name=Virgin Islands, Name=Wales, Name=Yemen, Name=Zambia, Name=Zimbabwe, Name=andorra |
| `HoverCard` | COMPONENT_SET | Active=No, Active=Yes |
| `HoverCard / Card` | HoverCard | — |
| `HoverCard / ContentExample` | HoverCard | — |
| `HoverCard / Trigger` | HoverCard | State=Default, State=Disabled, State=Focus, State=Hover, State=Pressed |
| `Image Placeholder` | COMPONENT | — |
| `Image upload` | COMPONENT | — |
| `Image view` | COMPONENT_SET | Ratio=16:9, Ratio=1:1, Ratio=1:2, Ratio=2:1, Ratio=2:3, Ratio=3:1, Ratio=3:2, Ratio=3:4, Ratio=4:1, Ratio=4:3, Ratio=4:5, Ratio=5:4, Ratio=9:16, Scale by=Height, Scale by=Width |
| `Input` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, Type=Default, Type=File, Type=Password |
| `InputGroup` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus, Type=Input, Type=Textarea |
| `InputGroup / AddonBlock` | InputGroup | Align=End, Align=Start |
| `InputGroup / AddonInline` | InputGroup | Variant=Button, Variant=Check Circle, Variant=Dropdown, Variant=Icon, Variant=Kbd, Variant=Spinner, Variant=Text, Variant=Tooltip |
| `InputGroup / Button` | InputGroup | Size=icon-sm, Size=icon-xs, Size=sm, Size=xs, State=Default, State=Disabled, State=Focus, State=Hover, State=Loading, State=Pressed, Variant=Default, Variant=Destructive, Variant=Ghost, Variant=Link, Variant=Outline, Variant=Secondary |
| `InputOTP` | COMPONENT_SET | Variant=Digits Only, Variant=Simple, Variant=With Separator, Variant=With Spacing |
| `InputOTP / Slot` | InputOTP | Filled=False, Filled=True, State=Default, State=Error, State=Error (Focus), State=Focus |
| `Item` | COMPONENT_SET | Size=Default, Size=Small, Variant=Default, Variant=Muted, Variant=Outline |
| `Item / Actions` | Item | Type=Buttons, Type=Icon, Type=Text + Button |
| `Item / Media` | Item | Variant=Avatar Group, Variant=Avatar Image, Variant=Icon, Variant=Icon (Simple), Variant=Image 24, Variant=Image 32, Variant=Image 40, Variant=Image 48, Variant=Image 56, Variant=Image 64 |
| `ItemGroup` | COMPONENT | — |
| `Kbd` | COMPONENT_SET | Background=Default, Background=Primary |
| `KbdGroup` | COMPONENT_SET | Type=+ Separated, Type=Default |
| `Logo placeholder` | COMPONENT | — |
| `Menubar` | COMPONENT | — |
| `Menubar / Item / Default` | Menubar | Level=1, Level=2, State=Default, State=Disabled, State=Hover, Variant=Checkbox, Variant=Default, Variant=Radio |
| `Menubar / Item / Separator` | Menubar | — |
| `Menubar / Item / SubTrigger` | Menubar | Active=Off, Active=On |
| `Menubar / Menu` | Menubar | — |
| `Menubar / Trigger` | Menubar | Open=No, Open=Yes, Placement=Bottom, Placement=Default, Placement=Top |
| `ModalOverlay` | COMPONENT | — |
| `NavigationMenu` | COMPONENT | — |
| `NavigationMenu / Button` | NavigationMenu | State=Default, State=Focused, State=Hover, Variant=Link, Variant=Trigger |
| `NavigationMenu / MenuLink` | NavigationMenu | State=Default, State=Hover, Type=Default, Type=Simple |
| `NavigationMenu / Popover` | NavigationMenu | Type=2 Column List, Type=Custom, Type=List, Type=Simple List, Type=Simple List with Icon |
| `Pagination` | COMPONENT | — |
| `Pagination / PaginationItem` | Pagination | State=Active, State=Active (Focus), State=Active (Hover), State=Default, State=Disabled, State=Focus, State=Hover, Variant=Ellipsis, Variant=Link, Variant=Next, Variant=Next - Icon only, Variant=Previous, Variant=Previous - Icon only |
| `Payment Method Icon` | COMPONENT_SET | Name=Affirm, Name=Alipay, Name=AmazonPay, Name=Amex, Name=ApplePay, Name=Bancontact, Name=Bitcoin, Name=BitcoinCash, Name=Bitpay, Name=Citadele, Name=DinersClub, Name=Discover, Name=Elo, Name=Etherium, Name=FacebookPay, Name=Forbrugsforeningen, Name=Giropay, Name=GooglePay, Name=Ideal, Name=Interac, Name=JCB, Name=Klarna, Name=Lightcoin, Name=Maestro, Name=Mastercard, Name=PayPal, Name=Payoneer, Name=Paysafe, Name=Poli, Name=Qiwi, Name=SEPA, Name=ShopPay, Name=Skrill, Name=Sofort, Name=Stripe, Name=UnionPay, Name=Venmo, Name=Verifone, Name=Visa, Name=WeChat, Name=Webmoney, Name=Yandex |
| `Popover` | COMPONENT_SET | Has padding=False, Has padding=True |
| `Popover / ContentExample` | Popover | — |
| `Pro Blocks / 404 Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / 404 Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / 404 Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / App Shell / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / App Shell / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / App Shell / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / App Shell / 4.` | Pro Blocks | Breakpoint=App Shell, Breakpoint=Mobile |
| `Pro Blocks / Banner / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Banner / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Banner / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Banner / 4.` | Pro Blocks | — |
| `Pro Blocks / Banner / 5.` | Pro Blocks | Theme=Dark, Theme=Light |
| `Pro Blocks / Banner / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 1 - no aspect ratio` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 2 - no aspect ratio.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 3 - no aspect ratio` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Card / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Bento Grid / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Card / 1.` | Pro Blocks | — |
| `Pro Blocks / Blog Card / 2.` | Pro Blocks | — |
| `Pro Blocks / Blog Card / 3.` | Pro Blocks | — |
| `Pro Blocks / Blog Card / 4.` | Pro Blocks | — |
| `Pro Blocks / Blog Card / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Card / 6.` | Pro Blocks | — |
| `Pro Blocks / Blog Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Blog Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Buttons / Button Bookmark` | Pro Blocks | — |
| `Pro Blocks / Buttons / Button Like` | Pro Blocks | — |
| `Pro Blocks / Buttons / Button Split Dropdown` | Pro Blocks | — |
| `Pro Blocks / Buttons / Buttons Group` | Pro Blocks | — |
| `Pro Blocks / Buttons / Number Stepper` | Pro Blocks | — |
| `Pro Blocks / Buttons / Social Buttons Horizontal` | Pro Blocks | — |
| `Pro Blocks / Buttons / Social Buttons Vertical` | Pro Blocks | — |
| `Pro Blocks / Buttons / Steps` | Pro Blocks | — |
| `Pro Blocks / Buttons / Toggle Buttons` | Pro Blocks | — |
| `Pro Blocks / Card / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Done=No, Done=Yes |
| `Pro Blocks / Card / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Card / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Comparison Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Contact Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / CTA Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Description Item` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Button=No, Button=Yes, Direction=Horizontal, Direction=Vertical, Type=Input, Type=Text, Type=Textarea |
| `Pro Blocks / Description List / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Description List / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Description List / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Description List / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty Card / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty Card / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty Card / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty Content` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty LP Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty LP Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty LP Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Empty Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Empty Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Empty Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Empty Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Examples / Dashboard 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Examples / Landing Page 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / FAQ Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / FAQ Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / FAQ Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / FAQ Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 10.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 11.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 12.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 13.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 14.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 15.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 16.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 17.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 18.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 19.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Feature Section / 9.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Footer / 9.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 10.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 11.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Gallery Section / 9.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Header Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 10.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 11.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 12.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Hero Section / 9.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Integration Card` | Pro Blocks | Active=No, Active=Yes, Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Logo Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / LP Navbar / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / LP Navbar / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / Navbar / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / Navbar / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Open=No, Open=Yes |
| `Pro Blocks / Navbar / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Navbar Icon Button` | Pro Blocks | State=Default, State=Hover, State=Pressed, Variant=Ghost, Variant=Primary |
| `Pro Blocks / Navbar Link` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Current=No, Current=Yes, State=Default, State=Hover |
| `Pro Blocks / Page Header / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Page Header / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Pattern / 1.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 10.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 11.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 12.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 13.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 14.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 15.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 16.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 17.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 18.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 19.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 2.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 20.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 21.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 22.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 23.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 24.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 25.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 26.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 27.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 28.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 29.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 3.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 30.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 4.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 5.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 6.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 7.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 8.` | Pro Blocks | — |
| `Pro Blocks / Pattern / 9.` | Pro Blocks | — |
| `Pro Blocks / Person Card / 1.` | Pro Blocks | Direction=Center, Direction=Left Align |
| `Pro Blocks / Person Card / 2.` | Pro Blocks | — |
| `Pro Blocks / Person Card / 3.` | Pro Blocks | Direction=Center, Direction=Image Left, Direction=Left Align |
| `Pro Blocks / Person Card / 4.` | Pro Blocks | — |
| `Pro Blocks / Pricing Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Pricing Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Pricing Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Pricing Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Rich Text Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Rich Text Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Rich Text Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Rich Text Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Rich Text Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Card, Type=Flat |
| `Pro Blocks / Section Footer / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Footer / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Footer / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Footer / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Footer / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Header / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Header / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Header / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Header / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Header / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Section Title` | Pro Blocks | Align=Center, Align=Left, Heading Size=LG, Heading Size=MD, Heading Size=SM, Heading Size=XL |
| `Pro Blocks / Settings / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Settings / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sidebar Link` | Pro Blocks | Current=No, Current=Yes |
| `Pro Blocks / Sign In / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 10.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Tab=Sign in, Tab=Sign up |
| `Pro Blocks / Sign In / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile, Type=Sign in, Type=Sign up |
| `Pro Blocks / Sign In / 8.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign In / 9.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Sign Up / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Stats Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Tab Nav Link` | Pro Blocks | Current=No, Current=Yes, State=Default, State=Disabled, State=Hover |
| `Pro Blocks / Tab Nav Links` | Pro Blocks | — |
| `Pro Blocks / Table Header / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Table Header / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Table Header / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Table Header / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Tagline` | Pro Blocks | Variant=Ghost, Variant=Outline |
| `Pro Blocks / Team Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Team Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Team Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Team Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 1.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 2.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 3.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 4.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 5.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 6.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `Pro Blocks / Testimonials Section / 7.` | Pro Blocks | Breakpoint=Desktop, Breakpoint=Mobile |
| `ProBlocks / Buttons / Menu Button` | ProBlocks | Open=No, Open=Yes, State=Default, State=Hover |
| `Progress` | COMPONENT_SET | Percent=0%, Percent=100%, Percent=25%, Percent=50%, Percent=75% |
| `RadioButton` | COMPONENT_SET | Active=Off, Active=On, Control Placement=End, Control Placement=Start, State=Default, State=Disabled, State=Focus, Type=Box, Type=Default |
| `RadioGroup` | COMPONENT | — |
| `Rectangle 1` | COMPONENT | — |
| `Resizable` | COMPONENT | — |
| `Resizable / Handle` | Resizable | State=Default, State=Focus |
| `Ring` | COMPONENT | — |
| `ScrollArea / Horizontal` | ScrollArea | — |
| `ScrollArea / Vertical` | ScrollArea | — |
| `scrollbar-hoz` | COMPONENT_SET | Mode=dark, Mode=light, State=default, State=hover |
| `scrollbar-ver` | COMPONENT_SET | Mode=dark, Mode=light, Size=normal, Size=small, State=default, State=hover |
| `Select` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus |
| `SelectMenu` | COMPONENT_SET | Type=Avatar, Type=Default, Type=Group, Type=Icon, Type=Item |
| `SelectMenu / Item` | SelectMenu | Selected=False, Selected=True, State=Default, State=Hover, Variant=Avatar, Variant=Default, Variant=Item |
| `SelectMenu / Label` | SelectMenu | — |
| `Separator` | COMPONENT_SET | Orientation=Horizontal, Orientation=Vertical |
| `ShadcnDesign Logo` | COMPONENT_SET | Color=Default |
| `Sidebar / AccountDropdown` | Sidebar | — |
| `Sidebar / CollapseIcon` | Sidebar | Active=No, Active=Yes, Type=Horizontal, Type=Plus Minus, Type=Up Down, Type=Vertical |
| `Sidebar / Header Button` | Sidebar | State=Default, State=Focused, State=Hover |
| `Sidebar / InboxItem` | Sidebar | State=Default, State=Hover |
| `Sidebar / MediaAsset` | Sidebar | Type=Avatar, Type=Icon |
| `Sidebar / Popover` | Sidebar | — |
| `Sidebar / PopoverMenu` | Sidebar | — |
| `Sidebar / PopoverMenuItem` | Sidebar | State=Default, State=Focused, State=Hover |
| `Sidebar / PopoverTrigger` | Sidebar | State=Default, State=Hover |
| `Sidebar / SidebarGroup` | Sidebar | Collapsed=False, Collapsed=True |
| `Sidebar / SidebarGroupAction` | Sidebar | State=Default, State=Focused, State=Hover |
| `Sidebar / SidebarGroupLabel` | Sidebar | State=Default, State=Hover, Text Size=sm, Text Size=xs, Type=Action, Type=Collapsible, Type=Default |
| `Sidebar / SidebarMenuButton` | Sidebar | Collapsed=False, Collapsed=True, State=Active, State=Default, State=Focused, State=Hover, Type=Badge, Type=Big Icon, Type=Checkbox, Type=Collapsible, Type=Dropdown, Type=Simple, Type=Tree |
| `Sidebar / SidebarMenuItem` | Sidebar | Submenu=False, Submenu=True |
| `Sidebar / SidebarMenuSub` | Sidebar | Type=Border, Type=Default, Type=Indent |
| `Sidebar / SidebarMenuSubItem` | Sidebar | State=Active, State=Default, State=Focused, State=Hover |
| `Sidebar 13.` | COMPONENT | — |
| `Sidebar 14.` | COMPONENT | — |
| `Sidebar template` | COMPONENT_SET | Collapse=False, Collapse=True |
| `Skeleton` | COMPONENT_SET | Variant=Card, Variant=Default, Variant=Text, Variant=Text 1 line |
| `Slider` | COMPONENT_SET | Range=No, Range=Yes |
| `Slider / Item` | Slider | State=Default, State=Focus, State=Hover |
| `Slot` | COMPONENT | — |
| `Social Media Icon` | COMPONENT_SET | Colors=Neutral, Colors=Original, Name=Android, Name=Apple, Name=Apple Music, Name=Apple Podcasts, Name=ArtStation, Name=Baidu, Name=Behance, Name=Boosty, Name=DevianArt, Name=Discord, Name=Dprofile, Name=Dribbble, Name=Dzen, Name=Facebook, Name=Figma, Name=Github, Name=Gmail, Name=Google, Name=Google Meet, Name=Google Play, Name=Google Podcast, Name=Imo, Name=Instagram, Name=Kickstarter, Name=Line, Name=LinkedIn, Name=Medium, Name=Messenger, Name=Microsoft Teams, Name=Notion, Name=OK, Name=OK (Only sign), Name=OnlyFans, Name=Patreon, Name=PayPal, Name=Pinterest, Name=Product Hunt, Name=Quora, Name=Reddit, Name=Signal, Name=Sina Weibo, Name=Skype, Name=Slack, Name=Snapchat, Name=SoundCloud, Name=Spotify, Name=Stack Overflow, Name=Telegram, Name=Telegram (Only sign), Name=Threads, Name=TikTok, Name=Tinder, Name=Tumblr, Name=Twitch, Name=VK, Name=VK (Only sign), Name=VK Music, Name=Viber, Name=Vimeo, Name=WeChat, Name=WhatsApp, Name=X ex Twitter, Name=Xing, Name=Yandex Music, Name=Yelp, Name=YouTube, Name=YouTube Shorts, Name=Youtube Music, Name=Zoom |
| `Sonner` | COMPONENT_SET | State=Default, State=Error, State=Error - Focus, State=Focus |
| `Sonner / Action` | Sonner | Type=Default, Type=Secondary |
| `Sonner / Icon` | Sonner | Type=Error, Type=Info, Type=Loading, Type=Success, Type=Warning |
| `Spinner` | COMPONENT_SET | Size=3, Size=4, Size=5, Size=6, Size=8, Spin Degree (for animation)=0, Spin Degree (for animation)=180, Spin Degree (for animation)=270, Spin Degree (for animation)=90 |
| `Store Badge` | COMPONENT_SET | Store=Amazon Appstore, Store=App Store, Store=AppGallery, Store=Chromebook, Store=F-Droid, Store=Galaxy Store, Store=Google Play, Store=Microsoft, Store=One Store, Style=Black, Style=Outline |
| `Suffix` | COMPONENT | — |
| `Suffix/Icon` | Suffix | — |
| `Switch` | COMPONENT_SET | Active=Off, Active=On, Control Placement=End, Control Placement=Start, State=Default, State=Disabled, State=Focus, Type=Box, Type=Default |
| `SwitchGroup` | COMPONENT | — |
| `Table` | COMPONENT_SET | Layout=Column, Layout=Grid, Layout=Row |
| `Table / Cell` | Table | Has divider=Custom slot, Has divider=False, Has divider=True, Last Cell=Hover, Last Cell=No, Last Cell=Yes, State=Active, State=Default, State=Hover, Variant=Avatar, Variant=Badge, Variant=Button, Variant=Checkbox, Variant=Custom slot, Variant=Dropdown, Variant=Image, Variant=Input, Variant=Number, Variant=Progress, Variant=Skeleton loading, Variant=Switch, Variant=Text, Variant=Toggle Group |
| `Table / Head` | Table | Align=Left, Align=Right (number), Has background=False, Has background=True, Has divider=False, Has divider=True, State=Default, State=Hover |
| `Tabs - Advance` | COMPONENT | — |
| `Tabs - Default` | COMPONENT | — |
| `Tabs / Trigger - Advance` | Tabs | Active=False, Active=True, State=Default, State=Hover |
| `Tabs / Trigger - Default` | Tabs | Active=Off, Active=On, State=Default, State=Disabled, State=Focus |
| `Textarea` | COMPONENT_SET | Filled=False, Filled=True, State=Default, State=Disabled, State=Error, State=Error (Focus), State=Focus |
| `TimePicker` | COMPONENT_SET | State=Default, State=Disabled, State=Focus, State=Hover |
| `Toggle` | COMPONENT_SET | Size=Default, Size=lg, Size=sm, State=Default, State=Disabled, State=Focus, State=Hover, State=Pressed, Variant=Default, Variant=Outline |
| `ToggleGroup` | COMPONENT_SET | Width=Fill, Width=Hug |
| `Tooltip` | COMPONENT_SET | Side=Bottom, Side=Left, Side=Right, Side=Top |
| `Typography / Blockquote` | Typography | — |
| `Typography / Code` | Typography | — |
| `Typography / H1` | Typography | Breakpoint=Desktop, Breakpoint=Mobile |
| `Typography / H2` | Typography | — |
| `Typography / H3` | Typography | — |
| `Typography / H4` | Typography | — |
| `Typography / InlineCode` | Typography | — |
| `Typography / Large` | Typography | — |
| `Typography / Lead` | Typography | — |
| `Typography / List` | Typography | — |
| `Typography / Muted` | Typography | — |
| `Typography / P` | Typography | — |
| `Typography / Rich Text` | Typography | — |
| `Typography / Small` | Typography | — |
| `Typography / Table` | Typography | — |
| `Typography / Table / Item` | Typography | Even=No, Even=Yes, Variant=Cell, Variant=Head |
| `user-star` | COMPONENT | — |
| `Video Placeholder` | COMPONENT | — |
| `With Month and Year Dropdown / Item` | With Month and Year Dropdown | Type=Month Only, Type=Month and Year, Type=Year Only |
| `With time presets / Item` | With time presets | State=Default, State=Hover, State=Selected |

_Resolve components by their exact name (ids renumber on sync)._

## Icons

_1470 icons (icon-set) — represented in bulk, not as individual components._

Sample: `Icon / AArrowDown`, `Icon / AArrowUp`, `Icon / Accessibility`, `Icon / Activity`, `Icon / Airplay`, `Icon / AirVent`, `Icon / ALargeSmall`, `Icon / AlarmClock`, `Icon / AlarmClockCheck`, `Icon / AlarmClockMinus`, `Icon / AlarmClockOff`, `Icon / AlarmClockPlus`, `Icon / AlarmSmoke`, `Icon / Album`, `Icon / AlignCenter`, `Icon / AlignCenterHorizontal`, `Icon / AlignCenterVertical`, `Icon / AlignEndHorizontal`, `Icon / AlignEndVertical`, `Icon / AlignHorizontalDistributeCenter`, … (+1450 more)

## Styles

### Text styles

- `custom/heading-lg`
- `custom/heading-md`
- `custom/heading-sm`
- `custom/heading-xl`
- `text-2xl/leading-none/black`
- `text-2xl/leading-none/bold`
- `text-2xl/leading-none/extrabold`
- `text-2xl/leading-none/extralight`
- `text-2xl/leading-none/italic`
- `text-2xl/leading-none/light`
- `text-2xl/leading-none/medium`
- `text-2xl/leading-none/normal`
- `text-2xl/leading-none/semibold`
- `text-2xl/leading-none/strikethrough`
- `text-2xl/leading-none/thin`
- `text-2xl/leading-none/underlined`
- `text-2xl/leading-normal/black`
- `text-2xl/leading-normal/bold`
- `text-2xl/leading-normal/extrabold`
- `text-2xl/leading-normal/extralight`
- `text-2xl/leading-normal/italic`
- `text-2xl/leading-normal/light`
- `text-2xl/leading-normal/medium`
- `text-2xl/leading-normal/normal`
- `text-2xl/leading-normal/semibold`
- `text-2xl/leading-normal/strikethrough`
- `text-2xl/leading-normal/thin`
- `text-2xl/leading-normal/underlined`
- `text-3xl/leading-none/black`
- `text-3xl/leading-none/bold`
- `text-3xl/leading-none/extrabold`
- `text-3xl/leading-none/extralight`
- `text-3xl/leading-none/italic`
- `text-3xl/leading-none/light`
- `text-3xl/leading-none/medium`
- `text-3xl/leading-none/normal`
- `text-3xl/leading-none/semibold`
- `text-3xl/leading-none/strikethrough`
- `text-3xl/leading-none/thin`
- `text-3xl/leading-none/underlined`
- `text-3xl/leading-normal/black`
- `text-3xl/leading-normal/bold`
- `text-3xl/leading-normal/extrabold`
- `text-3xl/leading-normal/extralight`
- `text-3xl/leading-normal/italic`
- `text-3xl/leading-normal/light`
- `text-3xl/leading-normal/medium`
- `text-3xl/leading-normal/normal`
- `text-3xl/leading-normal/semibold`
- `text-3xl/leading-normal/strikethrough`
- `text-3xl/leading-normal/thin`
- `text-3xl/leading-normal/underlined`
- `text-4xl/leading-none/black`
- `text-4xl/leading-none/bold`
- `text-4xl/leading-none/extrabold`
- `text-4xl/leading-none/extralight`
- `text-4xl/leading-none/italic`
- `text-4xl/leading-none/light`
- `text-4xl/leading-none/medium`
- `text-4xl/leading-none/normal`
- `text-4xl/leading-none/semibold`
- `text-4xl/leading-none/strikethrough`
- `text-4xl/leading-none/thin`
- `text-4xl/leading-none/underlined`
- `text-4xl/leading-normal/black`
- `text-4xl/leading-normal/bold`
- `text-4xl/leading-normal/extrabold`
- `text-4xl/leading-normal/extralight`
- `text-4xl/leading-normal/italic`
- `text-4xl/leading-normal/light`
- `text-4xl/leading-normal/medium`
- `text-4xl/leading-normal/normal`
- `text-4xl/leading-normal/semibold`
- `text-4xl/leading-normal/strikethrough`
- `text-4xl/leading-normal/thin`
- `text-4xl/leading-normal/underlined`
- `text-5xl/leading-none/black`
- `text-5xl/leading-none/bold`
- `text-5xl/leading-none/extrabold`
- `text-5xl/leading-none/extralight`
- `text-5xl/leading-none/light`
- `text-5xl/leading-none/medium`
- `text-5xl/leading-none/normal`
- `text-5xl/leading-none/semibold`
- `text-5xl/leading-none/strikethrough`
- `text-5xl/leading-none/thin`
- `text-5xl/leading-none/underlined`
- `text-5xl/leading-normal/black`
- `text-5xl/leading-normal/bold`
- `text-5xl/leading-normal/extrabold`
- `text-5xl/leading-normal/extralight`
- `text-5xl/leading-normal/italic`
- `text-5xl/leading-normal/light`
- `text-5xl/leading-normal/medium`
- `text-5xl/leading-normal/normal`
- `text-5xl/leading-normal/semibold`
- `text-5xl/leading-normal/strikethrough`
- `text-5xl/leading-normal/thin`
- `text-5xl/leading-normal/underlined`
- `text-6xl/leading-none/black`
- `text-6xl/leading-none/bold`
- `text-6xl/leading-none/extrabold`
- `text-6xl/leading-none/extralight`
- `text-6xl/leading-none/light`
- `text-6xl/leading-none/medium`
- `text-6xl/leading-none/normal`
- `text-6xl/leading-none/semibold`
- `text-6xl/leading-none/strikethrough`
- `text-6xl/leading-none/thin`
- `text-6xl/leading-none/untitled`
- `text-6xl/leading-normal/black`
- `text-6xl/leading-normal/bold`
- `text-6xl/leading-normal/extrabold`
- `text-6xl/leading-normal/extralight`
- `text-6xl/leading-normal/light`
- `text-6xl/leading-normal/medium`
- `text-6xl/leading-normal/normal`
- `text-6xl/leading-normal/semibold`
- `text-6xl/leading-normal/strikethrough`
- `text-6xl/leading-normal/thin`
- `text-6xl/leading-normal/underlined`
- `text-7xl/leading-none/black`
- `text-7xl/leading-none/bold`
- `text-7xl/leading-none/extrabold`
- `text-7xl/leading-none/extralight`
- `text-7xl/leading-none/light`
- `text-7xl/leading-none/medium`
- `text-7xl/leading-none/normal`
- `text-7xl/leading-none/semibold`
- `text-7xl/leading-none/strikethrough`
- `text-7xl/leading-none/thin`
- `text-7xl/leading-none/untitled`
- `text-7xl/leading-normal/black`
- `text-7xl/leading-normal/bold`
- `text-7xl/leading-normal/extrabold`
- `text-7xl/leading-normal/extralight`
- `text-7xl/leading-normal/light`
- `text-7xl/leading-normal/medium`
- `text-7xl/leading-normal/normal`
- `text-7xl/leading-normal/semibold`
- `text-7xl/leading-normal/strikethrough`
- `text-7xl/leading-normal/thin`
- `text-7xl/leading-normal/underlined`
- `text-8xl/leading-none/black`
- `text-8xl/leading-none/bold`
- `text-8xl/leading-none/extrabold`
- `text-8xl/leading-none/extralight`
- `text-8xl/leading-none/light`
- `text-8xl/leading-none/medium`
- `text-8xl/leading-none/normal`
- `text-8xl/leading-none/semibold`
- `text-8xl/leading-none/strikethrough`
- `text-8xl/leading-none/thin`
- `text-8xl/leading-none/underlined`
- `text-8xl/leading-normal/black`
- `text-8xl/leading-normal/bold`
- `text-8xl/leading-normal/extrabold`
- `text-8xl/leading-normal/extralight`
- `text-8xl/leading-normal/light`
- `text-8xl/leading-normal/medium`
- `text-8xl/leading-normal/normal`
- `text-8xl/leading-normal/semibold`
- `text-8xl/leading-normal/strikethrough`
- `text-8xl/leading-normal/thin`
- `text-8xl/leading-normal/underlined`
- `text-9xl/leading-none/black`
- `text-9xl/leading-none/bold`
- `text-9xl/leading-none/extrabold`
- `text-9xl/leading-none/extralight`
- `text-9xl/leading-none/light`
- `text-9xl/leading-none/medium`
- `text-9xl/leading-none/normal`
- `text-9xl/leading-none/semibold`
- `text-9xl/leading-none/strikethrough`
- `text-9xl/leading-none/thin`
- `text-9xl/leading-none/underlined`
- `text-9xl/leading-normal/black`
- `text-9xl/leading-normal/bold`
- `text-9xl/leading-normal/extrabold`
- `text-9xl/leading-normal/extralight`
- `text-9xl/leading-normal/light`
- `text-9xl/leading-normal/medium`
- `text-9xl/leading-normal/normal`
- `text-9xl/leading-normal/semibold`
- `text-9xl/leading-normal/strikethrough`
- `text-9xl/leading-normal/thin`
- `text-9xl/leading-normal/underlined`
- `text-base/leading-none/black`
- `text-base/leading-none/bold`
- `text-base/leading-none/extrabold`
- `text-base/leading-none/extralight`
- `text-base/leading-none/italic`
- `text-base/leading-none/light`
- `text-base/leading-none/medium`
- `text-base/leading-none/normal`
- `text-base/leading-none/semibold`
- `text-base/leading-none/strikethrough`
- `text-base/leading-none/thin`
- `text-base/leading-none/underlined`
- `text-base/leading-normal/black`
- `text-base/leading-normal/bold`
- `text-base/leading-normal/extrabold`
- `text-base/leading-normal/extralight`
- `text-base/leading-normal/italic`
- `text-base/leading-normal/light`
- `text-base/leading-normal/medium`
- `text-base/leading-normal/normal`
- `text-base/leading-normal/semibold`
- `text-base/leading-normal/strikethrough`
- `text-base/leading-normal/thin`
- `text-base/leading-normal/underlined`
- `text-base/leading-normal/underlined (medium)`
- `text-lg/leading-none/black`
- `text-lg/leading-none/bold`
- `text-lg/leading-none/extrabold`
- `text-lg/leading-none/extralight`
- `text-lg/leading-none/italic`
- `text-lg/leading-none/light`
- `text-lg/leading-none/medium`
- `text-lg/leading-none/normal`
- `text-lg/leading-none/semibold`
- `text-lg/leading-none/strikethrough`
- `text-lg/leading-none/thin`
- `text-lg/leading-none/underlined`
- `text-lg/leading-normal/black`
- `text-lg/leading-normal/bold`
- `text-lg/leading-normal/extrabold`
- `text-lg/leading-normal/extralight`
- `text-lg/leading-normal/italic`
- `text-lg/leading-normal/light`
- `text-lg/leading-normal/medium`
- `text-lg/leading-normal/normal`
- `text-lg/leading-normal/semibold`
- `text-lg/leading-normal/strikethrough`
- `text-lg/leading-normal/thin`
- `text-lg/leading-normal/underlined`
- `text-sm/leading-none/black`
- `text-sm/leading-none/bold`
- `text-sm/leading-none/extrabold`
- `text-sm/leading-none/extralight`
- `text-sm/leading-none/italic`
- `text-sm/leading-none/light`
- `text-sm/leading-none/medium`
- `text-sm/leading-none/normal`
- `text-sm/leading-none/semibold`
- `text-sm/leading-none/strikethrough`
- `text-sm/leading-none/thin`
- `text-sm/leading-none/underlined`
- `text-sm/leading-normal/black`
- `text-sm/leading-normal/bold`
- `text-sm/leading-normal/extrabold`
- `text-sm/leading-normal/extralight`
- `text-sm/leading-normal/italic`
- `text-sm/leading-normal/light`
- `text-sm/leading-normal/medium`
- `text-sm/leading-normal/normal`
- `text-sm/leading-normal/semibold`
- `text-sm/leading-normal/strikethrough`
- `text-sm/leading-normal/thin`
- `text-sm/leading-normal/underlined`
- `text-sm/leading-normal/underlined (medium)`
- `text-xl/leading-none/black`
- `text-xl/leading-none/bold`
- `text-xl/leading-none/extrabold`
- `text-xl/leading-none/extralight`
- `text-xl/leading-none/italic`
- `text-xl/leading-none/light`
- `text-xl/leading-none/medium`
- `text-xl/leading-none/normal`
- `text-xl/leading-none/semibold`
- `text-xl/leading-none/strikethrough`
- `text-xl/leading-none/thin`
- `text-xl/leading-none/underlined`
- `text-xl/leading-normal/black`
- `text-xl/leading-normal/bold`
- `text-xl/leading-normal/extrabold`
- `text-xl/leading-normal/extralight`
- `text-xl/leading-normal/italic`
- `text-xl/leading-normal/light`
- `text-xl/leading-normal/medium`
- `text-xl/leading-normal/normal`
- `text-xl/leading-normal/semibold`
- `text-xl/leading-normal/strikethrough`
- `text-xl/leading-normal/thin`
- `text-xl/leading-normal/underlined`
- `text-xs/leading-none/black`
- `text-xs/leading-none/bold`
- `text-xs/leading-none/extrabold`
- `text-xs/leading-none/extralight`
- `text-xs/leading-none/italic`
- `text-xs/leading-none/light`
- `text-xs/leading-none/medium`
- `text-xs/leading-none/normal`
- `text-xs/leading-none/semibold`
- `text-xs/leading-none/strikethrough`
- `text-xs/leading-none/thin`
- `text-xs/leading-none/underlined`
- `text-xs/leading-normal/black`
- `text-xs/leading-normal/bold`
- `text-xs/leading-normal/extrabold`
- `text-xs/leading-normal/extralight`
- `text-xs/leading-normal/italic`
- `text-xs/leading-normal/light`
- `text-xs/leading-normal/medium`
- `text-xs/leading-normal/normal`
- `text-xs/leading-normal/semibold`
- `text-xs/leading-normal/strikethrough`
- `text-xs/leading-normal/thin`
- `text-xs/leading-normal/underlined`
- `text-xs/leading-normal/underlined (medium)`

### Effect styles

- `backdrop-blur/2xl`
- `backdrop-blur/3xl`
- `backdrop-blur/lg`
- `backdrop-blur/md`
- `backdrop-blur/none`
- `backdrop-blur/sm`
- `backdrop-blur/xl`
- `backdrop-blur/xs`
- `blur/2xl`
- `blur/3xl`
- `blur/lg`
- `blur/md`
- `blur/none`
- `blur/sm`
- `blur/xl`
- `blur/xs`
- `drop-shadow/2xl`
- `drop-shadow/lg`
- `drop-shadow/md`
- `drop-shadow/sm`
- `drop-shadow/xl`
- `drop-shadow/xs`
- `focus/default`
- `focus/destructive`
- `inset-shadow/2xs`
- `inset-shadow/sm`
- `inset-shadow/xs`
- `shadow/2xl`
- `shadow/2xs`
- `shadow/lg`
- `shadow/md`
- `shadow/sm`
- `shadow/xl`
- `shadow/xs`

### Paint styles

- `Graphic - Placeholder/App icon`
- `Graphic - Placeholder/Image`
- `Graphic - Placeholder/Video`

