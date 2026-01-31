/**
 * @fileoverview Local HTTP server manager.
 *
 * Responsibilities:
 * - Start/stop HTTP server on localhost
 * - Manage server lifecycle
 * - Register routes
 * - No domain logic
 */

import http from 'http';
import { URL } from 'url';

/**
 * Local HTTP server manager.
 *
 * @class ServerManager
 */
export class ServerManager {
	/**
	 * Creates a ServerManager instance.
	 *
	 * @param {number} port - Port to listen on (default 3000)
	 */
	constructor(port = 3000) {
		/** @type {number} */
		this.port = port;
		
		/** @type {http.Server|null} */
		this.server = null;
		
		/** @type {Map<string, Function>} */
		this.routes = new Map();
	}

	/**
	 * Starts the HTTP server.
	 *
	 * @returns {Promise<void>}
	 */
	async start() {
		if (this.server) {
			throw new Error('Server is already running');
		}

		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				this._handleRequest(req, res);
			});

			this.server.listen(this.port, '127.0.0.1', () => {
				resolve();
			});

			this.server.on('error', (err) => {
				if (err.code === 'EADDRINUSE') {
					reject(new Error(`Port ${this.port} is already in use`));
				} else {
					reject(err);
				}
			});
		});
	}

	/**
	 * Stops the HTTP server.
	 *
	 * @returns {Promise<void>}
	 */
	async stop() {
		if (!this.server) {
			return;
		}

		return new Promise((resolve) => {
			this.server.close(() => {
				this.server = null;
				resolve();
			});
		});
	}

	/**
	 * Returns whether the server is running.
	 *
	 * @returns {boolean} true if running
	 */
	isRunning() {
		return this.server !== null;
	}

	/**
	 * Registers a route with its handler.
	 *
	 * @param {string} method - HTTP method (GET, POST, etc.)
	 * @param {string} path - Path (may include params like :slug)
	 * @param {Function} handler - Handler function(req, res, params)
	 */
	registerRoute(method, path, handler) {
		const key = `${method}:${path}`;
		this.routes.set(key, handler);
	}

	/**
	 * Handles an incoming HTTP request.
	 *
	 * @private
	 * @param {http.IncomingMessage} req - Request
	 * @param {http.ServerResponse} res - Response
	 */
	_handleRequest(req, res) {
		this._setCORSHeaders(res, req);

		// Handle preflight OPTIONS
		if (req.method === 'OPTIONS') {
			res.writeHead(200);
			res.end();
			return;
		}

		const url = new URL(req.url, `http://${req.headers.host}`);
		const method = req.method;
		const pathname = url.pathname;

		// Find matching route
		const handler = this._findRoute(method, pathname);
		
		if (handler) {
			const params = this._extractParams(method, pathname, handler.route);
			handler.fn(req, res, params);
		} else {
			this._sendError(res, 404, 'Route not found');
		}
	}

	/**
	 * Finds the route that matches the path.
	 *
	 * @private
	 * @param {string} method - HTTP method
	 * @param {string} pathname - URL path
	 * @returns {Object|null} Handler found or null
	 */
	_findRoute(method, pathname) {
		for (const [key, fn] of this.routes.entries()) {
			// Split only on first ':' to avoid breaking params like :slug
			const colonIndex = key.indexOf(':');
			const routeMethod = key.substring(0, colonIndex);
			const routePath = key.substring(colonIndex + 1);
			
			if (routeMethod !== method) {
				continue;
			}

			// Convert route to regex
			const regex = this._routeToRegex(routePath);
			const match = pathname.match(regex);
			
			if (match) {
				return { fn, route: routePath };
			}
		}
		
		return null;
	}

	/**
	 * Converts a route with params to regex.
	 *
	 * @private
	 * @param {string} route - Route with params (e.g. "/pages/:slug")
	 * @returns {RegExp} Regex for matching
	 */
	_routeToRegex(route) {
		// If route ends with /*, capture everything after
		if (route.endsWith('/*')) {
			const basePattern = route.slice(0, -2).replace(/\//g, '\\/');
			return new RegExp(`^${basePattern}/.*$`);
		}
		
		const pattern = route
			.replace(/\//g, '\\/')
			.replace(/:(\w+)/g, '([^/]+)');
		return new RegExp(`^${pattern}$`);
	}

	/**
	 * Extracts params from the URL according to the route.
	 *
	 * @private
	 * @param {string} method - HTTP method
	 * @param {string} pathname - URL path
	 * @param {string} route - Route with params
	 * @returns {Object} Object with extracted params
	 */
	_extractParams(method, pathname, route) {
		const params = {};
		const paramNames = [];
		
		// Extract param names from route
		const paramMatches = route.matchAll(/:(\w+)/g);
		for (const match of paramMatches) {
			paramNames.push(match[1]);
		}
		
		// Extract values from URL
		const regex = this._routeToRegex(route);
		const match = pathname.match(regex);
		
		if (match) {
			for (let i = 0; i < paramNames.length; i++) {
				params[paramNames[i]] = match[i + 1];
			}
		}
		
		return params;
	}

	/**
	 * Sets CORS headers.
	 *
	 * @private
	 * @param {http.ServerResponse} res - Response
	 * @param {http.IncomingMessage} req - Request (optional, for private network detection)
	 */
	_setCORSHeaders(res, req = null) {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
		res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight 24h
		
		// Private Network Access (Chrome/modern browsers)
		res.setHeader('Access-Control-Allow-Private-Network', 'true');
		
		// NOTE: In production, restrict origin:
		// res.setHeader('Access-Control-Allow-Origin', 'https://owlbear.rodeo');
	}

	/**
	 * Sends an error response.
	 *
	 * @private
	 * @param {http.ServerResponse} res - Response
	 * @param {number} statusCode - HTTP status code
	 * @param {string} message - Error message
	 */
	_sendError(res, statusCode, message) {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: message }));
	}

	/**
	 * Sends a JSON response.
	 *
	 * @param {http.ServerResponse} res - Response
	 * @param {Object} data - Data to send
	 * @param {number} statusCode - Status code (default 200)
	 */
	sendJSON(res, data, statusCode = 200) {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data, null, 2));
	}

	/**
	 * Sends an HTML response.
	 *
	 * @param {http.ServerResponse} res - Response
	 * @param {string} html - HTML to send
	 * @param {number} statusCode - Status code (default 200)
	 */
	sendHTML(res, html, statusCode = 200) {
		res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
		res.end(html);
	}
}

