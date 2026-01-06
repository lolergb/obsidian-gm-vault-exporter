/**
 * @fileoverview Parser que lee una página de sesión de Obsidian y la convierte
 * en el modelo de dominio Session.
 * 
 * Aplica las convenciones de GM Vault:
 * - Headings (H1/H2) representan categorías
 * - Wiki links bajo un heading representan páginas
 * - Headings especiales: "Tables", "Quotes", "Images", "Enemies"
 */

import { Session } from '../models/Session.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';
import { slugify } from '../utils/slugify.js';

/**
 * Parser que convierte contenido de Obsidian en modelos de dominio.
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
	 * Parsea una página de sesión desde Obsidian y retorna un modelo Session.
	 * 
	 * Versión simplificada y agnóstica: extrae todos los wiki links y los coloca
	 * en una única categoría. El filtrado por títulos se añadirá más adelante.
	 * 
	 * @param {import('obsidian').TFile} file - Archivo de la página de sesión
	 * @returns {Promise<Session>} Modelo de sesión parseado
	 */
	async parseSession(file) {
		const content = await this.app.vault.read(file);
		const sessionName = file.basename;
		
		const session = new Session(sessionName);
		const lines = content.split('\n');
		
		// Crear una única categoría para todas las páginas
		const allPagesCategory = new Category('Pages');
		const seenSlugs = new Set();
		
		// Buscar todos los wiki links en el archivo
		for (const line of lines) {
			// Buscar todos los wiki links en la línea (puede haber múltiples)
			const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
			let match;
			
			while ((match = wikiLinkRegex.exec(line)) !== null) {
				const linkContent = match[1];
				const [linkPath, displayName] = linkContent.includes('|') 
					? linkContent.split('|').map(s => s.trim())
					: [linkContent.trim(), linkContent.trim()];
				
				// Genera slug desde el nombre del link
				const slug = slugify(linkPath);
				
				// Evitar duplicados por slug
				if (seenSlugs.has(slug)) {
					continue;
				}
				seenSlugs.add(slug);
				
				// Crear la página (sin blockTypes por ahora)
				const page = new Page(displayName, slug, []);
				allPagesCategory.addPage(page);
			}
		}
		
		// Solo añadir la categoría si tiene páginas
		if (!allPagesCategory.isEmpty()) {
			session.addCategory(allPagesCategory);
		}
		
		return session;
	}

}

