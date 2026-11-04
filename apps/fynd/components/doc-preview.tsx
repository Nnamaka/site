"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocument } from "@/lib/queries";

export const downloadUrl = (jobId: string, docId: string) => `/api/jobs/${jobId}/documents/${docId}?download`;

export function DocPreview({ jobId, docId, onClose }: { jobId: string; docId: string | null; onClose: () => void }) {
  const { data, isPending } = useDocument(jobId, docId);
  return (
    <Dialog open={Boolean(docId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{data?.fileName ?? "Document"}</DialogTitle>
          <DialogDescription>{data?.atsScore != null ? `ATS ${data.atsScore}` : "Tailored for this job"}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/40 p-4">
          {isPending ? <Skeleton className="h-40 w-full" /> : <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">{data?.content}</pre>}
        </div>
        {docId ? (
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <a href={downloadUrl(jobId, docId)} className="no-underline">
                <Download />
                Download
              </a>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
