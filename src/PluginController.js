/**
 * @fileoverview Controlador principal del plugin.
 * 
 * Responsabilidades:
 * - Conectar todos los módulos
 * - Gestionar comandos de Obsidian
 * - Gestionar el estado del plugin
 * - NO contiene lógica de negocio
 */

import { Notice, SuggestModal, TFile } from 'obsidian';
import { ServerManager } from './server/ServerManager.js';
import { TunnelManager } from './server/TunnelManager.js';
import { SessionParser } from './parsers/SessionParser.js';
import { GMVaultJSONBuilder } from './renderers/GMVaultJSONBuilder.js';
import { MarkdownRenderer } from './renderers/MarkdownRenderer.js';
import { slugify } from './utils/slugify.js';

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
		
		/** @type {import('obsidian').TFile|null} */
		this.currentSessionFile = null;
		
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
		this.markdownRenderer = new MarkdownRenderer();
		
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
			name: 'Habilitar acceso a GM Vault',
			callback: () => this.enableServer()
		});
		
		this.plugin.addCommand({
			id: 'disable-gm-vault',
			name: 'Deshabilitar acceso a GM Vault',
			callback: () => this.disableServer()
		});
		
		this.plugin.addCommand({
			id: 'select-session-page',
			name: 'Seleccionar página de sesión',
			callback: () => this.selectSessionPage()
		});
		
		this.plugin.addCommand({
			id: 'show-public-url',
			name: 'Mostrar URL pública del túnel',
			callback: () => this.showPublicUrl()
		});
		
		this.plugin.addCommand({
			id: 'copy-gm-vault-url',
			name: 'Copiar URL GM-vault',
			callback: () => this.copyGmVaultUrl()
		});
	}

	/**
	 * Habilita el servidor HTTP.
	 * 
	 * @returns {Promise<void>}
	 */
	async enableServer() {
		if (!this.currentSessionFile) {
			new Notice('Por favor, selecciona primero una página de sesión usando el comando "Seleccionar página de sesión"');
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
	 * Permite al usuario seleccionar una página de sesión.
	 * 
	 * @returns {Promise<void>}
	 */
	async selectSessionPage() {
		const files = this.app.vault.getMarkdownFiles();
		
		// Usa el archivo activo si existe, sino muestra un selector
		const activeFile = this.app.workspace.getActiveFile();
		
		if (activeFile && activeFile.extension === 'md') {
			this.currentSessionFile = activeFile;
			new Notice(`✅ Página de sesión seleccionada: ${activeFile.basename}`);
			await this._saveSettings();
		} else {
			// Muestra un suggester para seleccionar archivo
			const controller = this;
			
			class FileSuggester extends SuggestModal {
				constructor(app, files) {
					super(app);
					this.files = files;
				}
				
				getSuggestions(query) {
					return this.files.filter(file => 
						file.basename.toLowerCase().includes(query.toLowerCase())
					);
				}
				
				renderSuggestion(file, el) {
					el.createDiv({ text: file.basename });
					el.createDiv({ 
						text: file.path, 
						cls: 'suggestion-description' 
					});
				}
				
				async onChooseSuggestion(file, evt) {
					controller.currentSessionFile = file;
					new Notice(`✅ Página de sesión seleccionada: ${file.basename}`);
					await controller._saveSettings();
				}
			}
			
			new FileSuggester(this.app, files).open();
		}
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
				if (!this.currentSessionFile) {
					this.serverManager.sendJSON(res, { 
						error: 'No hay página de sesión seleccionada' 
					}, 400);
					return;
				}
				
				const session = await this.sessionParser.parseSession(this.currentSessionFile);
				const json = this.jsonBuilder.buildJSON(session);
				
				this.serverManager.sendJSON(res, json);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error al generar JSON: ${error.message}` 
				}, 500);
			}
		});
		
		// GET /pages/:slug → Renderiza Markdown como HTML
		this.serverManager.registerRoute('GET', '/pages/:slug', async (req, res, params) => {
			try {
				const slug = params.slug;
				
				// Busca el archivo por slug
				const file = await this._findFileBySlug(slug);
				
				if (!file) {
					this.serverManager.sendJSON(res, { 
						error: `Página no encontrada: ${slug}` 
					}, 404);
					return;
				}
				
				const markdown = await this.app.vault.read(file);
				const html = this.markdownRenderer.renderPage(markdown, file.basename);
				
				this.serverManager.sendHTML(res, html);
			} catch (error) {
				this.serverManager.sendJSON(res, { 
					error: `Error al renderizar página: ${error.message}` 
				}, 500);
			}
		});
	}

	/**
	 * Busca un archivo por su slug.
	 * 
	 * @private
	 * @param {string} slug - Slug a buscar
	 * @returns {Promise<import('obsidian').TFile|null>} Archivo encontrado o null
	 */
	async _findFileBySlug(slug) {
		const files = this.app.vault.getMarkdownFiles();
		
		// Busca por slug normalizado
		for (const file of files) {
			const fileSlug = slugify(file.basename);
			if (fileSlug === slug || file.basename.toLowerCase() === slug) {
				return file;
			}
		}
		
		return null;
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
			
			if (data.sessionFilePath) {
				const file = this.app.vault.getAbstractFileByPath(data.sessionFilePath);
				if (file && file instanceof TFile) {
					this.currentSessionFile = file;
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
			sessionFilePath: this.currentSessionFile?.path || null,
			serverEnabled: this.serverManager?.isRunning() || false,
			publicUrl: this.tunnelManager?.getPublicUrl() || this.publicUrl || null
		});
	}
}

