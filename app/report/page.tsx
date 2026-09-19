import type { Metadata } from "next";
import type { ParkWithStatus } from "@/lib/types";
import { getParksWithStatus } from "@/lib/queries";
import { ReportParkPicker } from "@/components/report/ReportParkPicker";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Report conditions",
  description: "Tell others what you found at the gate — one tap, no account.",
};

export default async function ReportPage() {
  let parks: ParkWithStatus[] = [];
  try {
    parks = await getParksWithStatus();
  } catch {
    parks = [];
  }
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-[calc(env(safe-area-inset-top)+12px)]">
      <h1 className="text-2xl font-extrabold text-cocoa">Report conditions</h1>
      <p className="mt-1 text-sm text-mocha">Pick the park you&apos;re at. One tap is enough — reports fade after about two hours.</p>
      <div className="mt-4">
        <ReportParkPicker parks={parks} />
      </div>
    </div>
  );
}
