/**
 * @fileoverview Constructor que convierte modelos de dominio (Session, Category, Page)
 * en el formato JSON esperado por GM Vault.
 * 
 * El JSON resultante sigue el esquema de GM Vault (formato items[]):
 * - categories: array de categorías raíz
 * - Cada categoría tiene name e items[]
 * - Cada item tiene type ('page' o 'category'), name, y propiedades específicas
 * - Las páginas tienen url, y opcionalmente blockTypes, visibleToPlayers
 * - Las categorías tienen items[] (recursivo)
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
	 * Usa el nuevo formato items[] para simplicidad y orden implícito.
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
	 * Convierte un modelo Category en JSON con formato items[].
	 * 
	 * @private
	 * @param {Category} category - Categoría a convertir
	 * @returns {Object} JSON de categoría
	 */
	_buildCategoryJSON(category) {
		const items = [];

		// Añadir páginas como items de tipo 'page'
		for (const page of category.pages) {
			items.push(this._buildPageItemJSON(page));
		}

		// Añadir subcategorías como items de tipo 'category'
		for (const subCategory of category.categories) {
			items.push(this._buildCategoryItemJSON(subCategory));
		}

		const json = {
			name: category.name
		};

		// Solo añadir items si hay contenido
		if (items.length > 0) {
			json.items = items;
		}

		return json;
	}

	/**
	 * Convierte un modelo Page en un item JSON de tipo 'page'.
	 * 
	 * @private
	 * @param {Page} page - Página a convertir
	 * @returns {Object} JSON de item página
	 */
	_buildPageItemJSON(page) {
		const item = {
			type: 'page',
			name: page.name,
			url: `${this.baseUrl}/pages/${page.slug}`
		};

		// Añade propiedades opcionales solo si existen
		if (page.blockTypes && page.blockTypes.length > 0) {
			item.blockTypes = page.blockTypes;
		}

		if (page.visibleToPlayers) {
			item.visibleToPlayers = true;
		}

		return item;
	}

	/**
	 * Convierte un modelo Category en un item JSON de tipo 'category'.
	 * 
	 * @private
	 * @param {Category} category - Categoría a convertir
	 * @returns {Object} JSON de item categoría
	 */
	_buildCategoryItemJSON(category) {
		const items = [];

		// Añadir páginas como items de tipo 'page'
		for (const page of category.pages) {
			items.push(this._buildPageItemJSON(page));
		}

		// Añadir subcategorías recursivamente
		for (const subCategory of category.categories) {
			items.push(this._buildCategoryItemJSON(subCategory));
		}

		const item = {
			type: 'category',
			name: category.name
		};

		// Solo añadir items si hay contenido
		if (items.length > 0) {
			item.items = items;
		}

		return item;
	}

	// ============================================
	// MÉTODOS DE COMPATIBILIDAD (formato legacy)
	// ============================================

	/**
	 * Convierte un modelo Session en JSON formato legacy.
	 * Útil para compatibilidad con versiones anteriores de GM Vault.
	 * 
	 * @param {Session} session - Modelo de sesión a convertir
	 * @returns {Object} JSON compatible con GM Vault (formato legacy)
	 */
	buildLegacyJSON(session) {
		return {
			categories: session.categories.map(category => 
				this._buildLegacyCategoryJSON(category)
			)
		};
	}

	/**
	 * Convierte un modelo Category en JSON formato legacy.
	 * 
	 * @private
	 * @param {Category} category - Categoría a convertir
	 * @returns {Object} JSON de categoría (formato legacy)
	 */
	_buildLegacyCategoryJSON(category) {
		const json = {
			name: category.name,
			pages: category.pages.map(page => this._buildLegacyPageJSON(page)),
			categories: category.categories.map(subCategory => 
				this._buildLegacyCategoryJSON(subCategory)
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
	 * Convierte un modelo Page en JSON formato legacy.
	 * 
	 * @private
	 * @param {Page} page - Página a convertir
	 * @returns {Object} JSON de página (formato legacy)
	 */
	_buildLegacyPageJSON(page) {
		const json = {
			name: page.name,
			url: `${this.baseUrl}/pages/${page.slug}`
		};

		if (page.blockTypes && page.blockTypes.length > 0) {
			json.blockTypes = page.blockTypes;
		}

		if (page.visibleToPlayers) {
			json.visibleToPlayers = true;
		}

		return json;
	}
}

