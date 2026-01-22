/**
 * @fileoverview Parser que escanea el vault de Obsidian y genera una estructura
 * que refleja exactamente la jerarquía de carpetas y archivos.
 * 
 * vault = estructura de carpetas de Obsidian
 * contenido de cada página = contenido del archivo .md
 */

import { TFile } from 'obsidian';
import { Session } from '../models/Session.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';
import { slugify } from '../utils/slugify.js';

/**
 * Parser que convierte la estructura del vault en modelos de dominio.
 * 
 * @class SessionParser
 */
export class SessionParser {
	/**
	 * Crea una instancia de SessionParser.
	 * 
	 * @param {import('obsidian').App} app - Instancia de la app de Obsidian
	 */
	constructor(app) {
		/** @type {import('obsidian').App} */
		this.app = app;
	}

	/**
	 * Parsea el vault desde la carpeta de sesión seleccionada.
	 * 
	 * La estructura refleja exactamente las carpetas y archivos del vault:
	 * - Carpetas = categorías
	 * - Archivos .md = páginas
	 * 
	 * @param {import('obsidian').TFolder} sessionFolder - Carpeta de sesión (punto de entrada)
	 * @returns {Promise<Session>} Modelo de sesión parseado
	 */
	async parseSession(sessionFolder) {
		const sessionName = sessionFolder.name;
		const session = new Session(sessionName);
		
		// Buscar un archivo de sesión dentro de la carpeta (opcional, para obtener el nombre del H1)
		const sessionFile = await this._findSessionFile(sessionFolder);
		
		// Obtener el nombre para la categoría raíz
		// Si hay un archivo de sesión, usar su primer H1, sino usar el nombre de la carpeta
		const rootCategoryName = sessionFile 
			? await this._getRootCategoryName(sessionFile)
			: sessionFolder.name;
		
		// Crear la categoría raíz
		const rootCategory = new Category(rootCategoryName);
		session.addCategory(rootCategory);
		
		// Escanear la carpeta y construir la estructura
		await this._scanFolder(sessionFolder, rootCategory, sessionFile);
		
		return session;
	}
	
	/**
	 * Busca un archivo de sesión dentro de la carpeta.
	 * Busca un archivo .md con el mismo nombre que la carpeta.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta donde buscar
	 * @returns {Promise<import('obsidian').TFile|null>} Archivo de sesión encontrado o null
	 */
	async _findSessionFile(folder) {
		for (const child of folder.children || []) {
			if (child instanceof TFile && child.extension === 'md') {
				// Si el archivo tiene el mismo nombre que la carpeta, es el archivo de sesión
				if (child.basename === folder.name) {
					return child;
				}
			}
		}
		return null;
	}
	
	/**
	 * Obtiene el nombre para la categoría raíz desde el archivo de sesión.
	 * Busca el primer H1, si no existe usa el nombre del archivo.
	 * 
	 * @private
	 * @param {import('obsidian').TFile} sessionFile - Archivo de sesión
	 * @returns {Promise<string>} Nombre de la categoría raíz
	 */
	async _getRootCategoryName(sessionFile) {
		const content = await this.app.vault.read(sessionFile);
		const lines = content.split('\n');
		
		// Buscar el primer H1
		const h1Regex = /^#\s+(.+)$/;
		for (const line of lines) {
			const match = line.match(h1Regex);
			if (match) {
				return match[1].trim();
			}
		}
		
		// Si no hay H1, usar el nombre del archivo
		return sessionFile.basename;
	}
	
	/**
	 * Escanea una carpeta y añade su contenido a la categoría.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta a escanear
	 * @param {Category} category - Categoría donde añadir el contenido
	 * @param {import('obsidian').TFile} sessionFile - Archivo de sesión (para excluirlo)
	 */
	async _scanFolder(folder, category, sessionFile) {
		const children = folder.children || [];
		
		// Separar archivos y carpetas
		const files = [];
		const folders = [];
		
		for (const child of children) {
			if (child.children !== undefined) {
				// Es una carpeta (TFolder tiene .children)
				folders.push(child);
			} else if (child.extension === 'md') {
				// Es un archivo markdown
				files.push(child);
			}
		}
		
		// Ordenar alfabéticamente
		files.sort((a, b) => a.name.localeCompare(b.name));
		folders.sort((a, b) => a.name.localeCompare(b.name));
		
		// Añadir archivos como páginas (excepto el archivo de sesión si existe)
		for (const file of files) {
			// Excluir el archivo de sesión si existe
			if (sessionFile && file.path === sessionFile.path) {
				continue;
			}
			
			// Obtener el nombre de la página (puede ser el primer H1 del archivo)
			const pageName = await this._getPageName(file);
			const slug = slugify(file.basename);
			
			const page = new Page(pageName, slug, []);
			category.addPage(page);
		}
		
		// Añadir carpetas como subcategorías o páginas especiales (si solo tienen imágenes)
		for (const subFolder of folders) {
			// Verificar si la carpeta solo contiene imágenes
			const imageFiles = await this._getImageFiles(subFolder);
			const hasOnlyImages = imageFiles.length > 0 && 
				subFolder.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
				subFolder.children.filter(c => c.children !== undefined).length === 0;
			
			if (hasOnlyImages) {
				// Crear una página especial para la carpeta de imágenes
				const folderSlug = slugify(subFolder.name);
				const page = new Page(subFolder.name, folderSlug, ['image']);
				category.addPage(page);
			} else {
				// Carpeta normal: crear subcategoría
				const subCategory = new Category(subFolder.name);
				category.addCategory(subCategory);
				
				// Escanear recursivamente
				await this._scanFolder(subFolder, subCategory, sessionFile);
			}
		}
	}
	
	/**
	 * Obtiene los archivos de imagen de una carpeta.
	 * 
	 * @private
	 * @param {import('obsidian').TFolder} folder - Carpeta a escanear
	 * @returns {Promise<import('obsidian').TFile[]>} Array de archivos de imagen
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
		
		return imageFiles.sort((a, b) => a.name.localeCompare(b.name));
	}

	/**
	 * Obtiene el nombre de una página desde el archivo.
	 * Busca el primer H1, si no existe usa el nombre del archivo.
	 * 
	 * @private
	 * @param {import('obsidian').TFile} file - Archivo de la página
	 * @returns {Promise<string>} Nombre de la página
	 */
	async _getPageName(file) {
		try {
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			// Buscar el primer H1
			const h1Regex = /^#\s+(.+)$/;
			for (const line of lines) {
				const match = line.match(h1Regex);
				if (match) {
					// Limpiar el nombre (remover wiki links si los hay)
					let name = match[1].trim();
					name = name.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1');
					return name;
				}
			}
		} catch (e) {
			// Si hay error leyendo el archivo, usar el nombre del archivo
		}
		
		// Si no hay H1, usar el nombre del archivo (sin extensión)
		return file.basename;
	}
}
