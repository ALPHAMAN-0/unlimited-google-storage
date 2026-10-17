"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Cloud, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface PendingUpload {
  id: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  message?: string;
  account?: string;
}

export function UploadDropzone() {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);

  const onDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setUploads((prev) => [...prev, { id, name: file.name, size: file.size, status: "uploading" }]);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, status: "error", message: body.error || `HTTP ${res.status}` } : u
            )
          );
          continue;
        }
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "done", account: body.googleEmail } : u
          )
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "error", message: (err as Error).message } : u
          )
        );
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <div
            {...getRootProps()}
            className="flex flex-col items-center justify-center px-6 py-12 border-2 border-dashed border-input rounded-lg cursor-pointer hover:bg-accent/40 transition-colors"
          >
            <input {...getInputProps()} />
            <Cloud className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">
              {isDragActive ? "Drop the files here…" : "Drag & drop files here, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Files are routed to the linked account with the most free space.
            </p>
          </div>
        </CardContent>
      </Card>

      {uploads.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            {uploads.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 py-1 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {u.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  {u.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {u.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  <span className="truncate" title={u.name}>{u.name}</span>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {u.status === "uploading" && "Uploading…"}
                  {u.status === "done" && u.account && `→ ${u.account}`}
                  {u.status === "error" && (u.message || "Failed")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
