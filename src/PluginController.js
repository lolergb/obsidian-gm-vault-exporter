/**
 * @fileoverview Controlador principal del plugin.
 * 
 * Responsabilidades:
 * - Conectar todos los módulos
 * - Gestionar comandos de Obsidian
 * - Gestionar el estado del plugin
 * - NO contiene lógica de negocio
 */

import { Notice, SuggestModal, TFile, TFolder } from 'obsidian';
import { slugify } from './utils/slugify.js';
import { ServerManager } from './server/ServerManager.js';
import { TunnelManager } from './server/TunnelManager.js';
import { SessionParser } from './parsers/SessionParser.js';
import { GMVaultJSONBuilder } from './renderers/GMVaultJSONBuilder.js';
import { MarkdownRenderer } from './renderers/MarkdownRenderer.js';
import { VaultExporter } from './exporters/VaultExporter.js';

/**
 * Controlador principal que orquesta todos los módulos del plugin.
 * 
 * @class PluginController
 */
export class PluginController {
	/**
	 * Crea una instancia de PluginController.
	 * 
	 * @param {import('obsidian').App} app - Aplicación de Obsidian
	 * @param {import('obsidian').Plugin} plugin - Instancia del plugin
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
	}

	/**
	 * Inicializa el plugin y registra comandos.
	 * 
	 * @returns {Promise<void>}
	 */
	async initialize() {
		// Inicializa módulos
		this.serverManager = new ServerManager(this.port);
		this.tunnelManager = new TunnelManager(this.port);
		this.sessionParser = new SessionParser(this.app);
		this.jsonBuilder = new GMVaultJSONBuilder(`http://localhost:${this.port}`);
		this.markdownRenderer = new MarkdownRenderer(`http://localhost:${this.port}`);
		this.vaultExporter = new VaultExporter(this.app);
		
		// Registra comandos de Obsidian
		this._registerCommands();
		
		// Carga configuración guardada
		await this._loadSettings();
	}

