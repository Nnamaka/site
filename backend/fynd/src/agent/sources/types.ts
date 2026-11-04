import type { Document, Job, SourceKind } from "@prisma/client";

/** A job as read from a source, before matching. */
export type RawJob = {
  externalId: string;
  url: string;
  title: string;
  company: string;
  location?: string;
  salary?: string;
  description: string;
  postedAt?: Date;
};

export interface SourceAdapter {
  kind: SourceKind;
  /** Read open postings. Throw ExtractError when the source can't be read; the source is then marked failing. */
  fetchJobs(config: unknown, ctx: { queries: string[] }): Promise<RawJob[]>;
  /** Optional: submit an application. Leave undefined when the source has no supported apply path. */
  apply?(job: Job, documents: Document[]): Promise<void>;
}

export class ExtractError extends Error {}
export class ApplyError extends Error {}
