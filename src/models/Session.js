/**
 * @fileoverview Modelo de dominio para una Sesión de GM Vault.
 * Representa la estructura completa de una sesión de juego parseada desde Obsidian.
 * 
 * Este modelo es framework-agnóstico y no contiene lógica de Obsidian ni HTTP.
 */

/**
 * Representa una Sesión completa con sus categorías y páginas.
 * 
 * @class Session
 */
export class Session {
	/**
	 * Crea una instancia de Session.
	 * 
	 * @param {string} name - Nombre de la sesión
	 * @param {Category[]} categories - Array de categorías principales
	 */
	constructor(name, categories = []) {
		/** @type {string} */
		this.name = name;
		
		/** @type {Category[]} */
		this.categories = categories;
	}

	/**
	 * Añade una categoría a la sesión.
	 * 
	 * @param {Category} category - Categoría a añadir
	 */
	addCategory(category) {
		this.categories.push(category);
	}
}

