import { PuleiroExperience } from "@/components/PuleiroExperience";
import { publicGenerationConfig } from "@/lib/mascot-generation/config";

// The creation gate and the BFF must read the same runtime configuration.
// Rendering this page dynamically prevents a stale build-time flag from
// letting an anonymous visitor reach a server route that requires a session.
export const dynamic = "force-dynamic";

export default function CreateMascotPage() {
  return <PuleiroExperience config={publicGenerationConfig()} />;
}
