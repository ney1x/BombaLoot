/**
 * Conveniencia local para invitados: guarda el link de acceso de cada
 * ticket creado en este navegador, para que `/ayuda` pueda ofrecer "volver
 * a tu conversación" sin que el invitado tenga que guardar el link a mano.
 *
 * El token en sí YA vive en la URL del ticket (es la prueba de propiedad
 * real, igual que el pedido) — esto es solo una lista local de accesos
 * directos, nunca la fuente de autorización. Documentado en la Política de
 * Cookies (sección de almacenamiento local).
 */

export interface SavedTicketRef {
  id: string;
  token: string;
  ticketNumber: string;
  createdAt: string;
}

const KEY = "loadout-support-tickets";
const MAX_SAVED = 10;

export function saveTicketRef(ref: SavedTicketRef): void {
  try {
    const list = listSavedTickets().filter((t) => t.id !== ref.id);
    list.unshift(ref);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
  } catch {}
}

export function listSavedTickets(): SavedTicketRef[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedTicketRef[]) : [];
  } catch {
    return [];
  }
}

/** Un link guardado que ya no resuelve (ticket borrado, token revocado) no debería seguir ofreciéndose — se llama cuando la carga del ticket falla. */
export function removeTicketRef(id: string): void {
  try {
    const list = listSavedTickets().filter((t) => t.id !== id);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}
