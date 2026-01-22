#!/bin/bash
# Script to prepare a release for Obsidian Community Plugins

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Preparing release for GM Vault Exporter${NC}\n"

# Check if manifest.json exists
if [ ! -f "manifest.json" ]; then
    echo "❌ Error: manifest.json not found"
    exit 1
fi

# Extract version from manifest.json
VERSION=$(node -p "require('./manifest.json').version")
echo -e "${YELLOW}📦 Version: ${VERSION}${NC}\n"

# Build the plugin
echo "🔨 Building plugin..."
npm run build

# Check if main.js was created
if [ ! -f "main.js" ]; then
    echo "❌ Error: main.js not found after build"
    exit 1
fi

echo -e "\n${GREEN}✅ Build completed successfully!${NC}\n"

# Create release directory
RELEASE_DIR="release"
mkdir -p "$RELEASE_DIR"

# Copy files
cp main.js "$RELEASE_DIR/"
cp manifest.json "$RELEASE_DIR/"

echo -e "${GREEN}📁 Release files prepared in: ${RELEASE_DIR}/${NC}\n"
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Go to: https://github.com/lolergb/obsidian-gm-vault-exporter/releases/new"
echo "2. Tag version: v${VERSION}"
echo "3. Release title: Release v${VERSION}"
echo "4. Upload files from ${RELEASE_DIR}/:"
echo "   - main.js"
echo "   - manifest.json"
echo "5. Publish the release"
echo ""
echo -e "${GREEN}✨ Done!${NC}\n"
