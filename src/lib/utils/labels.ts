import type { WorkModality } from "@prisma/client";

export const WORK_MODALITY_LABEL: Record<WorkModality, string> = {
  ON_SITE: "On-site",
  WORK_FROM_HOME: "Work from home",
  HYBRID: "Hybrid",
};
