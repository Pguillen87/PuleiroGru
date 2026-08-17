import { ACCEPTED_IMAGE_TYPES, type AcceptedImageType } from "./types";

const CLIENT_MAX_DIMENSION = 4096;
const JPEG_QUALITY = 0.86;
const MAX_COMPRESSION_PASSES = 8;

export class PhotoPreparationError extends Error {}

export async function preparePhotoForUpload(file: File, maxUploadBytes: number) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as AcceptedImageType)) {
    throw new PhotoPreparationError("Escolha uma imagem JPEG, PNG ou WebP.");
  }
  const image = await loadImage(file);
  if (file.size <= maxUploadBytes) return file;
  return compressPhoto(image, maxUploadBytes);
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoPreparationError("Não foi possível abrir esta imagem. Escolha uma foto JPEG, PNG ou WebP válida."));
    };
    image.src = url;
  });
}

async function compressPhoto(image: HTMLImageElement, maxUploadBytes: number) {
  let scale = Math.min(1, CLIENT_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  for (let pass = 0; pass < MAX_COMPRESSION_PASSES; pass += 1) {
    const blob = await renderJpeg(image, scale);
    if (blob.size <= maxUploadBytes) {
      return new File([blob], "foto-preparada.jpg", { type: "image/jpeg", lastModified: Date.now() });
    }
    scale *= 0.75;
  }
  throw new PhotoPreparationError("Não foi possível preparar esta foto. Escolha outra imagem.");
}

async function renderJpeg(image: HTMLImageElement, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoPreparationError("Não foi possível preparar esta foto neste navegador.");
  context.fillStyle = "#f7f3e9";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new PhotoPreparationError("Não foi possível converter esta foto.")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
