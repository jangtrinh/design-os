/**
 * Fixed heading/label table for rendered rulings. Only these strings are ever
 * translated; ruling text, ids, categories and sources are English source data
 * and pass through untouched in every language.
 */
export const RULINGS_LANGS = ["en", "vi"] as const;
export type RulingsLang = (typeof RULINGS_LANGS)[number];

export interface RulingsLabels {
  title: string;
  generated: string;
  counts: (rulings: number, categories: number) => string;
  scope: string;
  global: string;
  apps: string;
  features: string;
  screens: string;
  since: string;
  verifiedBy: string;
  verifiedAt: string;
  status: string;
  source: string;
  approvedBy: string;
  principle: string;
  supersedes: string;
  supersededBy: string;
  conflictsWith: string;
}

export const RULINGS_LABELS: Record<RulingsLang, RulingsLabels> = {
  en: {
    title: "Rulings",
    generated: "Generated from the English rulings file. Do not edit by hand.",
    counts: (n, c) => `${n} rulings in ${c} categories`,
    scope: "scope", global: "global", apps: "apps", features: "features", screens: "screens",
    since: "since", verifiedBy: "verified by", verifiedAt: "verified at", status: "status",
    source: "source", approvedBy: "approved by", principle: "principle",
    supersedes: "supersedes", supersededBy: "superseded by", conflictsWith: "conflicts with",
  },
  vi: {
    title: "Quy tắc thiết kế",
    generated: "Sinh tự động từ tệp rulings tiếng Anh. Không sửa tay.",
    counts: (n, c) => `${n} quy tắc trong ${c} nhóm`,
    scope: "phạm vi", global: "toàn cục", apps: "ứng dụng", features: "tính năng", screens: "màn hình",
    since: "từ ngày", verifiedBy: "kiểm bởi", verifiedAt: "kiểm lúc", status: "trạng thái",
    source: "nguồn", approvedBy: "duyệt bởi", principle: "nguyên tắc",
    supersedes: "thay thế", supersededBy: "bị thay bởi", conflictsWith: "xung đột với",
  },
};
