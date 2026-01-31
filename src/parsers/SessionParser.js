/**
 * @fileoverview Parser that scans the Obsidian vault and produces a structure
 * that mirrors the folder and file hierarchy.
 *
 * vault = Obsidian folder structure
 * each page content = .md file content
 */

import { TFile } from 'obsidian';
import { Session } from '../models/Session.js';
import { Category } from '../models/Category.js';
import { Page } from '../models/Page.js';
import { slugify } from '../utils/slugify.js';

/**
 * Parser that converts vault structure into domain models.
 *
 * @class SessionParser
 */
export class SessionParser {
	/**
	 * Creates a SessionParser instance.
	 *
	 * @param {import('obsidian').App} app - Obsidian app instance
	 */
	constructor(app) {
		/** @type {import('obsidian').App} */
		this.app = app;
	}

	/**
	 * Gets the file sort order from Obsidian's configuration.
	 *
	 * @private
	 * @returns {string} Sort order: 'alphabetical', 'alphabeticalReverse', 'byModifiedTime', 'byModifiedTimeReverse', 'byCreatedTime', 'byCreatedTimeReverse'
	 */
	_getFileSortOrder() {
		// Try to get from vault config
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
				// Default to alphabetical
				sorted.sort((a, b) => a.name.localeCompare(b.name));
		}
		
		return sorted;
	}

	/**
	 * Parses the vault from the selected session folder.
	 *
	 * Structure mirrors vault folders and files:
	 * - Folders = categories
	 * - .md files = pages
	 *
	 * @param {import('obsidian').TFolder} sessionFolder - Session folder (entry point)
	 * @returns {Promise<Session>} Parsed session model
	 */
	async parseSession(sessionFolder) {
		const sessionName = sessionFolder.name;
		const session = new Session(sessionName);
		
		// Look for a session file inside the folder (optional, to get H1 name)
		const sessionFile = await this._findSessionFile(sessionFolder);
		
		// Get name for root category
		// If there is a session file, use its first H1; otherwise use folder name
		let rootCategoryName = sessionFile 
			? await this._getRootCategoryName(sessionFile)
			: sessionFolder.name;
		
		// Detect if it's the root folder (empty path, "/" or empty/null/undefined name)
		const folderPath = (sessionFolder.path || '').trim();
		const folderName = (sessionFolder.name || '').trim();
		const isRootFolder = folderPath === '' || folderPath === '/' || folderName === '';
		
		// If name is empty or root folder, use vault name or fallback
		const isEmptyName = !rootCategoryName || 
			(typeof rootCategoryName === 'string' && rootCategoryName.trim() === '');
		
		if (isRootFolder || isEmptyName) {
			rootCategoryName = this._getRootCategoryNameFallback();
		}
		
		// Create root category
		const rootCategory = new Category(rootCategoryName);
		session.addCategory(rootCategory);
		
		// Scan folder and build structure
		await this._scanFolder(sessionFolder, rootCategory, sessionFile);
		
		return session;
	}
	
	/**
	 * Finds a session file inside the folder.
	 * Looks for a .md file with the same name as the folder.
	 *
	 * @private
	 * @param {import('obsidian').TFolder} folder - Folder to search
	 * @returns {Promise<import('obsidian').TFile|null>} Session file found or null
	 */
	async _findSessionFile(folder) {
		for (const child of folder.children || []) {
			if (child instanceof TFile && child.extension === 'md') {
				// If file has same name as folder, it's the session file
				if (child.basename === folder.name) {
					return child;
				}
			}
		}
		return null;
	}
	
	/**
	 * Gets a friendly name for the root category when it's empty.
	 * Uses vault name if available, otherwise "Vault".
	 * @private
	 * @returns {string} Root category name
	 */
	_getRootCategoryNameFallback() {
		try {
			const vaultName = this.app.vault.getName();
			return vaultName && vaultName.trim() !== '' ? vaultName : 'Vault';
		} catch (e) {
			return 'Vault';
		}
	}

	/**
	 * Gets the root category name from the session file.
	 * Looks for the first H1; if none, uses the file name.
	 *
	 * @private
	 * @param {import('obsidian').TFile} sessionFile - Session file
	 * @returns {Promise<string>} Root category name
	 */
	async _getRootCategoryName(sessionFile) {
		const content = await this.app.vault.read(sessionFile);
		const lines = content.split('\n');
		
		// Find first H1
		const h1Regex = /^#\s+(.+)$/;
		for (const line of lines) {
			const match = line.match(h1Regex);
			if (match) {
				return match[1].trim();
			}
		}
		
		// If no H1, use file name
		return sessionFile.basename;
	}
	
	/**
	 * Scans a folder and adds its content to the category.
	 *
	 * @private
	 * @param {import('obsidian').TFolder} folder - Folder to scan
	 * @param {Category} category - Category to add content to
	 * @param {import('obsidian').TFile} sessionFile - Session file (to exclude)
	 */
	async _scanFolder(folder, category, sessionFile) {
		const children = folder.children || [];
		
		// Separate files and folders
		const files = [];
		const folders = [];
		
		for (const child of children) {
			if (child.children !== undefined) {
				folders.push(child);
			} else if (child.extension === 'md') {
				files.push(child);
			}
		}
		
		// Sort each group according to Obsidian's setting
		const sortedFolders = this._sortByObsidianConfig(folders);
		const sortedFiles = this._sortByObsidianConfig(files);
		
		// Obsidian shows folders first, then files
		// Process folders first
		for (const subFolder of sortedFolders) {
			const imageFiles = await this._getImageFiles(subFolder);
			const hasOnlyImages = imageFiles.length > 0 && 
				subFolder.children.filter(c => c instanceof TFile && c.extension === 'md').length === 0 &&
				subFolder.children.filter(c => c.children !== undefined).length === 0;
			
			if (hasOnlyImages) {
				const folderSlug = slugify(subFolder.name);
				const page = new Page(subFolder.name, folderSlug, ['image']);
				category.addPage(page);
			} else {
				const subCategory = new Category(subFolder.name);
				category.addCategory(subCategory);
				
				await this._scanFolder(subFolder, subCategory, sessionFile);
			}
		}
		
		// Then process files
		for (const file of sortedFiles) {
			if (sessionFile && file.path === sessionFile.path) {
				continue;
			}
			
			const pageName = await this._getPageName(file);
			const slug = slugify(file.basename);
			
			const page = new Page(pageName, slug, []);
			category.addPage(page);
		}
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
	 * Gets the page name from the file.
	 * Simplified: uses the file basename directly.
	 *
	 * @private
	 * @param {import('obsidian').TFile} file - Page file
	 * @returns {Promise<string>} Page name
	 */
	async _getPageName(file) {
		return file.basename;
	}
}
