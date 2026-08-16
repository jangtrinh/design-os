---
id: domain-pack-lakehouse
description: Concrete component vocabulary for open-source lakehouse and data-platform diagrams — which real products fill each abstract role in the platform grammars, and the worked shapes those grammars typically take on this stack.
when:
  - lakehouse-stack-vocabulary
  - data-platform-component-names
---

# Domain pack: lakehouse

A vocabulary, not a grammar. The four platform grammars — `knowledge/diagram-grammars/high-level.md`, `dp-integration.md`, `medallion.md`, `it-state.md` — are written in abstract roles ("the storage hub", "the federation engine") and are fully usable without this file. Read it only when the subject is an open-source lakehouse stack and you want the concrete names, or want to check that a real product is being placed in the right role.

Nothing here overrides a grammar rule. A product named below still obeys its grammar's focal count, connector routing, density budget, and token contract.

## Role → product map

| Abstract role in the grammars | Products that typically fill it |
|---|---|
| Ingest tool | Apache NiFi, Airbyte, Kafka Connect, Fivetran, Logstash |
| Storage hub | MinIO, Amazon S3, Ceph, Azure Data Lake Storage, Google Cloud Storage |
| Table format on the hub | Apache Iceberg, Delta Lake, Apache Hudi |
| Federation engine | Trino, Dremio, Presto, Starburst, DuckDB (single-node) |
| Notebook / analysis surface | JupyterHub, JupyterLab, Zeppelin, RStudio Server, Databricks notebooks |
| Presentation surface | Apache Superset, Metabase, Grafana, Tableau, Power BI |
| Scheduler | Apache Airflow, Dagster, Prefect, Argo Workflows |
| Identity provider | Keycloak, Active Directory / LDAP, Okta, Auth0, any OIDC provider |
| Observability stack | Prometheus + Grafana, Loki, OpenTelemetry, Datadog |
| Governance / lineage | OpenMetadata, DataHub, Apache Atlas |
| Secrets / policy | HashiCorp Vault, Sealed Secrets, External Secrets, OPA |
| Backup / DR | Velero, Restic, storage-native snapshot lifecycle |
| Deployment substrate | Kubernetes, Amazon ECS, HashiCorp Nomad |

Legacy estate systems that show up on the "before" side: SQL Server, PostgreSQL, Oracle, Windows file shares, SFTP drops, IMAP mailboxes, mainframe file exports, SPSS / SAS / Stata analyst workstations, hand-maintained ASP.NET portals.

## For `high-level.md`

Typical phase banner on this stack: **Data sources → Ingestion → Storage → Transformation → Visualization**, with vertical concern chevrons for **Orchestration**, **Security**, and **Observability**.

- Ingestion phase: the ingest tool (NiFi).
- Storage phase: the storage hub (MinIO) — this is normally the single focal node — plus the federation engine (Trino) reading from it.
- Transformation phase: the notebook surface (JupyterHub).
- Visualization phase: the presentation surface (Superset).
- Orchestration bar inside the deployment boundary: the scheduler (Airflow), dropping dashed triggers into ingest, federation, and notebooks.
- Cross-cutting bars below the boundary, one per concern chevron: **Identity** (Keycloak · LDAP · OIDC), **Monitoring** (Prometheus · Grafana · Loki), optionally **Backup** (Velero) or **Governance** (OpenMetadata).
- External dashed source zone: relational databases, SFTP drops, web forms, legacy exports — four is the cap.
- Deployment boundary label: Kubernetes (or the substrate actually in use).

## For `dp-integration.md`

The two focal components on this stack are the **storage hub (MinIO)** and the **federation engine (Trino)**. Everything else in the zone — NiFi, JupyterLab, Airflow — stays neutral.

- Zone label: `DATA PLATFORM`.
- Zone rows, top to bottom: Trino as a focal bar; a row of NiFi · MinIO · JupyterLab; Airflow as a trigger bar.
- Sources with their wire labels: relational databases (`JDBC`, and `FEDERATE` where Trino queries them directly), SFTP drops (`SFTP`), mailbox pulls (`IMAP`), mainframe exports (`FILE`).
- Consumers with their wire labels: desktop statistics tools — SPSS · SAS · Stata (`ODBC`); BI and reporting — Tableau · Power BI (`JDBC`); a public website (`HTTPS`); an API gateway (`REST`). Every one of these edges is accent, per the serve-flow rule.
- Footer bars: Active Directory / Keycloak (`LDAP · SSO · group RBAC`), then Observability (Prometheus · Grafana · Loki). Their arrows land on the zone's bottom edge labelled `AUTH` — never on Airflow, never on MinIO.

## For `medallion.md`

The canonical five-tier shape on this stack, left to right, with the storage hub holding every bucket and the federation engine doing most of the promoting:

| Tier | Bucket | Tool | Format | Writer |
|---|---|---|---|---|
| Raw | `raw-bucket` | NiFi raw write | CSV · Parquet · JSON | Data Engineer |
| Anonymized | `anon-bucket` | Trino `INSERT` | Iceberg · partitioned | Data Engineer |
| Staging | `staging-bucket` | Trino · JupyterHub | Iceberg · cleaned | Data Scientist |
| Aggregated | `aggregated-bucket` | Trino `INSERT` · SAS JDBC | Iceberg · indicators | Data Scientist |
| Archive | `archive-bucket` | MinIO lifecycle | cold tier · immutable | Data Administrator |

Aggregated is the focal tier — it is what downstream consumers query. Promotions: `PII REMOVE`, `CLEAN+WEIGHT`, `AGGREGATE` (accent, landing focal), `LIFECYCLE` (dashed, into archive).

Path cards describe the two write methods this stack offers: the **SQL path** (`Trino INSERT INTO … SELECT` — set-based filter, reshape, join, aggregate) and the **notebook path** (DuckDB with Python/R in JupyterHub — stats, ML, row-iterative work).

## For `it-state.md`

The pre-platform estate these proposals replace, in three zones:

- **COLLECTION** — a CAPI survey tool on PostgreSQL, hand-maintained ASP.NET portals, an external civil registry.
- **PROCESSING** — a Windows shared drive with no version control (the classic focal bottleneck), analyst machines running SPSS · SAS · Stata · Excel, an on-premises SQL Server that often survives the migration and so earns the "survivor" tint.
- **DISSEMINATION** — a legacy publishing portal that is a manual bottleneck (second focal), a static public website, ministry partners consuming downloads.

Hand-off labels are the real transports and should stay unflattering: `CSV`, `EMAIL`, `EXCEL`, `COPY`, `LOAD`, `WEB`, `CSV DL`. Footer bars, when shown: Identity Manager (Active Directory · LDAP · SSO) and Observability (logs · metrics · alerts).

## Naming discipline

Name the product, not the category, when the brief names it — "Trino", not "query engine" — and put the category in the sub-label. Where the brief is vendor-neutral, keep the grammar's abstract role wording and do not import a product name from this file to fill a gap. Products change; a diagram that invents one is wrong the day it ships.
