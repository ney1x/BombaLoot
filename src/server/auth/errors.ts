/**
 * Errores de autenticación con mensajes deliberadamente genéricos donde
 * corresponde (login, reset). El código interno (`code`) distingue el caso
 * real para logs/telemetría; el mensaje que llega al usuario nunca debe
 * confirmar si un email existe.
 */

export class InvalidCredentialsError extends Error {
  readonly code = "INVALID_CREDENTIALS";
  constructor() {
    super("Email o contraseña incorrectos");
    this.name = "InvalidCredentialsError";
  }
}

export class EmailAlreadyRegisteredError extends Error {
  readonly code = "EMAIL_ALREADY_REGISTERED";
  constructor() {
    // A diferencia del login, en el registro sí se informa el duplicado:
    // el usuario necesita saber que tiene que ir a iniciar sesión en vez de
    // registrarse de nuevo. No es el mismo riesgo de enumeración que el
    // login (acá el propio usuario ya sabe que ese es "su" email).
    super("Ya existe una cuenta con este email");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class InvalidResetTokenError extends Error {
  readonly code = "INVALID_RESET_TOKEN";
  constructor() {
    super("El link de recuperación no es válido o ya venció");
    this.name = "InvalidResetTokenError";
  }
}

export class InvalidCurrentPasswordError extends Error {
  readonly code = "INVALID_CURRENT_PASSWORD";
  constructor() {
    super("La contraseña actual no es correcta");
    this.name = "InvalidCurrentPasswordError";
  }
}

export class OrderAlreadyClaimedError extends Error {
  readonly code = "ORDER_ALREADY_CLAIMED";
  constructor() {
    super("Ese pedido ya está asociado a una cuenta");
    this.name = "OrderAlreadyClaimedError";
  }
}

export class InvalidOrderTokenError extends Error {
  readonly code = "INVALID_ORDER_TOKEN";
  constructor() {
    super("No encontramos un pedido con ese enlace");
    this.name = "InvalidOrderTokenError";
  }
}

/** Sin sesión, o sesión vencida/revocada — para rutas de API admin (no redirige, no hace notFound). */
export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED";
  constructor() {
    super("No autenticado");
    this.name = "UnauthorizedError";
  }
}

/** Sesión válida pero rol insuficiente (CUSTOMER en ruta admin, SUPPORT en ruta solo-ADMIN). */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN";
  constructor() {
    super("No tenés permiso para esta acción");
    this.name = "ForbiddenError";
  }
}

/** Un ADMIN no puede cambiar su propio rol a través del endpoint de gestión de SUPPORT. */
export class SelfRoleChangeError extends Error {
  readonly code = "SELF_ROLE_CHANGE";
  constructor() {
    super("No podés cambiar tu propio rol");
    this.name = "SelfRoleChangeError";
  }
}

/** El usuario objetivo no está en el estado de rol que la operación espera (p.ej. quitar SUPPORT a un CUSTOMER). */
export class InvalidRoleTransitionError extends Error {
  readonly code = "INVALID_ROLE_TRANSITION";
  constructor(message: string) {
    super(message);
    this.name = "InvalidRoleTransitionError";
  }
}

export class TargetUserNotFoundError extends Error {
  readonly code = "TARGET_USER_NOT_FOUND";
  constructor() {
    super("Usuario no encontrado");
    this.name = "TargetUserNotFoundError";
  }
}