	/**
	 * Limpia recursos cuando el plugin se desactiva.
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
	 * Registra comandos de Obsidian.
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
			new Notice('Por favor, selecciona primero una carpeta de sesión usando el comando "Seleccionar carpeta de sesión"');
			return;
		}

		try {
			// Inicia el servidor local
			await this.serverManager.start();
			this._registerRoutes();
			
			// Esperar un momento para asegurar que el servidor esté listo
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Inicia el túnel HTTPS público
			new Notice('⏳ Creando túnel HTTPS público...');
			const publicUrl = await this.tunnelManager.start();
			this.publicUrl = publicUrl;
			
			// Actualiza la URL base del JSON builder para usar la URL pública
			this.jsonBuilder.setBaseUrl(publicUrl);
			
			// Actualiza la URL base del renderer para usar la URL pública
			this.markdownRenderer.setBaseUrl(publicUrl);
			
			// Notifica al usuario con la URL HTTPS pública (principal)
			new Notice(`✅ Acceso a GM Vault habilitado (HTTPS):\n${publicUrl}\n\nUsa esta URL en GM Vault:\n${publicUrl}/gm-vault`, 10000);
			
			await this._saveSettings();
		} catch (error) {
			new Notice(`❌ Error al iniciar el servidor: ${error.message}`);
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
			
			new Notice('✅ Acceso a GM Vault deshabilitado');
			
			await this._saveSettings();
		} catch (error) {
			new Notice(`❌ Error al detener el servidor: ${error.message}`);
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
			new Notice('❌ No hay túnel activo. Ejecuta "Habilitar acceso a GM Vault" primero.');
			return;
		}
		
		// Muestra la URL HTTPS en un notice con más tiempo
		new Notice(`🌐 URL HTTPS pública del túnel:\n${url}\n\n• JSON para GM Vault: ${url}/gm-vault\n• Páginas: ${url}/pages/:slug`, 10000);
		
		// También la copia al portapapeles si es posible
		if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(url);
				new Notice('✅ URL copiada al portapapeles');
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
			new Notice('❌ No hay túnel activo. Ejecuta "Habilitar acceso a GM Vault" primero.');
			return;
		}
		
		const gmVaultUrl = `${url}/gm-vault`;
		
		if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(gmVaultUrl);
				new Notice(`✅ URL GM-vault copiada al portapapeles:\n${gmVaultUrl}`);
			} catch (e) {
				new Notice(`❌ Error al copiar al portapapeles: ${e.message}`);
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
			new Notice('❌ Por favor, selecciona primero una carpeta de sesión');
			return;
		}

		try {
			new Notice('⏳ Exportando vault...');
			
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
			
			new Notice(`✅ Vault exportado correctamente!\n\n📁 ${fileName}\n📊 ${pageCount} páginas\n💾 ${sizeKB} KB\n\n💡 Nota: Las imágenes locales se omiten. Usa URLs externas para incluir imágenes.\n\nImporta este archivo en GM Vault`, 10000);
			
		} catch (error) {
			console.error('Error exportando vault:', error);
			new Notice(`❌ Error al exportar: ${error.message}`);
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
				this.setPlaceholder('Escribe para filtrar carpetas...');
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
				new Notice(`✅ Carpeta de sesión seleccionada: ${folder.path}`);
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
						error: 'No hay carpeta de sesión seleccionada' 
					}, 400);
					return;
				}
				
				const session = await this.sessionParser.parseSession(this.currentSessionFolder);
				const json = this.jsonBuilder.buildJSON(session);
				
				this.serverManager.sendJSON(res, json);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error al generar JSON: ${error.message}` 
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
						error: `Página no encontrada: ${slug}` 
					}, 404);
					return;
				}
				
				const markdown = await this.app.vault.read(file);
				// Usar la URL pública si está disponible, sino la URL local
				const baseUrl = this.publicUrl || this.tunnelManager?.getPublicUrl() || `http://localhost:${this.port}`;
				const html = this.markdownRenderer.renderPage(markdown, file.basename, baseUrl);
				
				this.serverManager.sendHTML(res, html);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error al renderizar página: ${error.message}` 
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
						error: 'Path de imagen no especificado' 
					}, 400);
					return;
				}
				
				const file = this.app.vault.getAbstractFileByPath(imagePath);
				
				if (!file || !(file instanceof TFile)) {
					this.serverManager.sendJSON(res, { 
						error: `Imagen no encontrada: ${imagePath}`,
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
						error: `No es un archivo de imagen: ${imagePath}` 
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
					error: `Error al servir imagen: ${error.message}` 
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
	 * Obtiene los archivos de imagen de una carpeta y retorna información para el renderer.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta a escanear
	 * @returns {Promise<Array<{name: string, path: string}>>} Array de objetos con nombre y ruta
	 */
	async _getImageFilesFromFolder(folder) {
		const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
		const images = [];
		const baseUrl = this.publicUrl || this.tunnelManager?.getPublicUrl() || `http://localhost:${this.port}`;
		
		for (const child of folder.children || []) {
			if (child instanceof TFile) {
				const ext = child.extension.toLowerCase();
				if (imageExtensions.includes(ext)) {
					// Codificar el path para la URL (encodeURI codifica espacios pero mantiene las barras)
					// Necesitamos codificar cada segmento del path por separado
					const pathSegments = child.path.split('/');
					const encodedSegments = pathSegments.map(segment => encodeURIComponent(segment));
					const encodedPath = encodedSegments.join('/');
					
					images.push({
						name: child.name,
						path: `${baseUrl}/images/${encodedPath}`
					});
				}
			}
		}
		
		return images.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Carga la configuración guardada.
	 * 
	 * @private
	 * @returns {Promise<void>}
	 */
	async _loadSettings() {
		const data = await this.plugin.loadData();
		
		if (data) {
			this.port = data.port || 3000;
			this.publicUrl = data.publicUrl || null;
			
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
			publicUrl: this.tunnelManager?.getPublicUrl() || this.publicUrl || null
		});
	}
}

