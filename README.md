# GM Vault Exporter (Tunnel)

Bring your Obsidian notes into **GM Vault** (Owlbear Rodeo) over a public tunnel. For tabletop GMs: your notes in Obsidian, visible at the virtual table.

---

## Installation

### Option 1: Brat (recommended)

1. Install the **Brat** plugin from Obsidian Community plugins (Settings → Community plugins → search "Brat").
2. Open **Brat** in settings and add this repository:  
   `lolergb/obsidian-gm-vault-exporter`  
   Or the full URL: https://github.com/lolergb/obsidian-gm-vault-exporter
3. Brat will install the plugin. Enable it in Community plugins.

### Option 2: Release

1. Download the `.zip` from the latest [release](https://github.com/lolergb/obsidian-gm-vault-exporter/releases).
2. Unzip into `.obsidian/plugins/gm-vault-exporter-tunnel/` in your vault.
3. Reload Obsidian and enable the plugin in Community plugins.

> **Note:** The first time you start the server, the plugin will automatically download and install **cloudflared** (Cloudflare's tunnel tool, ~25 MB). This is required for the public HTTPS tunnel to work. No manual install needed; progress shows in the status bar at the bottom.

---

## Quick start

1. **Select session folder**: open the note that organizes your session and run **"Select session folder"**.
2. **Start the server**: run **"Start server"**. You’ll get a URL like `https://something.trycloudflare.com`.
3. **In GM Vault** (Owlbear Rodeo): Settings → Import JSON → paste the URL from the plugin + `/gm-vault` (e.g. `https://something.trycloudflare.com/gm-vault`).
4. **To stop**: run **"Stop server"**.

---

## Structuring your session note

- **Headings (H1, H2)** = categories in GM Vault.
- **Links** `[[note|label]]` under a heading = pages.
- Special headings: `## Tables`, `## Quotes`, `## Images`, `## Enemies` set page types or subcategories.

Example:

```markdown
# My campaign

## Act 1

- [[Scene 1|The tavern]]
- [[Scene 2|The forest]]

## Enemies

- [[Goblin]]
- [[Orc]]
```

---

## Settings

Under **Settings → GM Vault Exporter (Tunnel)** you can enable **"Use bundled cloudflared only"** so the plugin uses only its own tunnel copy (useful if you already have cloudflared installed and want to avoid conflicts).

---

Only people with the URL while the server is running can see your notes. Share it only with your table.

**Made for GMs and tabletop play.**
