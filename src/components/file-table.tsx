"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Trash2, FileText } from "lucide-react";

export interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  sizeDisplay: string;
  googleEmail: string;
  uploadedAt: string;
}

export function FileTable({ files }: { files: FileRow[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);

  if (files.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          No files yet. Drop a file into the upload area above to get started.
        </CardContent>
      </Card>
    );
  }

  async function remove(id: string) {
    if (!confirm("Delete this file? It will also be removed from your Google Drive.")) return;
    setDeleting(id);
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    setDeleting(null);
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 px-4 font-medium">Name</th>
                <th className="py-2 px-4 font-medium hidden sm:table-cell">Account</th>
                <th className="py-2 px-4 font-medium hidden md:table-cell">Uploaded</th>
                <th className="py-2 px-4 font-medium text-right">Size</th>
                <th className="py-2 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="py-2 px-4 max-w-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate" title={f.name}>{f.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground hidden sm:table-cell">
                    {f.googleEmail}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground hidden md:table-cell">
                    {new Date(f.uploadedAt).toLocaleString()}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums">{f.sizeDisplay}</td>
                  <td className="py-2 px-4 text-right">
                    <div className="inline-flex gap-1">
                      <a
                        href={`/api/files/${f.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="icon" variant="ghost" aria-label="Download">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(f.id)}
                        disabled={deleting === f.id}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
