import { AccountGate } from "@/components/auth/AccountGate";
import { IncubationJournal } from "@/components/incubator/IncubationJournal";

export const dynamic = "force-dynamic";

export default async function IncubationJournalPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <AccountGate required><IncubationJournal jobId={jobId} /></AccountGate>;
}
