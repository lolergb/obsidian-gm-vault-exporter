#!/bin/bash
# Script to find your Obsidian vault location

echo "🔍 Searching for Obsidian vaults..."
echo ""

# Search common locations
echo "📍 Searching common locations:"
find ~/Documents ~/Desktop ~/Downloads ~/Library -name ".obsidian" -type d 2>/dev/null | while read vault; do
    vault_path=$(dirname "$vault")
    echo "  ✅ Vault found: $vault_path"
    if [ -d "$vault/.obsidian/plugins" ]; then
        echo "     └─ Plugins folder: $vault/.obsidian/plugins"
    else
        echo "     └─ ⚠️  Plugins folder does not exist (will be created automatically)"
    fi
    echo ""
done

echo ""
echo "💡 If you can't find your vault:"
echo "   1. Open Obsidian"
echo "   2. Go to Settings (⚙️) → Files & Links"
echo "   3. Look for 'Vault location' or 'Vault location'"
echo "   4. Copy that path"
echo ""
echo "📦 To install the plugin, copy this folder to:"
echo "   [your-vault-path]/.obsidian/plugins/gm-vault-exporter"
