#!/bin/bash
# Script to create a clean ZIP file with only the plugin folder ready to install

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}📦 Creating install-ready ZIP file${NC}\n"

# Extract version from manifest.json
VERSION=$(node -p "require('./manifest.json').version")
echo -e "${YELLOW}📦 Version: ${VERSION}${NC}\n"

# Build the plugin first
echo "🔨 Building plugin..."
npm run build

# Check if main.js was created
if [ ! -f "main.js" ]; then
    echo "❌ Error: main.js not found after build"
    exit 1
fi

# Create temporary directory for plugin folder
PLUGIN_DIR="gm-vault-exporter"
rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# Copy only the files needed for installation
cp main.js "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"

# Create ZIP file
ZIP_NAME="gm-vault-exporter-v${VERSION}.zip"
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" "$PLUGIN_DIR" -x "*.DS_Store"

# Clean up temporary directory
rm -rf "$PLUGIN_DIR"

echo -e "\n${GREEN}✅ ZIP file created: ${ZIP_NAME}${NC}\n"
echo -e "${YELLOW}📝 This ZIP contains only the plugin folder ready to install:${NC}"
echo "   - Extract the ZIP"
echo "   - Copy the 'gm-vault-exporter' folder to your vault's .obsidian/plugins/ folder"
echo "   - Enable the plugin in Obsidian"
echo ""
echo -e "${GREEN}✨ Done!${NC}\n"
