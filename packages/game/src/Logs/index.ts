export enum LogLevel {
	Debug = 0,
	Info = 1,
	Warn = 2,
	Error = 3,
	None = 4
}

export interface Logger {
	log(...args: any[]): void
	info(...args: any[]): void
	warn(...args: any[]): void
	error(...args: any[]): void
	debug(...args: any[]): void
}

interface LoggerConfig {
	enabled: boolean
	level: LogLevel
}

export class LogsManager {
	private loggers = new Map<string, Logger>()
	private configs = new Map<string, LoggerConfig>()
	private globalLevel: LogLevel = LogLevel.Info
	private globalEnabled: boolean = true

	/**
	 * Get a logger instance for a manager
	 * The logger is bound to the manager name and automatically prefixes all logs
	 * @param managerName Name of the manager (e.g., 'BuildingManager', 'PopulationManager')
	 * @returns Logger instance with log, error, warn, debug, info methods
	 */
	public getLogger(managerName: string): Logger {
		// Return existing logger if already created
		if (this.loggers.has(managerName)) {
			return this.loggers.get(managerName)!
		}

		// Create new logger instance bound to this manager name
		const logger: Logger = {
			log: (...args: any[]) => this.log(managerName, LogLevel.Info, ...args),
			info: (...args: any[]) => this.log(managerName, LogLevel.Info, ...args),
			warn: (...args: any[]) => this.log(managerName, LogLevel.Warn, ...args),
			error: (...args: any[]) => this.log(managerName, LogLevel.Error, ...args),
			debug: (...args: any[]) => this.log(managerName, LogLevel.Debug, ...args),
		}

		this.loggers.set(managerName, logger)
		
		// Initialize config for this manager (enabled by default, uses global level)
		if (!this.configs.has(managerName)) {
			this.configs.set(managerName, {
				enabled: true,
				level: this.globalLevel
			})
		}

		return logger
	}

	/**
	 * Internal method to handle logging
	 */
	private log(managerName: string, level: LogLevel, ...args: any[]): void {
		// Check if logging is globally disabled
		if (!this.globalEnabled) {
			return
		}

		// Get config for this manager (default to global settings)
		const config = this.configs.get(managerName) || {
			enabled: true,
			level: this.globalLevel
		}

		// Check if this manager's logging is disabled
		if (!config.enabled) {
			return
		}

		// Check if log level is sufficient
		const managerLevel = config.level
		if (level < managerLevel) {
			return
		}

		// Format the log message with manager prefix
		const prefix = `[${managerName}]`
		const formattedArgs = [prefix, ...args]

		// Use appropriate console method based on level
		switch (level) {
			case LogLevel.Debug:
				console.debug(...formattedArgs)
				break
			case LogLevel.Info:
				console.log(...formattedArgs)
				break
			case LogLevel.Warn:
				console.warn(...formattedArgs)
				break
			case LogLevel.Error:
				console.error(...formattedArgs)
				break
		}
	}

	/**
	 * Enable or disable logging for a specific manager
	 * @param managerName Name of the manager
	 * @param enabled Whether logging should be enabled
	 */
	public setManagerEnabled(managerName: string, enabled: boolean): void {
		const config = this.configs.get(managerName) || {
			enabled: true,
			level: this.globalLevel
		}
		config.enabled = enabled
		this.configs.set(managerName, config)
	}

	/**
	 * Set log level for a specific manager
	 * @param managerName Name of the manager
	 * @param level Log level (Debug, Info, Warn, Error, None)
	 */
	public setManagerLevel(managerName: string, level: LogLevel): void {
		const config = this.configs.get(managerName) || {
			enabled: true,
			level: this.globalLevel
		}
		config.level = level
		this.configs.set(managerName, config)
	}

	/**
	 * Enable or disable all logging globally
	 * @param enabled Whether logging should be enabled globally
	 */
	public setGlobalEnabled(enabled: boolean): void {
		this.globalEnabled = enabled
	}

	/**
	 * Set global log level (applies to all managers that don't have a specific level set)
	 * @param level Log level (Debug, Info, Warn, Error, None)
	 */
	public setGlobalLevel(level: LogLevel): void {
		this.globalLevel = level
		// Update all managers that don't have a specific level set
		for (const [managerName, config] of this.configs.entries()) {
			if (config.level === this.globalLevel) {
				config.level = level
			}
		}
	}

	/**
	 * Get current configuration for a manager
	 * @param managerName Name of the manager
	 * @returns Configuration object or null if not found
	 */
	public getManagerConfig(managerName: string): LoggerConfig | null {
		return this.configs.get(managerName) || null
	}

	/**
	 * Get all manager configurations
	 * @returns Map of manager names to their configurations
	 */
	public getAllConfigs(): Map<string, LoggerConfig> {
		return new Map(this.configs)
	}

	/**
	 * Enable logging for multiple managers at once
	 * @param managerNames Array of manager names
	 * @param enabled Whether logging should be enabled
	 */
	public setManagersEnabled(managerNames: string[], enabled: boolean): void {
		for (const managerName of managerNames) {
			this.setManagerEnabled(managerName, enabled)
		}
	}

	/**
	 * Set log level for multiple managers at once
	 * @param managerNames Array of manager names
	 * @param level Log level
	 */
	public setManagersLevel(managerNames: string[], level: LogLevel): void {
		for (const managerName of managerNames) {
			this.setManagerLevel(managerName, level)
		}
	}
}

