# 📦 Installation Guide

## Method 1: Manual Installation (Recommended)

### Step 1: Locate your Obsidian Vault

Open Obsidian and go to **Settings → Files & Links → Vault location**.

Or search for the `.obsidian` folder in your vault (usually hidden).

### Step 2: Copy the plugin

Copy the entire plugin folder to your Obsidian plugins folder:

**On macOS/Linux:**
```bash
# Replace /path/to/plugin and /path/to/your/vault with your actual paths
cp -r /path/to/plugin/obsidian-gm-vault-plugin /path/to/your/vault/.obsidian/plugins/gm-vault-exporter
```

**On Windows (PowerShell):**
```powershell
# Replace C:\path\to\your\vault with your actual vault path
Copy-Item -Recurse "C:\path\to\plugin\obsidian-gm-vault-plugin" "C:\path\to\your\vault\.obsidian\plugins\gm-vault-exporter"
```

**Or manually:**
1. Open Finder (macOS) or File Explorer (Windows)
2. Navigate to your Obsidian vault
3. Open the `.obsidian` folder (may be hidden, press `Cmd+Shift+.` on macOS to show hidden files)
4. Open the `plugins` folder
5. Copy the entire `obsidian-gm-vault-plugin` folder here
6. Rename it to `gm-vault-exporter` (optional, but recommended)

### Step 3: Enable the plugin

1. Open Obsidian
2. Go to **Settings** (⚙️) → **Community plugins**
3. Find **"GM Vault Exporter"** in the list
4. Toggle it on

### Step 4: Verify installation

You should see the plugin commands available:
- `Cmd+P` (macOS) or `Ctrl+P` (Windows/Linux)
- Search for "Select session folder" or "Export vault to JSON"

## Method 2: Using a symbolic link (Development)

If you're developing the plugin and want changes to reflect automatically:

**On macOS/Linux:**
```bash
# Replace /path/to/plugin and /path/to/your/vault with your actual paths
ln -s /path/to/plugin/obsidian-gm-vault-plugin /path/to/your/vault/.obsidian/plugins/gm-vault-exporter
```

**On Windows (PowerShell as Administrator):**
```powershell
New-Item -ItemType SymbolicLink -Path "C:\path\to\your\vault\.obsidian\plugins\gm-vault-exporter" -Target "C:\path\to\plugin\obsidian-gm-vault-plugin"
```

## Required file structure

The plugin must have this structure in `.obsidian/plugins/gm-vault-exporter/`:

```
gm-vault-exporter/
├── main.js          ✅ (compiled file)
├── manifest.json    ✅
└── src/             ✅ (source code, optional)
```

## Verify everything is correct

Run this command to verify the required files are present:

```bash
cd /path/to/your/vault/.obsidian/plugins/gm-vault-exporter
ls -la main.js manifest.json
```

Both files must exist.

## Troubleshooting

### Plugin doesn't appear in the list

1. Verify that `main.js` and `manifest.json` files are in the correct folder
2. Restart Obsidian completely
3. Check that the plugin is not in the disabled plugins list

### Error loading the plugin

1. Open the **Developer console** in Obsidian (`Cmd+Option+I` on macOS, `Ctrl+Shift+I` on Windows/Linux)
2. Check for errors in the console
3. Verify that `main.js` is compiled correctly (run `npm run build`)

### Export error

1. Make sure you've selected a session folder first
2. Verify that the folder contains markdown files
3. Check Obsidian notifications for error messages
4. Open the developer console (`Cmd+Option+I` on macOS) to see detailed errors

## Next steps

Once installed, check the [README.md](../README.md) to learn how to use the plugin.
