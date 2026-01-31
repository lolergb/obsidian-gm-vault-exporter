/**
 * @fileoverview Builder that converts domain models (Session, Category, Page)
 * into the JSON format expected by GM Vault.
 *
 * The resulting JSON follows the GM Vault schema (items[] format):
 * - categories: array of root categories
 * - Each category has name and items[]
 * - Each item has type ('page' or 'category'), name, and specific properties
 * - Pages have url, and optionally blockTypes, visibleToPlayers
 * - Categories have items[] (recursive)
 */

import { Session } from '../models/Session.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';

/**
 * Builder that converts domain models to GM Vault JSON.
 *
 * @class GMVaultJSONBuilder
 */
export class GMVaultJSONBuilder {
	/**
	 * Creates a GMVaultJSONBuilder instance.
	 *
	 * @param {string} baseUrl - Base URL for pages (e.g. "http://localhost:3000")
	 */
	constructor(baseUrl = 'http://localhost:3000') {
		/** @type {string} */
		this.baseUrl = baseUrl;
	}

	/**
	 * Updates the base URL for pages.
	 *
	 * @param {string} baseUrl - New base URL
	 */
	setBaseUrl(baseUrl) {
		this.baseUrl = baseUrl;
	}

	/**
	 * Converts a Session model to GM Vault–compatible JSON.
	 * Uses the items[] format for simplicity and implicit order.
	 *
	 * @param {Session} session - Session model to convert
	 * @returns {Object} GM Vault–compatible JSON
	 */
	buildJSON(session) {
		return {
			categories: session.categories.map(category => 
				this._buildCategoryJSON(category)
			)
		};
	}

	/**
	 * Converts a Category model to JSON with items[] format.
	 *
	 * @private
	 * @param {Category} category - Category to convert
	 * @returns {Object} Category JSON
	 */
	_buildCategoryJSON(category) {
		const items = [];

		// Add subcategories first (folders before files, like Obsidian)
		for (const subCategory of category.categories) {
			items.push(this._buildCategoryItemJSON(subCategory));
		}

		// Then add pages
		for (const page of category.pages) {
			items.push(this._buildPageItemJSON(page));
		}

		const json = {
			name: category.name
		};

		// Only add items if there is content
		if (items.length > 0) {
			json.items = items;
		}

		return json;
	}

	/**
	 * Converts a Page model to a JSON item of type 'page'.
	 *
	 * @private
	 * @param {Page} page - Page to convert
	 * @returns {Object} Page item JSON
	 */
	_buildPageItemJSON(page) {
		const item = {
			type: 'page',
			name: page.name,
			url: `${this.baseUrl}/pages/${page.slug}`
		};

		// Add optional properties only if they exist
		if (page.blockTypes && page.blockTypes.length > 0) {
			item.blockTypes = page.blockTypes;
		}

		if (page.visibleToPlayers) {
			item.visibleToPlayers = true;
		}

		return item;
	}

	/**
	 * Converts a Category model to a JSON item of type 'category'.
	 * 
	 * @private
	 * @param {Category} category - Category to convert
	 * @returns {Object} JSON de item categoría
	 */
	_buildCategoryItemJSON(category) {
		const items = [];

		// Add subcategories first (folders before files, like Obsidian)
		for (const subCategory of category.categories) {
			items.push(this._buildCategoryItemJSON(subCategory));
		}

		// Then add pages
		for (const page of category.pages) {
			items.push(this._buildPageItemJSON(page));
		}

		const item = {
			type: 'category',
			name: category.name
		};

		// Only add items if there is content
		if (items.length > 0) {
			item.items = items;
		}

		return item;
	}

	// ============================================
	// MÉTODOS DE COMPATIBILIDAD (formato legacy)
	// ============================================

	/**
	 * Converts a Session model to legacy JSON format.
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
	 * Converts a Category model to legacy JSON format.
	 * 
	 * @private
	 * @param {Category} category - Category to convert
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
	 * Converts a Page model to legacy JSON format.
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

