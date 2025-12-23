export class HTTPError extends Error {
	statusCode: number;
	constructor(statusCode: number, message: string) {
		super(message);
		this.statusCode = statusCode;
	}
}

export class BadRequestError extends HTTPError {
	constructor(message: string) {
		super(400, message);
	}
}

export class UserNotAuthenticatedError extends HTTPError {
	constructor(message: string) {
		super(401, message);
	}
}

export class UserForbiddenError extends HTTPError {
	constructor(message: string) {
		super(403, message);
	}
}

export class NotFoundError extends HTTPError {
	constructor(message: string) {
		super(404, message);
	}
}
