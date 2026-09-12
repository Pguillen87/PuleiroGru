import { AccountGate } from "@/components/auth/AccountGate";
import { IncubatorList } from "@/components/incubator/IncubatorList";

export const dynamic = "force-dynamic";

export default function IncubatorPage() {
  return <AccountGate required><IncubatorList /></AccountGate>;
}
