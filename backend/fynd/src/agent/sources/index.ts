import type { SourceKind } from "@prisma/client";
import { ashby } from "./ashby";
import { careerPage } from "./career-page";
import { greenhouse } from "./greenhouse";
import { lever } from "./lever";
import { remoteok } from "./remoteok";
import type { SourceAdapter } from "./types";

/** Add a source: implement SourceAdapter, add the enum value in schema.prisma, register it here. */
export const adapters: Record<SourceKind, SourceAdapter> = {
  GREENHOUSE: greenhouse,
  LEVER: lever,
  ASHBY: ashby,
  REMOTEOK: remoteok,
  CAREER_PAGE: careerPage,
};

export * from "./types";
