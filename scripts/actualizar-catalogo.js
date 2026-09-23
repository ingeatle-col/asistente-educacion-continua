// Visita la página de programas de Educación Continua de la Javeriana,
// extrae TODOS los programas listados (están completos en el DOM, no hay
// que paginar), se queda solo con los que tienen fecha de apertura futura
// (o de hoy) definida, y escribe catalogo.json en la raíz del proyecto.
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
  await page.goto(URL_PROGRAMAS, { waitUntil: "networkidle", timeout: 90000 });

  // cerrar banner de cookies si aparece (no bloquea si no existe)
  try {
    await page.getByText("Aceptar", { exact: true }).click({ timeout: 5000 });
  } catch (e) {
    /* sin banner, seguimos */
  }

  await page.waitForSelector("li.item-programa", { timeout: 30000 });
  // pequeña espera extra por si el listado sigue montándose
  await page.waitForTimeout(2000);

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

  await browser.close();

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

  vigentes.sort((a, b) => (a.fecha_inicio_iso < b.fecha_inicio_iso ? -1 : 1));

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
