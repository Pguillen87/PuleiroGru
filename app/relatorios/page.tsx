import { AccountGate } from "@/components/auth/AccountGate";
import { GenerationReport } from "@/components/reports/GenerationReport";

export default function ReportsPage() {
  return <AccountGate required><GenerationReport /></AccountGate>;
}
