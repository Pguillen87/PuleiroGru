import { PuleiroExperience } from "@/components/PuleiroExperience";
import { publicGenerationConfig } from "@/lib/mascot-generation/config";

export default function CreateMascotPage() {
  return <PuleiroExperience config={publicGenerationConfig()} />;
}
