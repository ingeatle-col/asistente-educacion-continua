async function enviarLead(datos) {
  const { GOOGLE_SHEETS_URL, GOOGLE_SHEETS_TOKEN, RESEND_API_KEY, LEADS_EMAIL_TO } = process.env;
  const s = sello();
  const ficha = { ID_Conversacion: s.id, Fecha: s.fecha, Hora: s.hora };
  const noAutoriza = String(datos.Autorizacion_Datos || "").toUpperCase().startsWith("NO");
  for (const c of COLUMNAS) {
    // Si no autorizó, solo se guarda la autorización (sin datos personales).
    ficha[c] = noAutoriza && c !== "Autorizacion_Datos" ? "" : String(datos[c] ?? "").trim();
  }
  if (noAutoriza) ficha.Autorizacion_Datos = "NO";

  // 1) Google Sheets (principal)
  if (GOOGLE_SHEETS_URL) {
    try {
      const g = await fetch(GOOGLE_SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: GOOGLE_SHEETS_TOKEN || "", ficha }),
      });
      const j = await g.json().catch(() => ({}));
      if (g.ok && j.ok) return true;
      console.error("Error Google Sheets", g.status, JSON.stringify(j), ficha.ID_Conversacion);
    } catch (e) {
      console.error("Error Google Sheets", e, ficha.ID_Conversacion);
    }
  }

  // 2) Respaldo por correo (solo si está configurado)
  if (!RESEND_API_KEY || !LEADS_EMAIL_TO) {
    console.warn("Lead no guardado por correo (sin RESEND_API_KEY/LEADS_EMAIL_TO)", JSON.stringify(ficha));
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Asistente Educacion Continua <onboarding@resend.dev>",
      to: [LEADS_EMAIL_TO],
      subject: `LEAD_BOT_EC ${ficha.ID_Conversacion}`,
      text: "###INICIO###" + JSON.stringify(ficha) + "###FIN###",
    }),
  });
  if (!r.ok) console.error("Error Resend", r.status, await r.text());
  return r.ok;
}

// ---------- Manejador ----------
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ mensajeInicial: MENSAJE_INICIAL, catalogoActualizado: catalogo.updated_at });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    let mensajes = Array.isArray(body.messages) ? body.messages : [];

    // Validación básica
    mensajes = mensajes
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CARACTERES) }));
    if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") {
      return res.status(400).json({ error: "Conversación inválida" });
    }
    if (mensajes.length > MAX_MENSAJES) {
      return res.status(200).json({
        reply: "Hemos llegado al límite de esta conversación. Si necesitas más orientación, escríbenos a direcontinua@javeriana.edu.co. ¡Gracias!",
        fin: true,
      });
    }

    // La conversación siempre arranca con el saludo + solicitud de autorización.
    const historial = [{ role: "user", content: "Hola" }, { role: "assistant", content: MENSAJE_INICIAL }, ...mensajes];

    // Caché: marcamos el último mensaje para reutilizar la conversación previa en la siguiente llamada.
    const ultimo = historial[historial.length - 1];
    historial[historial.length - 1] = {
      role: ultimo.role,
      content: [{ type: "text", text: ultimo.content, cache_control: { type: "ephemeral" } }],
    };

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        // Instrucciones + catálogo en caché: se cobran al 10% cuando se repiten.
        system: [{ type: "text", text: instrucciones(), cache_control: { type: "ephemeral" } }],
        messages: historial,
      }),
    });

    if (!r.ok) {
      console.error("Error API Anthropic", r.status, await r.text());
      return res.status(200).json({ reply: "Tuve un problema para responder. ¿Puedes intentar de nuevo en un momento?", error: true });
    }

    const data = await r.json();
    let texto = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (data.usage) console.log("uso", JSON.stringify(data.usage));

    // Detectar, quitar y enviar el bloque de registro del lead.
    let leadGuardado = false;
    const m = texto.match(/<lead>([\s\S]*?)<\/lead>/i);
    if (m) {
      texto = texto.replace(m[0], "").trim();
      try {
        leadGuardado = await enviarLead(JSON.parse(m[1]));
      } catch (e) {
        console.error("Lead con JSON inválido", m[1], e);
      }
    }

    return res.status(200).json({ reply: texto, leadGuardado });
  } catch (e) {
    console.error(e);
    return res.status(200).json({ reply: "Tuve un problema para responder. ¿Puedes intentar de nuevo en un momento?", error: true });
  }
}
