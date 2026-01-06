/**
 * @fileoverview Constructor que convierte modelos de dominio (Session, Category, Page)
 * en el formato JSON esperado por GM Vault.
 * 
 * El JSON resultante sigue el esquema de GM Vault:
 * - categories: array de categorías
 * - Cada categoría tiene name, pages, categories (subcategorías)
 * - Cada página tiene name, url, y opcionalmente blockTypes
 */

import { Session } from '../models/Session.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';

/**
 * Constructor que convierte modelos de dominio a JSON de GM Vault.
 * 
 * @class GMVaultJSONBuilder
 */
export class GMVaultJSONBuilder {
	/**
	 * Crea una instancia de GMVaultJSONBuilder.
	 * 
	 * @param {string} baseUrl - URL base para las páginas (ej: "http://localhost:3000")
	 */
	constructor(baseUrl = 'http://localhost:3000') {
		/** @type {string} */
		this.baseUrl = baseUrl;
	}

	/**
	 * Actualiza la URL base para las páginas.
	 * 
	 * @param {string} baseUrl - Nueva URL base
	 */
	setBaseUrl(baseUrl) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Convierte un modelo Session en JSON compatible con GM Vault.
	 * 
	 * @param {Session} session - Modelo de sesión a convertir
	 * @returns {Object} JSON compatible con GM Vault
	 */
	buildJSON(session) {
		return {
			categories: session.categories.map(category => 
				this._buildCategoryJSON(category)
			)
		};
	}

	/**
	 * Convierte un modelo Category en JSON.
	 * 
	 * @private
	 * @param {Category} category - Categoría a convertir
	 * @returns {Object} JSON de categoría
	 */
	_buildCategoryJSON(category) {
		const json = {
			name: category.name,
			pages: category.pages.map(page => this._buildPageJSON(page)),
			categories: category.categories.map(subCategory => 
				this._buildCategoryJSON(subCategory)
			)
		};

		// Elimina arrays vacíos para mantener el JSON limpio
		if (json.pages.length === 0) {
			delete json.pages;
		}
		if (json.categories.length === 0) {
			delete json.categories;
		}

		return json;
	}

	/**
	 * Convierte un modelo Page en JSON.
	 * 
	 * @private
	 * @param {Page} page - Página a convertir
	 * @returns {Object} JSON de página
	 */
	_buildPageJSON(page) {
		const json = {
			name: page.name,
			url: `${this.baseUrl}/pages/${page.slug}`
		};

		// Añade blockTypes solo si existen
		if (page.blockTypes && page.blockTypes.length > 0) {
			json.blockTypes = page.blockTypes;
		}

		return json;
	}
}

