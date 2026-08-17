import { AccountGate } from "@/components/auth/AccountGate";
import { PersonalMascotLibrary } from "@/components/library/PersonalMascotLibrary";

export default function MyMascotsPage() {
  return <AccountGate required><PersonalMascotLibrary /></AccountGate>;
}
