export class SdoAuthenticationRequiredError extends Error {
	constructor() {
		super('SDO authentication required')
		this.name = 'SdoAuthenticationRequiredError'
	}
}

export class SdoPageUnavailableError extends Error {
	constructor() {
		super('SDO page unavailable')
		this.name = 'SdoPageUnavailableError'
	}
}
