/**
 * @fileoverview Public HTTPS tunnel manager for localhost.
 *
 * Responsibilities:
 * - Create HTTPS tunnel using cloudflared
 * - Auto-download cloudflared if not found
 * - Manage tunnel lifecycle
 * - Provide public URL
 */

import { spawn, execSync } from 'child_process';
import { platform, arch } from 'os';
import { existsSync, mkdirSync, chmodSync, createWriteStream, unlinkSync } from 'fs';
import { join } from 'path';
import https from 'https';

/**
 * Base URL for cloudflared releases.
 */
const CLOUDFLARED_RELEASES_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/**
 * Public HTTPS tunnel manager with auto-download support.
 *
 * @class TunnelManager
 */
export class TunnelManager {
	/**
	 * Creates a TunnelManager instance.
	 *
	 * @param {number} port - Local port to expose
	 * @param {string} pluginDir - Absolute path to plugin directory for storing cloudflared binary
	 * @param {Function} onProgress - Optional callback for progress updates (message: string)
	 */
	constructor(port, pluginDir = null, onProgress = null) {
		/** @type {number} */
		this.port = port;
		
		/** @type {string|null} */
		this.pluginDir = pluginDir;
		
		/** @type {Function|null} */
		this.onProgress = onProgress;
		
		/** @type {any|null} */
		this.tunnel = null;
		
		/** @type {string|null} */
		this.publicUrl = null;
	}

	/**
	 * Reports progress to the callback if set.
	 * @private
	 * @param {string} message - Progress message
	 */
	_reportProgress(message) {
		if (this.onProgress) {
			this.onProgress(message);
		}
		console.log(`[TunnelManager] ${message}`);
	}

	/**
	 * Gets the local binary directory path.
	 * @private
	 * @returns {string|null} Path to bin directory, or null if pluginDir not set
	 */
	_getBinDir() {
		if (!this.pluginDir) return null;
		return join(this.pluginDir, 'bin');
	}

	/**
	 * Gets the expected local cloudflared binary path.
	 * @private
	 * @returns {string|null} Path to cloudflared binary, or null if pluginDir not set
	 */
	_getLocalBinaryPath() {
		const binDir = this._getBinDir();
		if (!binDir) return null;
		
		const os = platform();
		const binaryName = os === 'win32' ? 'cloudflared.exe' : 'cloudflared';
		return join(binDir, binaryName);
	}

	/**
	 * Gets the download URL for the current platform.
	 * @private
	 * @returns {{url: string, needsExtraction: boolean}|null} Download info or null if unsupported
	 */
	_getDownloadInfo() {
		const os = platform();
		const cpuArch = arch();
		
		let filename;
		let needsExtraction = false;
		
		if (os === 'darwin') {
			// macOS - comes as .tgz
			if (cpuArch === 'arm64') {
				filename = 'cloudflared-darwin-arm64.tgz';
			} else {
				filename = 'cloudflared-darwin-amd64.tgz';
			}
			needsExtraction = true;
		} else if (os === 'win32') {
			// Windows - direct .exe
			if (cpuArch === 'x64') {
				filename = 'cloudflared-windows-amd64.exe';
			} else {
				filename = 'cloudflared-windows-386.exe';
			}
		} else if (os === 'linux') {
			// Linux - direct binary
			if (cpuArch === 'arm64') {
				filename = 'cloudflared-linux-arm64';
			} else if (cpuArch === 'x64') {
				filename = 'cloudflared-linux-amd64';
			} else {
				filename = 'cloudflared-linux-386';
			}
		} else {
			return null;
		}
		
		return {
			url: `${CLOUDFLARED_RELEASES_BASE}/${filename}`,
			needsExtraction
		};
	}

