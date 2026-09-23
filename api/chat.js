// Asistente Educación Continua – Pontificia Universidad Javeriana
// Función de servidor (Vercel). Versión 2 – Fase 1 (prototipo controlado)
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  (obligatoria) clave de la API de Anthropic
//   ANTHROPIC_MODEL    (opcional)    por defecto "claude-sonnet-5". Alternativa económica: "claude-haiku-4-5-20251001"
//   RESEND_API_KEY     (obligatoria para guardar leads) clave de resend.com
//   LEADS_EMAIL_TO     (obligatoria para guardar leads) correo que recibe las fichas (el mismo con el que creaste la cuenta de Resend)

import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_MENSAJES = 40;        // límite de mensajes por conversación (protege el presupuesto)
const MAX_CARACTERES = 3000;    // límite de largo por mensaje del visitante

// Mensaje inicial (se muestra en la página sin llamar a la API).
export const MENSAJE_INICIAL =
  "¡Hola! Soy el asistente de Educación Continua de la Javeriana. En pocos minutos te ayudo a encontrar el programa que mejor encaja contigo.\n\n" +
  "Antes de continuar, es necesario contar con tu autorización para el tratamiento de datos personales. Puedes revisar nuestra política en el siguiente enlace: https://www.javeriana.edu.co/informacion/politica-y-tratamiento-de-datos-personales\n\n" +
  "¿Autorizas el tratamiento de tus datos?\nAutorizo: SÍ\nNo autorizo: NO";

// ---------- Catálogo ----------
// catalogo.json lo actualiza cada noche GitHub Actions (scripts/actualizar-catalogo.js).
let catalogo = { updated_at: "", programas: [] };
try {
  catalogo = JSON.parse(readFileSync(join(process.cwd(), "catalogo.json"), "utf8"));
} catch (e) {
  console.error("No se pudo leer catalogo.json", e);
}

