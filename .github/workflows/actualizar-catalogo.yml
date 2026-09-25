name: Actualizar catálogo de programas

on:
  schedule:
    # 05:00 UTC = 00:00 (medianoche) hora de Bogotá
    - cron: "0 5 * * *"
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  actualizar:
    runs-on: ubuntu-latest
    steps:
      - name: Clonar repositorio
        uses: actions/checkout@v4

      - name: Configurar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Instalar dependencias
        run: |
          npm init -y >/dev/null 2>&1 || true
          npm install --no-save playwright@1.48.0
          npx playwright install --with-deps chromium

      - name: Ejecutar actualización del catálogo
        run: node scripts/actualizar-catalogo.js

      - name: Confirmar y subir cambios si el catálogo cambió
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- catalogo.json; then
            echo "El catálogo no tuvo cambios."
          else
            git add catalogo.json
            git commit -m "Actualizar catálogo de programas (automático)"
            git push
          fi
