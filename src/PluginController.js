/**
 * @fileoverview Main plugin controller.
 *
 * Responsibilities:
 * - Connect all modules
 * - Handle Obsidian commands
 * - Manage plugin state
 * - Does NOT contain business logic
 */

import { Notice, PluginSettingTab, Setting, SuggestModal, TFile, TFolder } from 'obsidian';
import { slugify } from './utils/slugify.js';
import { ServerManager } from './server/ServerManager.js';
import { TunnelManager } from './server/TunnelManager.js';
import { SessionParser } from './parsers/SessionParser.js';
import { GMVaultJSONBuilder } from './renderers/GMVaultJSONBuilder.js';
import { MarkdownRenderer } from './renderers/MarkdownRenderer.js';
import { VaultExporter } from './exporters/VaultExporter.js';

/**
 * Main controller that orchestrates all plugin modules.
 *
 * @class PluginController
 */
export class PluginController {
	/**
	 * Creates a PluginController instance.
	 *
	 * @param {import('obsidian').App} app - Obsidian app
	 * @param {import('obsidian').Plugin} plugin - Plugin instance
	 */
	constructor(app, plugin) {
		/** @type {import('obsidian').App} */
		this.app = app;
		
		/** @type {import('obsidian').Plugin} */
		this.plugin = plugin;
		
		/** @type {ServerManager|null} */
		this.serverManager = null;
		
		/** @type {TunnelManager|null} */
		this.tunnelManager = null;
		
		/** @type {SessionParser|null} */
		this.sessionParser = null;
		
		/** @type {GMVaultJSONBuilder|null} */
		this.jsonBuilder = null;
		
		/** @type {MarkdownRenderer|null} */
		this.markdownRenderer = null;
		
		/** @type {VaultExporter|null} */
		this.vaultExporter = null;
		
		/** @type {import('obsidian').TFolder|null} */
		this.currentSessionFolder = null;
		
		/** @type {number} */
		this.port = 3000;
		
		/** @type {string|null} */
		this.publicUrl = null;
		
		/** @type {boolean} Use only plugin's cloudflared (ignore system); forces download if missing */
		this.useBundledCloudflared = false;
		
		/** @type {HTMLElement|null} Status bar item durante descarga de cloudflared (una sola línea que se actualiza) */
		this.tunnelProgressEl = null;
	}

	/**
	 * Initializes the plugin and registers commands.
	 *
	 * @returns {Promise<void>}
	 */
	async initialize() {
		// Get plugin directory for storing cloudflared binary
		const pluginDir = this._getPluginDir();
		
		// Progress callback: durante descarga actualiza una sola línea en la barra de estado; el resto son Notice
		const onTunnelProgress = (message) => {
			if (message.startsWith('Downloading cloudflared...')) {
				if (!this.tunnelProgressEl) {
					this.tunnelProgressEl = this.plugin.addStatusBarItem();
				}
				this.tunnelProgressEl.setText(message);
			} else {
				if (this.tunnelProgressEl) {
					this.tunnelProgressEl.remove();
					this.tunnelProgressEl = null;
				}
				new Notice(message, 3000);
			}
		};
		
		// Initialize modules
		this.serverManager = new ServerManager(this.port);
		this.tunnelManager = new TunnelManager(this.port, pluginDir, onTunnelProgress);
		this.sessionParser = new SessionParser(this.app);
		this.jsonBuilder = new GMVaultJSONBuilder(`http://localhost:${this.port}`);
		this.markdownRenderer = new MarkdownRenderer(`http://localhost:${this.port}`);
		this.vaultExporter = new VaultExporter(this.app);
		
		// Register Obsidian commands
		this._registerCommands();
		
		// Settings tab
		this.plugin.addSettingTab(new GMVaultSettingTab(this.app, this.plugin, this));
		
		// Load saved settings
		await this._loadSettings();
	}

	/**
	 * Saves settings to disk (public for use by settings tab).
	 */
	async saveSettings() {
		await this._saveSettings();
	}

