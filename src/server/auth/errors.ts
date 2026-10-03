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

/**
 * A diferencia de `InvalidCredentialsError`, este sí se distingue del caso
 * genérico — pero solo se lanza DESPUÉS de verificar que la contraseña es
 * correcta (ver `loginUser`), nunca antes: alguien que no tiene la
 * contraseña real no puede usar el mensaje para confirmar que la cuenta
 * existe y está suspendida.
 */
export class AccountSuspendedError extends Error {
  readonly code = "ACCOUNT_SUSPENDED";
  constructor() {
    super("Esta cuenta está suspendida. Contactá a soporte si creés que es un error.");
    this.name = "AccountSuspendedError";
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

/**
 * Cualquier falla técnica del intercambio OAuth con Google — código
 * inválido/vencido, respuesta inesperada del token/userinfo endpoint, o un
 * email de Google sin verificar intentando vincularse a una cuenta con
 * contraseña ya existente. Un solo mensaje genérico: el detalle real va a
 * `console.error` en la ruta, nunca al usuario.
 */
export class GoogleAuthError extends Error {
  readonly code = "GOOGLE_AUTH_FAILED";
  constructor() {
    super("No pudimos completar el inicio de sesión con Google. Probá de nuevo.");
    this.name = "GoogleAuthError";
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

export class InvalidTicketTokenError extends Error {
  readonly code = "INVALID_TICKET_TOKEN";
  constructor() {
    super("No encontramos una conversación con ese enlace");
    this.name = "InvalidTicketTokenError";
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

/** Un ADMIN no puede suspender su propia cuenta por este camino (mismo criterio que `SelfRoleChangeError`). */
export class SelfSuspensionError extends Error {
  readonly code = "SELF_SUSPENSION";
  constructor() {
    super("No podés suspender tu propia cuenta");
    this.name = "SelfSuspensionError";
  }
}

/** ADMIN no se suspende desde este flujo — evita que un ADMIN comprometido bloquee a otro admin, o a sí mismo por error de UI. */
export class CannotSuspendAdminError extends Error {
  readonly code = "CANNOT_SUSPEND_ADMIN";
  constructor() {
    super("No se puede suspender una cuenta ADMIN desde acá");
    this.name = "CannotSuspendAdminError";
  }
}

export class InvalidSuspensionStateError extends Error {
  readonly code = "INVALID_SUSPENSION_STATE";
  constructor(message: string) {
    super(message);
    this.name = "InvalidSuspensionStateError";
  }
}

/** El sitio nunca puede quedar sin ningún ADMIN — última línea de defensa antes del UPDATE, no solo una regla de UI. */
export class LastAdminError extends Error {
  readonly code = "LAST_ADMIN";
  constructor() {
    super("No se puede quitar el único ADMIN que queda — promové a otra persona antes de sacarle este rol.");
    this.name = "LastAdminError";
  }
}

/** Token de invitación a ADMIN inexistente, vencido, ya usado, o revocado — un solo mensaje para los cuatro casos. */
export class InvalidInviteTokenError extends Error {
  readonly code = "INVALID_INVITE_TOKEN";
  constructor() {
    super("Esta invitación no es válida o ya venció.");
    this.name = "InvalidInviteTokenError";
  }
}

/** La invitación es para un email distinto al de la cuenta logueada que intenta aceptarla. */
export class InviteEmailMismatchError extends Error {
  readonly code = "INVITE_EMAIL_MISMATCH";
  constructor() {
    super("Esta invitación es para otra cuenta — iniciá sesión con el email al que se la mandamos.");
    this.name = "InviteEmailMismatchError";
  }
}

export class AdminInvitePendingError extends Error {
  readonly code = "ADMIN_INVITE_PENDING";
  constructor() {
    super("Ya hay una invitación pendiente para este email — usá \"Reenviar\" en la lista de abajo en vez de invitar de nuevo.");
    this.name = "AdminInvitePendingError";
  }
}
