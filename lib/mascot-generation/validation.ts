import "server-only";
import { createHash } from "node:crypto";
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

export async function validateAndSanitizeImage(
  file: File,
  maxUploadBytes: number,
  maxDimension = 4096,
): Promise<{ bytes: Uint8Array; contentType: AcceptedImageType; sha256: string }> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    throw new ImageValidationError("Envie uma imagem JPEG, PNG ou WebP.", "INVALID_TYPE");
  }
  if (file.size === 0 || file.size > maxUploadBytes) {
    throw new ImageValidationError(
      `A imagem deve ter até ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.`,
      "FILE_TOO_LARGE",
    );
  }

  try {
    const input = new Uint8Array(await file.arrayBuffer());
    const metadata = await sharp(input, { failOn: "error" }).metadata();
    const decodedType = metadata.format ? MIME_BY_FORMAT[metadata.format] : undefined;
    if (!decodedType || decodedType !== file.type || !metadata.width || !metadata.height) {
      throw new Error("Formato declarado não corresponde ao conteúdo.");
    }
    if (metadata.width < 256 || metadata.height < 256) throw new Error("Imagem pequena demais.");

    let pipeline = sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
    if (decodedType === "image/jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    if (decodedType === "image/png") pipeline = pipeline.png({ compressionLevel: 9 });
    if (decodedType === "image/webp") pipeline = pipeline.webp({ quality: 90 });

    const output = await pipeline.toBuffer();
    const cleanMetadata = await sharp(output).metadata();
    if (cleanMetadata.exif || cleanMetadata.xmp || cleanMetadata.iptc) {
      throw new Error("Metadados privados permaneceram após sanitização.");
    }
    return {
      bytes: new Uint8Array(output),
      contentType: decodedType,
      sha256: createHash("sha256").update(output).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError(
      "Não foi possível ler esta imagem. Use uma foto válida com pelo menos 256 pixels.",
      "INVALID_IMAGE",
    );
  }
}
