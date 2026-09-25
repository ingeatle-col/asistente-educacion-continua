// Visita la página de programas de Educación Continua de la Javeriana,
// extrae TODOS los programas listados (están completos en el DOM, no hay
// que paginar), se queda solo con los que tienen fecha de apertura futura
// (o de hoy) definida, y escribe catalogo.json en la raíz del proyecto.
// Además revisa la página de cada programa con fecha ya pasada: si dice que
// tiene inscripción continua (p. ej. "la fecha de inicio dependerá del mínimo
// número de inscritos"), lo incluye marcado con inscripcion_continua: true.
//
// Corre dentro de GitHub Actions cada noche (ver .github/workflows/actualizar-catalogo.yml).

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const URL_PROGRAMAS = "https://educacionvirtual.javeriana.edu.co/nuestros-programas-nuevo";
const SALIDA = path.join(__dirname, "..", "catalogo.json");

function parseFechaDDMMYYYY(fecha) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha || "");
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: "Mozilla/5.0 (compatible; AsistenteEducacionContinuaBot/1.0)" });

  console.log("Abriendo", URL_PROGRAMAS);
  // "domcontentloaded" en vez de "networkidle": esta página tiene scripts
  // de fondo (analítica, chat, etc.) que nunca dejan la red 100% quieta,
  // así que "networkidle" siempre agotaba el tiempo. Con el DOM cargado
  // y esperando luego el selector concreto es suficiente y más confiable.
  await page.goto(URL_PROGRAMAS, { waitUntil: "domcontentloaded", timeout: 90000 });

  // cerrar banner de cookies si aparece (no bloquea si no existe)
  try {
    await page.getByText("Aceptar", { exact: true }).click({ timeout: 5000 });
  } catch (e) {
    /* sin banner, seguimos */
  }

  await page.waitForSelector("li.item-programa", { timeout: 60000 });
  // pequeña espera extra por si el listado sigue montándose
  await page.waitForTimeout(3000);

  const crudos = await page.evaluate(() => {
    const items = document.querySelectorAll("li.item-programa");
    const out = [];
    items.forEach((li) => {
      const tipoEl = li.querySelector(".card-type");
      const imgEl = li.querySelector("img.card-img");
      const linkEl = li.querySelector("a[href]");
      const text = li.textContent.replace(/\s+/g, " ");
      const dur = (text.match(/Duraci[oó]n:\s*([^N]+?)\s*(?=Nivel:|$)/) || [])[1];
      const niv = (text.match(/Nivel:\s*([^F]+?)\s*(?=Fecha de inicio:|$)/) || [])[1];
      const fecha = (text.match(/Fecha de inicio:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1];
      out.push({
        tipo: tipoEl ? tipoEl.textContent.trim() : "",
        titulo: imgEl ? (imgEl.getAttribute("alt") || "").trim() : "",
        url: linkEl ? linkEl.getAttribute("href") : "",
        duracion: dur ? dur.trim() : "",
        nivel: niv ? niv.trim() : "",
        fecha_inicio: fecha || "",
      });
    });
    return out;
  });

  console.log("Programas encontrados en la página:", crudos.length);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vistos = new Set();
  const vigentes = [];
  for (const p of crudos) {
    if (!p.titulo || !p.url || !p.fecha_inicio) continue;
    const fecha = parseFechaDDMMYYYY(p.fecha_inicio);
    if (!fecha || fecha < hoy) continue;
    const url = p.url.startsWith("http") ? p.url : "https://educacionvirtual.javeriana.edu.co" + p.url;
    if (vistos.has(url)) continue;
    vistos.add(url);
    const [d, m, y] = p.fecha_inicio.split("/");
    vigentes.push({
      titulo: p.titulo,
      tipo: p.tipo,
      duracion: p.duracion,
      nivel: p.nivel,
      fecha_inicio: p.fecha_inicio,
      fecha_inicio_iso: `${y}-${m}-${d}`,
      url,
    });
  }

  // ---- Programas de inscripción continua (fecha publicada ya pasada) ----
  const PATRONES_CONTINUA = [
    /depender[áa]\s+del\s+m[íi]nimo\s+(de\s+)?(n[úu]mero\s+de\s+)?inscritos/i,
    /inscripci[óo]n(es)?\s+(permanente|continua|abierta)s?/i,
    /apertura\s+(est[áa]\s+)?sujeta\s+al?\s+(m[íi]nimo|n[úu]mero)/i,
    /inicio\s+(mensual|cada\s+mes)/i,
  ];
  const PATRON_CERRADO = /(inscripciones\s+cerradas|programa\s+(cerrado|finalizado)|cupos\s+agotados)/i;
  // Páginas que se revisan aunque no aparezcan en el listado general.
  const URLS_ADICIONALES = [
    "https://educacionvirtual.javeriana.edu.co/club-sapiencia",
  ];
  const MAX_REVISIONES = 150;
  const haceUnAnio = new Date(hoy); haceUnAnio.setFullYear(hoy.getFullYear() - 1);

  const porRevisar = [];
  const yaRevisadas = new Set(vistos);
  for (const p of crudos) {
    if (!p.titulo || !p.url) continue;
    const url = p.url.startsWith("http") ? p.url : "https://educacionvirtual.javeriana.edu.co" + p.url;
    const fecha = parseFechaDDMMYYYY(p.fecha_inicio);
    if (yaRevisadas.has(url) || !fecha || fecha >= hoy || fecha < haceUnAnio) continue;
    yaRevisadas.add(url);
    porRevisar.push({ ...p, url });
  }
  for (const url of URLS_ADICIONALES) {
    if (!yaRevisadas.has(url)) { yaRevisadas.add(url); porRevisar.push({ url, titulo: "", tipo: "", duracion: "", nivel: "", fecha_inicio: "" }); }
  }
  console.log("Programas con fecha pasada a revisar:", porRevisar.length);

  for (const p of porRevisar.slice(0, MAX_REVISIONES)) {
    try {
      await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);
      const info = await page.evaluate(() => ({
        texto: document.body ? document.body.innerText.replace(/\s+/g, " ") : "",
        h1: (document.querySelector("h1") || {}).innerText || document.title || "",
      }));
      if (!PATRONES_CONTINUA.some((r) => r.test(info.texto)) || PATRON_CERRADO.test(info.texto)) continue;
      const titulo = (p.titulo || info.h1 || "").trim();
      if (!titulo) continue;
      let iso = "";
      if (p.fecha_inicio) { const [d, m, y] = p.fecha_inicio.split("/"); iso = `${y}-${m}-${d}`; }
      vigentes.push({
        titulo,
        tipo: p.tipo || "",
        duracion: p.duracion || "",
        nivel: p.nivel || "",
        fecha_inicio: p.fecha_inicio || "",
        fecha_inicio_iso: iso,
        url: p.url,
        inscripcion_continua: true,
      });
      console.log("Inscripción continua:", titulo, "-", p.url);
    } catch (e) {
      console.warn("No se pudo revisar", p.url, String(e).slice(0, 120));
    }
  }

  await browser.close();

  vigentes.sort((a, b) => (a.fecha_inicio_iso < b.fecha_inicio_iso ? -1 : 1));
  console.log("De ellos, con inscripción continua:", vigentes.filter((p) => p.inscripcion_continua).length);

  if (vigentes.length === 0) {
    console.error("No se encontró ningún programa vigente — no se sobrescribe catalogo.json por seguridad.");
    process.exit(1);
  }

  const data = {
    programas: vigentes,
    updated_at: new Date().toISOString().slice(0, 10),
    source: URL_PROGRAMAS,
  };

  fs.writeFileSync(SALIDA, JSON.stringify(data, null, 2), "utf-8");
  console.log("catalogo.json actualizado con", vigentes.length, "programas vigentes.");
})().catch((err) => {
  console.error("Error actualizando el catálogo:", err);
  process.exit(1);
});
