import { PuleiroExperience } from "@/components/PuleiroExperience";
import { publicGenerationConfig } from "@/lib/mascot-generation/config";

export default function Home() {
  return <PuleiroExperience config={publicGenerationConfig()} />;
}