	/**
	 * Gets the absolute path to the plugin directory.
	 * @private
	 * @returns {string|null} Plugin directory path or null
	 */
	_getPluginDir() {
		try {
			// Get vault base path
			const adapter = this.app.vault.adapter;
			const basePath = adapter.basePath || adapter.getBasePath?.();
			
			if (!basePath) {
				console.warn('[PluginController] Could not get vault base path');
				return null;
			}
			
			// Get plugin manifest directory (relative path like ".obsidian/plugins/plugin-id")
			const manifestDir = this.plugin.manifest.dir;
			if (!manifestDir) {
				console.warn('[PluginController] Could not get plugin manifest directory');
				return null;
			}
			
			// Combine paths
			// Use forward slashes and let Node.js handle it
			return `${basePath}/${manifestDir}`;
		} catch (error) {
			console.error('[PluginController] Error getting plugin directory:', error);
			return null;
		}
	}

	/**
	 * Cleans up resources when the plugin is disabled.
	 *
	 * @returns {Promise<void>}
	 */
	async cleanup() {
		if (this.tunnelManager && this.tunnelManager.isActive()) {
			await this.tunnelManager.stop();
		}
		if (this.serverManager && this.serverManager.isRunning()) {
			await this.serverManager.stop();
		}
	}

	/**
	 * Registers Obsidian commands.
	 *
	 * @private
	 */
	_registerCommands() {
		this.plugin.addCommand({
			id: 'enable-gm-vault',
			name: 'Start server',
			callback: () => this.enableServer()
		});
		
		this.plugin.addCommand({
			id: 'disable-gm-vault',
			name: 'Stop server',
			callback: () => this.disableServer()
		});
		
		this.plugin.addCommand({
			id: 'select-session-folder',
			name: 'Select session folder',
			callback: () => this.selectSessionFolder()
		});
		
		this.plugin.addCommand({
			id: 'show-public-url',
			name: 'Show public URL',
			callback: () => this.showPublicUrl()
		});
		
		this.plugin.addCommand({
			id: 'copy-gm-vault-url',
			name: 'Copy GM-vault URL',
			callback: () => this.copyGmVaultUrl()
		});
		
		this.plugin.addCommand({
			id: 'export-vault-json',
			name: 'Export vault to JSON (local-first)',
			callback: () => this.exportVaultToJson()
		});
	}

	/**
	 * Habilita el servidor HTTP.
	 * 
	 * @returns {Promise<void>}
	 */
	async enableServer() {
		if (!this.currentSessionFolder) {
			new Notice('Please select a session folder first using the "Select session folder" command');
			return;
		}

		try {
			// Inicia el servidor local
			await this.serverManager.start();
			this._registerRoutes();
			
			// Esperar un momento para asegurar que el servidor esté listo
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Inicia el túnel HTTPS público
			new Notice('⏳ Creating public HTTPS tunnel...');
			const publicUrl = await this.tunnelManager.start({
				useBundledOnly: this.useBundledCloudflared
			});
			this.publicUrl = publicUrl;
			
			// Actualiza la URL base del JSON builder para usar la URL pública
			this.jsonBuilder.setBaseUrl(publicUrl);
			
			// Actualiza la URL base del renderer para usar la URL pública
			this.markdownRenderer.setBaseUrl(publicUrl);
			
			// Notifica al usuario con la URL HTTPS pública (principal)
			new Notice(`✅ GM Vault access enabled (HTTPS):\n${publicUrl}\n\nUse this URL in GM Vault:\n${publicUrl}/gm-vault`, 10000);
			
			await this._saveSettings();
			
			// Copiar automáticamente la URL de GM-vault al portapapeles
			await this.copyGmVaultUrl();
		} catch (error) {
			new Notice(`❌ Error starting server: ${error.message}`);
		}
	}