	/**
	 * Downloads a file from URL to destination.
	 * @private
	 * @param {string} url - URL to download from
	 * @param {string} destPath - Destination file path
	 * @returns {Promise<void>}
	 */
	_downloadFile(url, destPath) {
		return new Promise((resolve, reject) => {
			const handleResponse = (response) => {
				// Handle redirects (GitHub uses them)
				if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
					https.get(response.headers.location, handleResponse).on('error', reject);
					return;
				}
				
				if (response.statusCode !== 200) {
					reject(new Error(`Download failed with status ${response.statusCode}`));
					return;
				}
				
				const totalSize = parseInt(response.headers['content-length'] || '0', 10);
				let downloadedSize = 0;
				let lastReportedPercent = -1;
				
				const file = createWriteStream(destPath);
				
				response.on('data', (chunk) => {
					downloadedSize += chunk.length;
					if (totalSize > 0) {
						const percent = Math.round((downloadedSize / totalSize) * 100);
						// Solo cuando cambia el porcentaje (se actualiza la misma línea en la barra de estado)
						if (percent !== lastReportedPercent) {
							lastReportedPercent = percent;
							this._reportProgress(`Downloading cloudflared... ${percent}%`);
						}
					}
				});
				
				response.pipe(file);
				
				file.on('finish', () => {
					file.close();
					resolve();
				});
				
				file.on('error', (err) => {
					unlinkSync(destPath);
					reject(err);
				});
			};
			
			https.get(url, handleResponse).on('error', reject);
		});
	}

	/**
	 * Extracts a .tgz file (macOS cloudflared).
	 * @private
	 * @param {string} tgzPath - Path to .tgz file
	 * @param {string} destDir - Destination directory
	 * @returns {Promise<void>}
	 */
	async _extractTgz(tgzPath, destDir) {
		this._reportProgress('Extracting cloudflared...');
		
		// Use tar command (available on macOS)
		return new Promise((resolve, reject) => {
			try {
				execSync(`tar -xzf "${tgzPath}" -C "${destDir}"`, {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe']
				});
				resolve();
			} catch (err) {
				reject(new Error(`Failed to extract cloudflared: ${err.message}`));
			}
		});
	}

	/**
	 * Downloads and installs cloudflared to the plugin directory.
	 * @private
	 * @returns {Promise<string>} Path to the installed binary
	 */
	async _downloadCloudflared() {
		const downloadInfo = this._getDownloadInfo();
		if (!downloadInfo) {
			throw new Error(`Unsupported platform: ${platform()} ${arch()}`);
		}
		
		const binDir = this._getBinDir();
		if (!binDir) {
			throw new Error('Plugin directory not configured for cloudflared download');
		}
		
		// Create bin directory if needed
		if (!existsSync(binDir)) {
			mkdirSync(binDir, { recursive: true });
		}
		
		const localBinaryPath = this._getLocalBinaryPath();
		const os = platform();
		
		this._reportProgress('Downloading cloudflared (first time setup)...');
		
		if (downloadInfo.needsExtraction) {
			// macOS: download .tgz and extract
			const tgzPath = join(binDir, 'cloudflared.tgz');
			
			await this._downloadFile(downloadInfo.url, tgzPath);
			await this._extractTgz(tgzPath, binDir);
			
			// Clean up .tgz
			try {
				unlinkSync(tgzPath);
			} catch (e) {
				// Ignore cleanup errors
			}
		} else {
			// Windows/Linux: download directly
			await this._downloadFile(downloadInfo.url, localBinaryPath);
		}
		
		// Make executable (Unix only)
		if (os !== 'win32' && existsSync(localBinaryPath)) {
			chmodSync(localBinaryPath, 0o755);
		}
		
		// Verify it works
		try {
			execSync(`"${localBinaryPath}" --version`, {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			});
			this._reportProgress('cloudflared installed successfully!');
		} catch (err) {
			throw new Error(`Downloaded cloudflared but it failed to run: ${err.message}`);
		}
		
		return localBinaryPath;
	}

	/**
	 * Finds cloudflared binary - checks system paths and local binary.
	 * Downloads if not found and pluginDir is set.
	 * @private
	 * @param {boolean} useBundledOnly - If true, skip system paths (only use/download plugin bin)
	 * @returns {Promise<string>} Path to cloudflared binary
	 */
	async _ensureCloudflared(useBundledOnly = false) {
		const os = platform();
		
		// 1. Check if local binary exists (plugin directory)
		const localBinaryPath = this._getLocalBinaryPath();
		if (localBinaryPath && existsSync(localBinaryPath)) {
			try {
				execSync(`"${localBinaryPath}" --version`, {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe']
				});
				this._reportProgress('Using local cloudflared');
				return localBinaryPath;
			} catch (e) {
				// Local binary exists but doesn't work, will try system or re-download
			}
		}
		
		// 2. Check system paths (skip if useBundledOnly)
		if (useBundledOnly) {
			if (this.pluginDir) {
				return await this._downloadCloudflared();
			}
			throw new Error(
				'Bundled cloudflared only is enabled but plugin directory is not available. Disable the option in Settings or use system cloudflared.'
			);
		}
		
		const systemPaths = [];
		
		if (os === 'darwin') {
			systemPaths.push('/opt/homebrew/bin/cloudflared');
			systemPaths.push('/usr/local/bin/cloudflared');
		} else if (os === 'linux') {
			systemPaths.push('/usr/local/bin/cloudflared');
			systemPaths.push('/usr/bin/cloudflared');
		} else if (os === 'win32') {
			systemPaths.push('C:\\Program Files\\Cloudflare\\cloudflared.exe');
			systemPaths.push('C:\\Program Files (x86)\\Cloudflare\\cloudflared.exe');
		}
		
		// Try 'which' or 'where' first
		try {
			if (os === 'win32') {
				const result = execSync('where cloudflared.exe', {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore']
				}).trim();
				if (result) {
					this._reportProgress('Using system cloudflared');
					return result.split('\n')[0];
				}
			} else {
				const result = execSync('which cloudflared', {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore']
				}).trim();
				if (result) {
					this._reportProgress('Using system cloudflared');
					return result;
				}
			}
		} catch (e) {
			// Not in PATH
		}
		
		// Try common paths
		for (const path of systemPaths) {
			try {
				execSync(`"${path}" --version`, {
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'ignore']
				});
				this._reportProgress('Using system cloudflared');
				return path;
			} catch (e) {
				// This path doesn't work
			}
		}
		
		// 3. Not found - download if we can
		if (this.pluginDir) {
			return await this._downloadCloudflared();
		}
		
		// 4. Can't download - throw helpful error
		throw new Error(
			'cloudflared not found. Please install it:\n' +
			'• macOS: brew install cloudflared\n' +
			'• Windows: winget install Cloudflare.cloudflared\n' +
			'• Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/'
		);
	}

	/**
	 * Starts the HTTPS tunnel using cloudflared.
	 *
	 * @param {{ useBundledOnly?: boolean }} [options] - useBundledOnly: ignore system cloudflared, use/download only plugin bin
	 * @returns {Promise<string>} Tunnel public URL
	 */
	async start(options = {}) {
		if (this.tunnel) {
			throw new Error('Tunnel is already active');
		}

		const useBundledOnly = options.useBundledOnly === true;
		// Find or download cloudflared
		const command = await this._ensureCloudflared(useBundledOnly);
		this._reportProgress('Starting tunnel...');

		return new Promise((resolve, reject) => {
			// Run cloudflared tunnel
			this.tunnel = spawn(command, [
				'tunnel',
				'--url',
				`http://localhost:${this.port}`
			], {
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: false
			});

			let output = '';
			let errorOutput = '';
			let urlResolved = false;

			// 30 second timeout to get the URL
			let timeoutId;
			
			const tryResolveUrl = (text) => {
				if (urlResolved) return;
				
				// Look for URL in text (cloudflared may show in different formats)
				const urlMatch = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi);
				if (urlMatch && urlMatch.length > 0) {
					this.publicUrl = urlMatch[0].toLowerCase();
					urlResolved = true;
					if (timeoutId) {
						clearTimeout(timeoutId);
					}
					this._reportProgress('Tunnel ready!');
					resolve(this.publicUrl);
				}
			};

			this.tunnel.stdout.on('data', (data) => {
				const text = data.toString();
				output += text;
				tryResolveUrl(text);
			});

			this.tunnel.stderr.on('data', (data) => {
				const text = data.toString();
				errorOutput += text;
				tryResolveUrl(text);
			});

			this.tunnel.on('error', (err) => {
				if (err.code === 'ENOENT') {
					reject(new Error('cloudflared binary not found or not executable.'));
				} else {
					reject(new Error(`Error starting cloudflared: ${err.message}`));
				}
			});

			this.tunnel.on('close', (code) => {
				if (urlResolved) {
					return;
				}
				
				if (code !== 0 && code !== null && !urlResolved) {
					const fullOutput = output + errorOutput;
					let errorMsg = `cloudflared exited with code ${code}`;
					
					if (fullOutput) {
						errorMsg += `\nOutput: ${fullOutput.substring(0, 500)}`;
					}
					
					console.error('cloudflared error:', errorMsg);
					this.tunnel = null;
					this.publicUrl = null;
					
					if (!urlResolved) {
						reject(new Error(errorMsg));
					}
				}
			});

			timeoutId = setTimeout(() => {
				if (!urlResolved) {
					this.tunnel?.kill();
					this.tunnel = null;
					reject(new Error('Timeout waiting for cloudflared URL. Output: ' + (output + errorOutput).substring(0, 500)));
				}
			}, 30000);
		});
	}

	/**
	 * Stops the HTTPS tunnel.
	 *
	 * @returns {Promise<void>}
	 */
	async stop() {
		if (!this.tunnel) {
			return;
		}

		try {
			this.tunnel.kill();
			this.tunnel = null;
			this.publicUrl = null;
		} catch (error) {
			console.error('Error closing tunnel:', error);
		}
	}

	/**
	 * Returns whether the tunnel is active.
	 *
	 * @returns {boolean} true if active
	 */
	isActive() {
		return this.tunnel !== null;
	}

	/**
	 * Gets the tunnel public URL.
	 *
	 * @returns {string|null} Public URL or null if not active
	 */
	getPublicUrl() {
		return this.publicUrl;
	}
}