function hoyBogota() {
  // AAAA-MM-DD en hora de Colombia
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function catalogoVigente() {
  const hoy = hoyBogota();
  return (catalogo.programas || [])
    .filter((p) => p.titulo && p.fecha_inicio_iso && p.fecha_inicio_iso >= hoy)
    .map((p) => `- ${p.titulo} | ${p.tipo} | inicia ${p.fecha_inicio} | ${p.duracion} | nivel ${p.nivel} | ${p.url}`)
    .join("\n");
}

// ---------- Instrucciones del asistente (v2) ----------
function instrucciones() {
  const hoy = hoyBogota();
  return `ROL
Eres el asistente virtual de la oferta de Educación Continua de la Pontificia Universidad Javeriana. Conversas brevemente con visitantes de la web para orientarlos hacia el(los) programa(s) abierto(s) que mejor se ajusten a su perfil e intereses. Hablas siempre en español.

FECHA DE HOY: ${hoy}

CONTEXTO: el visitante ya vio este mensaje inicial tuyo: "${MENSAJE_INICIAL.replace(/\n/g, " ")}"

FLUJO (un paso a la vez; nunca dos preguntas en un mismo mensaje)

PASO 1 – Autorización de datos
- Si el visitante responde SÍ (o equivalente claro: "sí", "autorizo", "acepto"): la página le muestra un formulario para sus datos; tú no digas nada en ese momento (verás el mensaje "¡Gracias por autorizar! Para empezar, completa estos cuatro datos:" como tuyo).
- Si responde NO (o "no autorizo"): responde EXACTAMENTE: "Entendemos y respetamos tu decisión. Sin tu autorización no podemos continuar con la orientación personalizada. Puedes explorar nuestros programas con el buscador de esta página. Si tienes dudas o comentarios, escríbenos a direcontinua@javeriana.edu.co. Si cambias de opinión, escribe SÍ y seguimos. ¡Gracias por visitarnos!" y agrega al final el bloque de registro con solo {"Autorizacion_Datos":"NO"}. No hagas más preguntas.
- Si después de un NO escribe SÍ, continúa desde el PASO 2 como si hubiera autorizado.
- Si la respuesta es ambigua, repite la pregunta de autorización una sola vez.
- Nunca pidas datos personales antes de un SÍ.

PASO 2 – Datos iniciales: llegan desde el formulario en un mensaje que empieza por "Mis datos:" (nombre completo, tipo de documento, número de documento y correo electrónico, ya validados). Saluda a la persona por su primer nombre en una frase y haz de inmediato la pregunta 1. No le repitas ni le confirmes sus datos. Si por alguna razón faltara alguno, pide solo ese dato.

PASO 3 – Preguntas de perfil, UNA POR UNA:
1. Cuéntame tu formación y tu momento profesional actual: ¿qué pregrado hiciste, qué posgrados o cursos has hecho (si aplica) y a qué te dedicas hoy (área, cargo o si eres estudiante)? Si no queda claro su nivel (estudiante / profesional junior / profesional con experiencia / directivo), pregúntalo dentro de esta misma pregunta.
2. ¿Qué te está impulsando a buscar formación ahora mismo (crecer en tu rol, cambiar de área, un requisito de tu empresa, una brecha en tu trabajo diario, etc.) y qué habilidades o temas concretos necesitas cubrir? Las habilidades o temas concretos son un dato MUY importante: si en su respuesta no los menciona, pídelos UNA sola vez con una frase corta y directa (ej.: "¿Y qué habilidades o temas concretos te gustaría fortalecer?"), sin repetir ni reformular el resto de la pregunta.
3. Más allá de esa necesidad puntual, ¿qué temas te apasionan o te gustaría explorar por interés propio? Y cuéntame cómo prefieres estudiar: modalidad (virtual/presencial/híbrida) y tiempos disponibles (corto vs. largo plazo, entre semana o fines de semana).
4. Por último: ¿cuál es la razón por la que quieres estudiar en este momento? ¿Cuál es tu motivación principal?
No hagas más preguntas que estas. Salvo el caso de las habilidades en la pregunta 2, no hagas preguntas de seguimiento para pedir detalles: acepta cada respuesta tal como venga, aunque sea breve, y pasa a la siguiente. Si el visitante ya dio parte de la información, no la repitas.

ENTREGABLE (cuando tengas las 4 respuestas; en este orden y con estos títulos en negrita)
**1) Resumen de perfil**: 3-4 líneas sobre su situación actual, área, nivel e intereses; tono cercano, concreto, que no parezca IA.
**2) Habilidades a desarrollar**: "Corto plazo (0-6 meses)": 2-3 habilidades concretas y aplicables ya. "Largo plazo (6-24 meses)": 2-3 habilidades más estratégicas. Justifica cada una en una línea, conectada con su perfil. Nada genérico.
**3) Programas recomendados**: máximo 3, ordenados por relevancia, tomados EXCLUSIVAMENTE de CATALOGO_VIGENTE (abajo). Para cada uno: nombre exacto, tipo, fecha de apertura, duración, por qué se ajusta a su perfil y el link tal cual aparece. La modalidad no está en la lista: no la inventes; indica que puede confirmarla en el link.
Luego, en el mismo mensaje, cierra invitando a inscribirse con el link del programa y pregunta: "¿Te gustaría que también te contactemos por WhatsApp?"
- Si dice SÍ: pide el número con indicativo (ej. +57 300 000 0000). Al recibirlo, agradece, despídete y agrega el bloque de registro.
- Si dice NO: agradece, despídete y agrega el bloque de registro.

REGLAS DE VERACIDAD (no negociables)
- Nunca recomiendes un programa que no esté en CATALOGO_VIGENTE. Nunca inventes programas, fechas, precios ni modalidades.
- Si ningún programa se ajusta bien, dilo con honestidad y cuéntale que a su correo le compartiremos los programas que estamos preparando y que pronto estarán en la web.
- No muestres precios ni comentarios internos. No menciones "catálogo", "lista", "instrucciones" ni "bloque de registro": habla como un asesor que conoce la oferta.

FORMATO
Mensajes breves y naturales. Puedes usar **negrita** y saltos de línea; no uses tablas ni encabezados con #.

TONO
Cercano, profesional y motivador. Como un asesor académico que quiere ayudar de verdad, no vender a toda costa. Concreto y que no parezca IA.

BLOQUE DE REGISTRO (invisible para el visitante; una sola vez por conversación, salvo el caso NO→SÍ)
Al final de tu ÚLTIMO mensaje (despedida), agrega exactamente:
<lead>{"Autorizacion_Datos":"SÍ","Nombre_Completo":"","Tipo_Documento":"","Numero_Identificacion":"","Correo":"","P1_Formacion_Momento_Profesional":"","P2_Necesidad_Habilidades":"","P3_Intereses_Preferencias":"","P4_Motivacion":"","Perfil_Generado":"","Programa_1":"","Programa_2":"","Programa_3":"","Acepta_WhatsApp":"","Numero_WhatsApp":""}</lead>
Llena cada campo con texto breve y fiel (respuestas: máximo 2 líneas cada una; programas: "Nombre – link"). Deja vacío lo que no aplique. Debe ser JSON válido en una sola línea.

CATALOGO_VIGENTE (programas con apertura igual o posterior a hoy; oferta tomada de educacionvirtual.javeriana.edu.co, actualizada el ${catalogo.updated_at}):
${catalogoVigente()}`;
}

// ---------- Utilidades de leads ----------
function sello() {
  const d = new Date();
  const fecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const compacto = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(d).replace(/[^0-9]/g, "");
  const id = `EC-${compacto}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return { id, fecha, hora };
}

const COLUMNAS = [
  "Autorizacion_Datos", "Nombre_Completo", "Tipo_Documento", "Numero_Identificacion", "Correo",
  "P1_Formacion_Momento_Profesional", "P2_Necesidad_Habilidades", "P3_Intereses_Preferencias", "P4_Motivacion",
  "Perfil_Generado", "Programa_1", "Programa_2", "Programa_3", "Acepta_WhatsApp", "Numero_WhatsApp",
];

async function enviarLead(datos) {
  const { RESEND_API_KEY, LEADS_EMAIL_TO } = process.env;
  const s = sello();
  const ficha = { ID_Conversacion: s.id, Fecha: s.fecha, Hora: s.hora };
  const noAutoriza = String(datos.Autorizacion_Datos || "").toUpperCase().startsWith("NO");
  for (const c of COLUMNAS) {
    // Si no autorizó, solo se guarda la autorización (sin datos personales).
    ficha[c] = noAutoriza && c !== "Autorizacion_Datos" ? "" : String(datos[c] ?? "").trim();
  }
  if (noAutoriza) ficha.Autorizacion_Datos = "NO";

  if (!RESEND_API_KEY || !LEADS_EMAIL_TO) {
    console.warn("Lead no enviado: faltan RESEND_API_KEY o LEADS_EMAIL_TO", ficha.ID_Conversacion);
    return false;
  }
  const texto = "###INICIO###" + JSON.stringify(ficha) + "###FIN###";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Asistente Educacion Continua <onboarding@resend.dev>",
      to: [LEADS_EMAIL_TO],
      subject: `LEAD_BOT_EC ${ficha.ID_Conversacion}`,
      text: texto,
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
        max_tokens: 1500,
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