	/**
	 * Deshabilita el servidor HTTP.
	 * 
	 * @returns {Promise<void>}
	 */
	async disableServer() {
		try {
			// Detiene el túnel
			if (this.tunnelManager && this.tunnelManager.isActive()) {
				await this.tunnelManager.stop();
			}
			
			// Detiene el servidor
			await this.serverManager.stop();
			this.publicUrl = null;
			
			new Notice('✅ GM Vault access disabled');
			
			await this._saveSettings();
		} catch (error) {
			new Notice(`❌ Error stopping server: ${error.message}`);
		}
	}

	/**
	 * Permite al usuario seleccionar una página de sesión.
	 * 
	 * @returns {Promise<void>}
	 */
	/**
	 * Muestra la URL pública del túnel si está activo.
	 * 
	 * @returns {Promise<void>}
	 */
	async showPublicUrl() {
		const url = this.tunnelManager?.getPublicUrl() || this.publicUrl;
		
		if (!url) {
			new Notice('❌ No active tunnel. Run "Enable GM Vault access" first.');
			return;
		}
		
		// Muestra la URL HTTPS en un notice con más tiempo
		new Notice(`🌐 Tunnel public HTTPS URL:\n${url}\n\n• JSON for GM Vault: ${url}/gm-vault\n• Pages: ${url}/pages/:slug`, 10000);
		
		// También la copia al portapapeles si es posible
		if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(url);
				new Notice('✅ URL copied to clipboard');
			} catch (e) {
				// Ignorar errores de clipboard
			}
		}
	}

	/**
	 * Copia la URL del GM-vault al portapapeles.
	 * 
	 * @returns {Promise<void>}
	 */
	async copyGmVaultUrl() {
		const url = this.tunnelManager?.getPublicUrl() || this.publicUrl;
		
		if (!url) {
			new Notice('❌ No active tunnel. Run "Enable GM Vault access" first.');
			return;
		}
		
		const gmVaultUrl = `${url}/gm-vault`;
		
		if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(gmVaultUrl);
				new Notice(`✅ GM-vault URL copied to clipboard:\n${gmVaultUrl}`);
			} catch (e) {
				new Notice(`❌ Error copying to clipboard: ${e.message}`);
			}
		} else {
			// Fallback: mostrar la URL en un notice
			new Notice(`📋 URL GM-vault:\n${gmVaultUrl}`, 10000);
		}
	}

	/**
	 * Exporta el vault a un archivo JSON con HTML embebido (local-first).
	 * No requiere servidor HTTP ni túnel.
	 * Las imágenes locales se omiten (se recomienda usar URLs externas).
	 * 
	 * @returns {Promise<void>}
	 */
	async exportVaultToJson() {
		if (!this.currentSessionFolder) {
			new Notice('❌ Please select a session folder first');
			return;
		}

		try {
			new Notice('⏳ Exporting vault...');
			
			// Exportar usando VaultExporter (sin opciones de imagen)
			const json = await this.vaultExporter.exportVault(this.currentSessionFolder);
			
			// Convertir a string
			const jsonString = JSON.stringify(json, null, 2);
			
			// Calcular tamaño
			const sizeKB = (new TextEncoder().encode(jsonString).length / 1024).toFixed(1);
			
			// Generar nombre de archivo
			const timestamp = new Date().toISOString().slice(0, 10);
			const fileName = `gm-vault-${this.currentSessionFolder.name}-${timestamp}.json`;
			
			// Crear el archivo en la raíz del vault
			const filePath = fileName;
			
			// Verificar si el archivo ya existe
			const existingFile = this.app.vault.getAbstractFileByPath(filePath);
			if (existingFile) {
				// Sobrescribir
				await this.app.vault.modify(existingFile, jsonString);
			} else {
				// Crear nuevo
				await this.app.vault.create(filePath, jsonString);
			}
			
			// Contar páginas
			let pageCount = 0;
			const countPages = (categories) => {
				for (const cat of categories) {
					for (const item of cat.items || []) {
						if (item.type === 'page') {
							pageCount++;
						} else if (item.type === 'category') {
							countPages([item]);
						}
					}
				}
			};
			countPages(json.categories);
			
			new Notice(`✅ Vault exported successfully!\n\n📁 ${fileName}\n📊 ${pageCount} pages\n💾 ${sizeKB} KB\n\n💡 Note: Local images are omitted. Use external URLs to include images.\n\nImport this file in GM Vault`, 10000);
			
		} catch (error) {
			console.error('Error exporting vault:', error);
			new Notice(`❌ Error exporting: ${error.message}`);
		}
	}

	/**
	 * Permite al usuario seleccionar una carpeta de sesión.
	 * Siempre muestra el selector para elegir manualmente.
	 * 
	 * @returns {Promise<void>}
	 */
	async selectSessionFolder() {
		// Obtener todas las carpetas del vault
		const folders = [];
		const addFolders = (folder) => {
			folders.push(folder);
			for (const child of folder.children || []) {
				if (child instanceof TFolder) {
					addFolders(child);
				}
			}
		};
		addFolders(this.app.vault.getRoot());
		
		// Siempre mostrar el selector para elegir carpeta manualmente
		const controller = this;
		
		class FolderSuggester extends SuggestModal {
			constructor(app, folders) {
				super(app);
				this.folders = folders;
				this.setPlaceholder('Type to filter folders...');
			}
			
			getSuggestions(query) {
				return this.folders.filter(folder => 
					folder.path.toLowerCase().includes(query.toLowerCase())
				);
			}
			
			renderSuggestion(folder, el) {
				el.createDiv({ text: folder.name });
				el.createDiv({ 
					text: folder.path, 
					cls: 'suggestion-description' 
				});
			}
			
			async onChooseSuggestion(folder, evt) {
				controller.currentSessionFolder = folder;
				new Notice(`✅ Session folder selected: ${folder.path}`);
				await controller._saveSettings();
			}
		}
		
		new FolderSuggester(this.app, folders).open();
	}

	/**
	 * Registra las rutas HTTP del servidor.
	 * 
	 * @private
	 */
	_registerRoutes() {
		// GET /gm-vault → Retorna JSON de GM Vault
		this.serverManager.registerRoute('GET', '/gm-vault', async (req, res) => {
			try {
				if (!this.currentSessionFolder) {
					this.serverManager.sendJSON(res, { 
						error: 'No session folder selected' 
					}, 400);
					return;
				}
				
				const session = await this.sessionParser.parseSession(this.currentSessionFolder);
				const json = this.jsonBuilder.buildJSON(session);
				
				this.serverManager.sendJSON(res, json);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error generating JSON: ${error.message}` 
				}, 500);
			}
		});
		
		// GET /pages/:slug → Renderiza Markdown como HTML o galería de imágenes
		this.serverManager.registerRoute('GET', '/pages/:slug', async (req, res, params) => {
			try {
				const slug = params.slug;
				
				// Primero intenta buscar una carpeta de imágenes por slug
				const imageFolder = await this._findImageFolderBySlug(slug);
				if (imageFolder) {
					const images = await this._getImageFilesFromFolder(imageFolder);
					if (images.length > 0) {
						const baseUrl = this.publicUrl || this.tunnelManager?.getPublicUrl() || `http://localhost:${this.port}`;
						const html = this.markdownRenderer.renderImageGallery(images, imageFolder.name, baseUrl);
						this.serverManager.sendHTML(res, html);
						return;
					}
				}
				
				// Si no es una carpeta de imágenes, busca el archivo por slug
				const file = await this._findFileBySlug(slug);
				
				if (!file) {
					this.serverManager.sendJSON(res, { 
						error: `Page not found: ${slug}` 
					}, 404);
					return;
				}
				
				const markdown = await this.app.vault.read(file);
				// Construir el mapeo de páginas para convertir wiki links a mentions
				const pageMap = await this._buildPageMap();
				this.markdownRenderer.setPageMap(pageMap);
				
				// Usar la URL pública si está disponible, sino la URL local
				const baseUrl = this.publicUrl || this.tunnelManager?.getPublicUrl() || `http://localhost:${this.port}`;
				const html = this.markdownRenderer.renderPage(markdown, file.basename, baseUrl);
				
				this.serverManager.sendHTML(res, html);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error rendering page: ${error.message}` 
				}, 500);
			}
		});
		
		// GET /images/* → Sirve archivos de imagen
		this.serverManager.registerRoute('GET', '/images/*', async (req, res) => {
			try {
				// Extraer el path completo después de /images/
				const url = new URL(req.url, `http://${req.headers.host}`);
				const fullPath = url.pathname;
				let imagePath = fullPath.replace(/^\/images\//, '');
				
				// El pathname ya viene parcialmente decodificado por URL, pero puede tener caracteres codificados
				// Intentar decodificar completamente
				try {
					// Decodificar cada segmento del path por separado para manejar correctamente las barras
					const pathSegments = imagePath.split('/');
					const decodedSegments = pathSegments.map(segment => {
						try {
							return decodeURIComponent(segment);
						} catch (e) {
							// Si falla la decodificación, usar el segmento original
							return segment;
						}
					});
					imagePath = decodedSegments.join('/');
				} catch (e) {
					// Si falla, usar el path tal cual
				}
				
				if (!imagePath) {
					this.serverManager.sendJSON(res, { 
						error: 'Image path not specified' 
					}, 400);
					return;
				}
				
				const file = this.app.vault.getAbstractFileByPath(imagePath);
				
				if (!file || !(file instanceof TFile)) {
					this.serverManager.sendJSON(res, { 
						error: `Image not found: ${imagePath}`,
						debug: {
							requestedPath: imagePath,
							rawUrl: req.url
						}
					}, 404);
					return;
				}
				
				// Verificar que es una imagen
				const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
				if (!imageExtensions.includes(file.extension.toLowerCase())) {
					this.serverManager.sendJSON(res, { 
						error: `Not an image file: ${imagePath}` 
					}, 400);
					return;
				}
				
				// Leer y servir la imagen
				const arrayBuffer = await this.app.vault.readBinary(file);
				const buffer = Buffer.from(arrayBuffer);
				
				// Determinar content-type
				const contentTypeMap = {
					'jpg': 'image/jpeg',
					'jpeg': 'image/jpeg',
					'png': 'image/png',
					'gif': 'image/gif',
					'webp': 'image/webp',
					'svg': 'image/svg+xml'
				};
				const contentType = contentTypeMap[file.extension.toLowerCase()] || 'application/octet-stream';
				
				res.writeHead(200, {
					'Content-Type': contentType,
					'Content-Length': buffer.length
				});
				res.end(buffer);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error serving image: ${error.message}` 
				}, 500);
			}
		});
	}

	/**
	 * Busca un archivo por su slug dentro de la carpeta de sesión.
	 * 
	 * @private
	 * @param {string} slug - Slug a buscar
	 * @returns {Promise<import('obsidian').TFile|null>} Archivo encontrado o null
	 */
	async _findFileBySlug(slug) {
		if (!this.currentSessionFolder) {
			return null;
		}
		
		// Función recursiva para buscar archivos en la carpeta y subcarpetas
		const searchInFolder = (folder) => {
			for (const child of folder.children || []) {
				if (child instanceof TFile && child.extension === 'md') {
					const fileSlug = slugify(child.basename);
					if (fileSlug === slug || child.basename.toLowerCase() === slug) {
						return child;
					}
				} else if (child instanceof TFolder) {
					const found = searchInFolder(child);
					if (found) {
						return found;
					}
				}
			}
			return null;
		};
		
		return searchInFolder(this.currentSessionFolder);
	}

	/**
	 * Busca una carpeta de imágenes por su slug dentro de la carpeta de sesión.
	 * 
	 * @private
	 * @param {string} slug - Slug a buscar
	 * @returns {Promise<import('obsidian').TFolder|null>} Carpeta encontrada o null
	 */
	async _findImageFolderBySlug(slug) {
		if (!this.currentSessionFolder) {
			return null;
		}
		
		// Función recursiva para buscar carpetas en la carpeta y subcarpetas
		const searchInFolder = async (folder) => {
			for (const child of folder.children || []) {
				if (child instanceof TFolder) {
					const folderSlug = slugify(child.name);
					if (folderSlug === slug || child.name.toLowerCase() === slug) {
						// Verificar que solo contiene imágenes
						const imageFiles = await this._getImageFilesFromFolder(child);
						const hasOnlyImages = imageFiles.length > 0 && 
							child.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
							child.children.filter(c => c.children !== undefined).length === 0;
						
						if (hasOnlyImages) {
							return child;
						}
					}
					
					const found = await searchInFolder(child);
					if (found) {
						return found;
					}
				}
			}
			return null;
		};
		
		return await searchInFolder(this.currentSessionFolder);
	}

	/**
	 * Construye el mapeo de nombres de archivo a información de página para mentions.
	 * 
	 * @private
	 * @returns {Promise<Map<string, {id: string, name: string, slug: string}>>} Mapeo de nombres a información de página
	 */
	async _buildPageMap() {
		const pageMap = new Map();
		
		if (!this.currentSessionFolder) {
			return pageMap;
		}
		
		/**
		 * Genera un ID único para páginas (mismo formato que GM Vault)
		 * @returns {string}
		 */
		const generatePageId = () => {
			const timestamp = Date.now().toString(36);
			const random = Math.random().toString(36).slice(2, 8);
			return `page_${timestamp}_${random}`;
		};
		
		/**
		 * Escanea recursivamente una carpeta y añade páginas al mapeo
		 * @param {import('obsidian').TFolder} folder - Carpeta a escanear
		 */
		const scanFolder = async (folder) => {
			for (const child of folder.children || []) {
				if (child instanceof TFile && child.extension === 'md') {
					const pageName = child.basename;
					const pageId = generatePageId();
					const pageSlug = slugify(pageName);
					
					// Guardar por basename (sin extensión) para resolución de wiki links
					pageMap.set(child.basename.toLowerCase(), {
						id: pageId,
						name: pageName,
						slug: pageSlug
					});
				} else if (child instanceof TFolder) {
					// También registrar carpetas de imágenes como páginas
					const imageFiles = await this._getImageFiles(child);
					const hasOnlyImages = imageFiles.length > 0 && 
						child.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
						child.children.filter(c => c.children !== undefined).length === 0;
					
					if (hasOnlyImages) {
						const pageId = generatePageId();
						const pageSlug = slugify(child.name);
						pageMap.set(child.name.toLowerCase(), {
							id: pageId,
							name: child.name,
							slug: pageSlug
						});
					}
					
					// Recursión para subcarpetas
					await scanFolder(child);
				}
			}
		};
		
		await scanFolder(this.currentSessionFolder);
		return pageMap;
	}

	/**
	 * Gets the file sort order from Obsidian's configuration.
	 *
	 * @private
	 * @returns {string} Sort order
	 */
	_getFileSortOrder() {
		const sortOrder = this.app.vault.getConfig?.('fileSortOrder') 
			|| this.app.vault.config?.fileSortOrder
			|| 'alphabetical';
		return sortOrder;
	}

	/**
	 * Sorts an array of files/folders according to Obsidian's file sort order setting.
	 *
	 * @private
	 * @param {Array} items - Array of TFile or TFolder objects
	 * @returns {Array} Sorted array
	 */
	_sortByObsidianConfig(items) {
		const sortOrder = this._getFileSortOrder();
		const sorted = [...items];
		
		switch (sortOrder) {
			case 'alphabetical':
				sorted.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case 'alphabeticalReverse':
				sorted.sort((a, b) => b.name.localeCompare(a.name));
				break;
			case 'byModifiedTime':
				sorted.sort((a, b) => (b.stat?.mtime || 0) - (a.stat?.mtime || 0));
				break;
			case 'byModifiedTimeReverse':
				sorted.sort((a, b) => (a.stat?.mtime || 0) - (b.stat?.mtime || 0));
				break;
			case 'byCreatedTime':
				sorted.sort((a, b) => (b.stat?.ctime || 0) - (a.stat?.ctime || 0));
				break;
			case 'byCreatedTimeReverse':
				sorted.sort((a, b) => (a.stat?.ctime || 0) - (b.stat?.ctime || 0));
				break;
			default:
				sorted.sort((a, b) => a.name.localeCompare(b.name));
		}
		
		return sorted;
	}

	/**
	 * Gets image files from a folder.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Folder to scan
	 * @returns {Promise<import('obsidian').TFile[]>} Array of image files
	 */
	async _getImageFiles(folder) {
		const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
		const imageFiles = [];
		
		for (const child of folder.children || []) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (imageExtensions.includes(ext)) {
					imageFiles.push(child);
				}
			}
		}
		
		return this._sortByObsidianConfig(imageFiles);
	}

	/**
	 * Gets image files from a folder and returns info for the renderer.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Folder to scan
	 * @returns {Promise<Array<{name: string, path: string}>>} Array of name/path objects
	 */
	async _getImageFilesFromFolder(folder) {
		const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
		const imageFiles = [];
		const baseUrl = this.publicUrl || this.tunnelManager?.getPublicUrl() || `http://localhost:${this.port}`;
		
		// First collect TFile objects
		for (const child of folder.children || []) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (imageExtensions.includes(ext)) {
					imageFiles.push(child);
				}
			}
		}
		
		// Sort according to Obsidian config (while we still have TFile objects with stat)
		const sortedFiles = this._sortByObsidianConfig(imageFiles);
		
		// Transform to {name, path} objects
		return sortedFiles.map(file => {
			const pathSegments = file.path.split('/');
			const encodedSegments = pathSegments.map(segment => encodeURIComponent(segment));
			const encodedPath = encodedSegments.join('/');
			
			return {
				name: file.name,
				path: `${baseUrl}/images/${encodedPath}`
			};
		});
	}

	/**
	 * Loads saved settings.
	 * 
	 * @private
	 * @returns {Promise<void>}
	 */
	async _loadSettings() {
		const data = await this.plugin.loadData();
		
		if (data) {
			this.port = data.port || 3000;
			this.publicUrl = data.publicUrl || null;
			this.useBundledCloudflared = data.useBundledCloudflared === true;
			
			if (data.sessionFolderPath) {
				const folder = this.app.vault.getAbstractFileByPath(data.sessionFolderPath);
				if (folder && folder instanceof TFolder) {
					this.currentSessionFolder = folder;
				}
			}
			
			// Si el servidor estaba activo, lo reinicia
			if (data.serverEnabled) {
				await this.enableServer();
			}
		}
	}

	/**
	 * Guarda la configuración.
	 * 
	 * @private
	 * @returns {Promise<void>}
	 */
	async _saveSettings() {
		await this.plugin.saveData({
			port: this.port,
			sessionFolderPath: this.currentSessionFolder?.path || null,
			serverEnabled: this.serverManager?.isRunning() || false,
			publicUrl: this.tunnelManager?.getPublicUrl() || this.publicUrl || null,
			useBundledCloudflared: this.useBundledCloudflared
		});
	}
}

/**
 * Settings tab for GM Vault Exporter (Tunnel).
 */
class GMVaultSettingTab extends PluginSettingTab {
	constructor(app, plugin, controller) {
		super(app, plugin);
		this.controller = controller;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Use bundled cloudflared only')
			.setDesc('Ignore system cloudflared and use only the plugin\'s copy (downloads automatically if missing). Useful to test the auto-download or to avoid conflicts with the system installation.')
			.addToggle((toggle) => {
				toggle
					.setValue(this.controller.useBundledCloudflared)
					.onChange(async (value) => {
						this.controller.useBundledCloudflared = value;
						await this.controller.saveSettings();
					});
			});
	}
}

