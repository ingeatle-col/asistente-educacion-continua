# Cómo publicar el Asistente de Educación Continua (sin escribir código)

Esta carpeta trae todo lo necesario: la página del bot (`index.html`) y el
backend que llama a Claude de forma segura (`api/chat.js`). Vas a publicarla
en Vercel (gratis) en tres pasos, todo desde el navegador.

## Paso 1 — Sube esta carpeta a GitHub

1. Entra a github.com y crea una cuenta gratuita si no tienes.
2. Haz clic en "New repository" (Nuevo repositorio). Ponle un nombre, por
   ejemplo `asistente-educacion-continua`. Puede ser privado.
3. Dentro del repositorio recién creado, busca la opción "Add file" →
   "Upload files" (Subir archivos).
4. Arrastra ahí TODOS los archivos y carpetas de esta carpeta (`index.html`,
   `package.json`, y la carpeta `api` completa con `chat.js` adentro).
   Asegúrate de que la carpeta `api` quede como carpeta, no como archivos
   sueltos en la raíz.
5. Haz clic en "Commit changes" (Confirmar cambios).

## Paso 2 — Conecta ese repositorio con Vercel

1. Entra a vercel.com y crea una cuenta gratuita con tu correo (o con tu
   cuenta de GitHub, es más rápido).
2. Haz clic en "Add New..." → "Project".
3. Elige "Import Git Repository" y selecciona el repositorio que acabas de
   crear (`asistente-educacion-continua`).
4. Déjalo con la configuración que Vercel sugiere por defecto (no hace falta
   tocar nada) y haz clic en "Deploy".

## Paso 3 — Configura tu API key (el paso más importante)

1. Cuando el despliegue termine, entra al proyecto en Vercel → pestaña
   "Settings" → "Environment Variables".
2. Agrega una variable:
   - Nombre: `ANTHROPIC_API_KEY`
   - Valor: tu API key de Anthropic (la que ya tienes en console.anthropic.com)
3. Guarda. Luego ve a la pestaña "Deployments", entra al último despliegue y
   haz clic en "Redeploy" para que tome la nueva variable.

## Listo

Vercel te da una URL pública, algo como:

`https://asistente-educacion-continua.vercel.app`

Esa es la que puedes compartir por correo, LinkedIn, WhatsApp, donde
quieras. Cualquier persona que la abra puede chatear con el bot
directamente, sin crear ninguna cuenta.

## Notas importantes

- **Costo:** cada conversación consume créditos de tu cuenta de Anthropic
  (no de Vercel, que es gratis en este uso). Si el link se vuelve muy
  popular, revisa tu consumo en console.anthropic.com.
- **Los leads (nombre, correo, respuestas) todavía no se guardan en ningún
  lado** — el bot solo los usa durante la conversación. Si quieres que
  queden registrados para hacerles seguimiento, dime y te preparo esa
  parte (por ejemplo, guardarlos en una hoja de cálculo o enviarlos por
  correo automáticamente).
- **El catálogo de programas** que usa el bot quedó fijo en el código, con
  fecha de verificación 2026-09-14. Con el tiempo se irá desactualizando;
  cuando decidas seguir con esto, conviene automatizar su actualización
  (puedo ayudarte a dejarlo listo).
- Si en algún momento quieres cambiar el modelo, agrega también la variable
  de entorno `ANTHROPIC_MODEL` (por ejemplo `claude-opus-4-5`).
