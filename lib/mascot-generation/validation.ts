import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ACCEPTED_IMAGE_TYPES, MIN_IMAGE_DIMENSION, type AcceptedImageType } from "./types";

const MIME_BY_FORMAT: Record<string, AcceptedImageType | undefined> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_TYPE"
      | "FILE_TOO_LARGE"
      | "IMAGE_TOO_SMALL"
      | "IMAGE_FORMAT_MISMATCH"
      | "IMAGE_DECODE_FAILED",
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
      throw new ImageValidationError("O tipo da foto não corresponde ao arquivo enviado. Escolha a imagem novamente.", "IMAGE_FORMAT_MISMATCH");
    }
    if (metadata.width < MIN_IMAGE_DIMENSION || metadata.height < MIN_IMAGE_DIMENSION) {
      throw new ImageValidationError(
        `Esta foto é pequena para criar um mascote. Escolha uma imagem com pelo menos ${MIN_IMAGE_DIMENSION} × ${MIN_IMAGE_DIMENSION} pixels.`,
        "IMAGE_TOO_SMALL",
      );
    }

    let pipeline = sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
    if (decodedType === "image/jpeg") pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    if (decodedType === "image/png") pipeline = pipeline.png({ compressionLevel: 9 });
    if (decodedType === "image/webp") pipeline = pipeline.webp({ quality: 90 });

    const output = await pipeline.toBuffer();
    const cleanMetadata = await sharp(output).metadata();
    if (cleanMetadata.exif || cleanMetadata.xmp || cleanMetadata.iptc) {
      throw new ImageValidationError("Não foi possível preparar esta foto com segurança. Escolha outra imagem.", "IMAGE_DECODE_FAILED");
    }
    return {
      bytes: new Uint8Array(output),
      contentType: decodedType,
      sha256: createHash("sha256").update(output).digest("hex"),
    };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError(
      "Não foi possível abrir esta imagem. Escolha uma foto JPEG, PNG ou WebP válida.",
      "IMAGE_DECODE_FAILED",
    );
  }
}
