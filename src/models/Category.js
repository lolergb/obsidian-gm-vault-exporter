/**
 * @fileoverview Modelo de dominio para una Categoría (carpeta) en GM Vault.
 * Las categorías pueden contener páginas y subcategorías.
 */

/**
 * Representa una Categoría (carpeta) que agrupa páginas y subcategorías.
 * 
 * @class Category
 */
export class Category {
	/**
	 * Crea una instancia de Category.
	 * 
	 * @param {string} name - Nombre de la categoría
	 * @param {Page[]} pages - Array de páginas en esta categoría
	 * @param {Category[]} categories - Array de subcategorías
	 */
	constructor(name, pages = [], categories = []) {
		/** @type {string} */
		this.name = name;
		
		/** @type {Page[]} */
		this.pages = pages;
		
		/** @type {Category[]} */
		this.categories = categories;
		
		/** @type {string[]} */
		this.blockTypes = [];
	}

	/**
	 * Añade una página a esta categoría.
	 * 
	 * @param {Page} page - Página a añadir
	 */
	addPage(page) {
		this.pages.push(page);
	}

	/**
	 * Añade una subcategoría a esta categoría.
	 * 
	 * @param {Category} category - Subcategoría a añadir
	 */
	addCategory(category) {
		this.categories.push(category);
	}

	/**
	 * Verifica si la categoría está vacía (sin páginas ni subcategorías).
	 * 
	 * @returns {boolean} true si está vacía
	 */
	isEmpty() {
		return this.pages.length === 0 && this.categories.length === 0;
	}
}

