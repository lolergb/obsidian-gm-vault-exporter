# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.2] - 2026-02-04

### Added
- **Copy page URL (tunnel)**: nuevo comando para copiar la URL del tunnel de una página concreta al portapapeles
- Selector de páginas (modal de búsqueda) para elegir la página cuya URL copiar
- Aviso cuando el tunnel no está activo: indica que la página no es accesible y sugiere ejecutar "Start server"
- Mensaje de confirmación al copiar la URL al portapapeles (nombre de página + URL)

### Changed
- N/A

### Fixed
- N/A

## [1.0.0] - 2026-01-24

### Added
- Initial release of GM Vault Exporter (Tunnel version)
- HTTP server on localhost:3000 for GM Vault integration
- HTTPS public tunnel using cloudflared
- Export Obsidian session pages to GM Vault JSON format
- Convert wiki links `[[page]]` to clickable mentions
- Convert tags `#tag` to Notion-style badges
- Render Markdown to HTML with Notion styles
- Real-time access to Obsidian vault from GM Vault
- Support for external images
- Automatic page ID generation for mentions
- Session page parser with special heading support

### Changed
- N/A

### Fixed
- N/A

[1.1.2]: https://github.com/lolergb/obsidian-gm-vault-exporter/releases/tag/v1.1.2
[1.0.0]: https://github.com/lolergb/obsidian-tunnel-gm-vault-plugin/releases/tag/v1.0.0
