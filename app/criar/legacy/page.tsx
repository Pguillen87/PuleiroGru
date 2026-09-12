import { PuleiroExperience } from "@/components/PuleiroExperience";
import { publicGenerationConfig } from "@/lib/mascot-generation/config";

export const dynamic = "force-dynamic";

/**
 * Compatibility entry point for records created by the original manual flow.
 * New creation always starts at /criar and uses the asynchronous incubator.
 */
export default function LegacyCreateMascotPage() {
  return <PuleiroExperience config={publicGenerationConfig()} mode="legacy" />;
}
