import "server-only";
import { generationConfig } from "./config";
import { MockMascotGenerationProvider } from "./mock-provider";
import { ModalMascotGenerationProvider } from "./modal-provider";
import type { MascotGenerationProvider } from "./types";

let provider: MascotGenerationProvider | undefined;

export function getMascotGenerationProvider(): MascotGenerationProvider {
  if (provider) return provider;
  if (generationConfig.provider === "mock") provider = new MockMascotGenerationProvider();
  else if (generationConfig.provider === "modal") provider = new ModalMascotGenerationProvider();
  else throw new Error(`Provider desconhecido: ${generationConfig.provider}`);
  return provider;
}
