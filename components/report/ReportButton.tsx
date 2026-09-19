"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import type { Park, Report } from "@/lib/types";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { ReportSheet } from "./ReportSheet";

export interface ReportButtonProps {
  park: Park;
  variant?: ButtonVariant;
  full?: boolean;
  size?: "md" | "lg";
  className?: string;
  label?: string;
  onSubmitted?: (report: Report) => void;
}

export function ReportButton({ park, variant = "primary", full, size = "lg", className, label = "Make a report", onSubmitted }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button type="button" variant={variant} size={size} full={full} className={className} onClick={() => setOpen(true)}>
        <MessageSquarePlus aria-hidden="true" focusable="false" className="mr-1 h-5 w-5" />
        {label}
      </Button>
      <ReportSheet
        park={park}
        open={open}
        onOpenChange={setOpen}
        onSubmitted={(r) => {
          onSubmitted?.(r);
          router.refresh();
        }}
      />
    </>
  );
}
