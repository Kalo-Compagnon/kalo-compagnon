import { supabase } from "./persistence";
import {
  validateReply,
  type KermitRequest,
  type Reply,
} from "../supabase/functions/_shared/kermit";
export async function askKermit(
  input: KermitRequest,
  signal: AbortSignal,
): Promise<Reply> {
  if (!navigator.onLine)
    throw new Error("Pas de connexion Internet. Réessaie une fois reconnecté.");
  if (!supabase) throw new Error("Connecte-toi pour utiliser Kermit.");
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Connecte-toi pour utiliser Kermit.");
  const { data: reply, error } = await supabase.functions.invoke("kermit", {
    body: input,
    signal,
  });
  if (error) {
    if (signal.aborted)
      throw new Error("Analyse interrompue ou délai dépassé.");
    let message =
      "Impossible de joindre le service Kermit. Réessaie dans un instant.";
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.error === "string" && body.error.length < 300)
          message = body.error;
      } catch {
        /* Gateway responses need not be JSON. */
      }
      if (error.context.status === 401)
        message = "Ta session a expiré. Reconnecte-toi.";
      if (error.context.status === 404)
        message =
          "Kermit n’est pas encore activé sur le serveur. Sa configuration doit être terminée avant de pouvoir analyser un repas.";
    }
    throw new Error(message);
  }
  try {
    return validateReply(reply);
  } catch {
    throw new Error(
      "L’estimation reçue est invalide. Aucun repas n’a été enregistré.",
    );
  }
}

export async function prepareKermitPhoto(file: File): Promise<string> {
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(file.type)
  )
    throw new Error(
      "Choisis une photo JPEG, PNG, WebP ou HEIC lisible par Safari.",
    );
  if (file.size > 10 * 1024 * 1024) throw new Error("Photo limitée à 10 Mo.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("Photo illisible. Exporte-la en JPEG puis réessaie.");
    }
    const scale = Math.min(
      1,
      1024 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossible de préparer cette photo.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/jpeg", 0.75);
    canvas.width = canvas.height = 0;
    if (result.length > 750000)
      throw new Error(
        "Photo trop volumineuse après compression. Choisis une photo plus petite.",
      );
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
