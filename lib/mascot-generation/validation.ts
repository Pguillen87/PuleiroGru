import "server-only";
import sharp from "sharp";
import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType } from "./types";

const MIME_BY_FORMAT: Record<string, AcceptedImageType | undefined> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_TYPE" | "FILE_TOO_LARGE" | "INVALID_IMAGE",
  ) {
    super(message);
  }
}

export async function validateImage(
  file: File,
  maxUploadBytes: number,
): Promise<{ bytes: Uint8Array; contentType: AcceptedImageType }> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    throw new ImageValidationError("Envie uma imagem JPEG, PNG ou WebP.", "INVALID_TYPE");
  }
  if (file.size === 0 || file.size > maxUploadBytes) {
    throw new ImageValidationError(
      `A imagem deve ter até ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.`,
      "FILE_TOO_LARGE",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const decoder = sharp(bytes, { failOn: "error" });
    const metadata = await decoder.metadata();
    const decodedType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
    if (!decodedType || decodedType !== file.type || !metadata.width || !metadata.height) {
      throw new Error("Formato declarado não corresponde ao conteúdo.");
    }
    if (metadata.width < 256 || metadata.height < 256 || metadata.width > 4096 || metadata.height > 4096) {
      throw new Error("Dimensões fora do intervalo aceito.");
    }
    await decoder.stats();
    return { bytes, contentType: decodedType };
  } catch {
    throw new ImageValidationError(
      "Não foi possível ler esta imagem. Use uma foto válida entre 256 e 4096 pixels.",
      "INVALID_IMAGE",
    );
  }
}
