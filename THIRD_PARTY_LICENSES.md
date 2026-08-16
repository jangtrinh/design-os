# Third-party licenses

ease-design is MIT-licensed (see [`LICENSE`](LICENSE)). It vendors content from the
following third-party sources, redistributed under their respective licenses.

## diagram-design

- **License:** MIT
- **Copyright:** (c) 2025 Cathryn Lavery
- **Upstream:** https://github.com/cathrynlavery/diagram-design
- **Fork:** https://github.com/jangtrinh/diagram-design
- **Pinned commit:** `09df49d8d1a1c7fb2efdfcdc7a2a0713534350a6`
- **Used in:** diagram and chart grammar craft in `knowledge/diagram-grammars/`,
  `knowledge/chart-grammars/`, `knowledge/diagram-icons.md`, the diagram scaffolds, and
  the drawio/Mermaid extract scripts.

Vendored material was rewritten to bind to the active Design OS design system (DTCG
tokens, no network dependencies). Layout geometry, connector grammar, and density rules
derive from the upstream references.

```
MIT License

Copyright (c) 2025 Cathryn Lavery

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Icon sources

The icon set in `knowledge/diagram-icons.md` bundles icons from the following sources.
All icons are normalised to inherit `currentColor` so they take their color from the
active design system.

### Tabler Icons

- **License:** MIT
- **Upstream:** https://github.com/tabler/tabler-icons
- **Used in:** stroked icons (Compute, People, Network, Data, Kubernetes, Action, DevOps
  categories, plus stroked brand outlines for Docker, Terraform, AWS, Azure, GitHub).

The MIT license is reproduced in full at
https://github.com/tabler/tabler-icons/blob/main/LICENSE.

### Simple Icons

- **License:** CC0 1.0 Universal (Public Domain Dedication)
- **Upstream:** https://github.com/simple-icons/simple-icons
- **Used in:** filled brand silhouettes (Kubernetes, Google Cloud, PostgreSQL, Nginx,
  Gitea, Keycloak, MinIO, Apache NiFi, Apache Airflow, Trino, Apache Superset, Jupyter,
  Python, R).

The CC0 dedication is reproduced in full at
https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md.

### log-z/logos

- **License:** MIT
- **Upstream:** https://github.com/log-z/logos/tree/main/website-logos
- **Used in:** filled brand silhouettes not carried by Simple Icons or Tabler — MySQL,
  Redis, StarRocks. Source SVGs have their `<style>` block stripped and class references
  rewritten to `currentColor` for monochrome consistency.

The MIT license is reproduced in full at https://github.com/log-z/logos/blob/main/LICENSE.

### Devicon

- **License:** MIT
- **Upstream:** https://github.com/devicons/devicon
- **Used in:** RStudio icon.

The MIT license is reproduced in full at
https://github.com/devicons/devicon/blob/master/LICENSE.

### One-off sourced icons

- **SAS** — [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:SAS_logo_horiz.svg),
  public domain. Retained; the public-domain dedication is a clear grant.
- **Stata** — **not vendored.** Upstream sourced it from the IcePanel Technology Icons
  collection via techicons.dev. That collection publishes no license grant we could
  verify (the referenced repository returns HTTP 404), so the icon is excluded from this
  vendoring rather than redistributed without an establishable grant. Diagrams needing a
  Stata mark should supply it locally.

## Trademarks

Brand logos remain the trademarks of their respective owners. Their inclusion in this
icon set is for documentation and illustrative use only. The presence of a brand mark in
this repository does not imply endorsement, sponsorship, or affiliation.
