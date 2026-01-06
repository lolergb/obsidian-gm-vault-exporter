#!/bin/bash
# Script para encontrar la ubicación de tu vault de Obsidian

echo "🔍 Buscando vaults de Obsidian..."
echo ""

# Buscar en ubicaciones comunes
echo "📍 Buscando en ubicaciones comunes:"
find ~/Documents ~/Desktop ~/Downloads ~/Library -name ".obsidian" -type d 2>/dev/null | while read vault; do
    vault_path=$(dirname "$vault")
    echo "  ✅ Vault encontrado: $vault_path"
    if [ -d "$vault/.obsidian/plugins" ]; then
        echo "     └─ Carpeta plugins: $vault/.obsidian/plugins"
    else
        echo "     └─ ⚠️  Carpeta plugins no existe (se creará automáticamente)"
    fi
    echo ""
done

echo ""
echo "💡 Si no encuentras tu vault:"
echo "   1. Abre Obsidian"
echo "   2. Ve a Configuración (⚙️) → Archivos y enlaces"
echo "   3. Busca 'Ubicación del vault' o 'Vault location'"
echo "   4. Copia esa ruta"
echo ""
echo "📦 Para instalar el plugin, copia esta carpeta a:"
echo "   [ruta-de-tu-vault]/.obsidian/plugins/gm-vault-exporter"

