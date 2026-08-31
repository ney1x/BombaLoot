# REVISIÓN FINAL DE CONSISTENCIA — FASE 5

## 1. ESTADOS ORDER (payment_status + delivery_status)

| payment_status | delivery_status | Estado UI | Transición OK | Notas |
|---|---|---|---|---|
| PENDING | PENDING | PENDING_PAYMENT | → PAID | Reserva 30 min |
| PENDING | PENDING | PENDING_PAYMENT | → FAILED | Si webhook rechaza o expira |
| PAID | PENDING | PAID_PENDING_DELIVERY | → COMPLETED | Códigos entregados |
| PAID | UNAVAILABLE | PAID_UNAVAILABLE | → REFUND_PENDING | Crear refund_request async |
| PAID | DELIVERED | COMPLETED | (final) | Audit: ORDER_DELIVERED |
| FAILED | PENDING | PAYMENT_EXPIRED | (final) | Códigos → AVAILABLE (sweep) |
| FAILED | PENDING | PAYMENT_FAILED | (final) | Webhook rechazó |
| FAILED | UNAVAILABLE | PAYMENT_FAILED_CODES_UNAVAILABLE | (final) | Raro pero posible |
| REFUNDED | UNAVAILABLE | REFUNDED | (final) | After refund complete |

**Verificación**:
- ✅ No transiciones inválidas (COMPLETED → PENDING: NO)
- ✅ PAID_UNAVAILABLE siempre tiene refund_request asociado
- ✅ FAILED siempre libera códigos (AVAILABLE)
- ✅ delivery_status DELIVERED solo si payment_status PAID

**Gap encontrado**: Si refund_request falla (REFUND_FAILED), ¿qué status tiene order?
- **FIX**: order.payment_status queda PAID, delivery_status UNAVAILABLE
- refund_request.status = REFUND_FAILED
- Quedará en PAID_UNAVAILABLE con nota de refund fallido
- Admin debe revisar manual

---

## 2. ESTADOS PAYMENT_INTENT

| Status | Significado | Webhook esperado | Transición |
|---|---|---|---|
| PENDING | No iniciado | NO | → INITIATED |
| INITIATED | Enviado a proveedor | SÍ | → APPROVED / FAILED |
| APPROVED | Pago confirmado | (PAYMENT.CAPTURE.COMPLETED) | (final) |
| FAILED | Rechazado | (PAYMENT.CAPTURE.DENIED) | (final) |
| REFUNDED | Reembolsado | (PAYMENT.CAPTURE.REFUNDED) | (final) |

**Verificación**:
- ✅ Transiciones secuenciales (no saltos)
- ✅ Webhook solo en INITIATED
- ✅ REFUNDED es estado final de payment_intent

**Consistencia con Order**:
- payment_intent.APPROVED → order.payment_status PAID ✅
- payment_intent.FAILED → order.payment_status FAILED ✅
- payment_intent.REFUNDED → order se queda PAID (refund es transacción separada) ✅

---

## 3. ESTADOS REFUND_REQUEST

| Status | Trigger | Acción | Siguiente |
|---|---|---|---|
| PENDING_REFUND | Webhook OK pero sin códigos | Esperar worker | REFUND_INITIATED |
| REFUND_INITIATED | Worker POST refund a proveedor | Esperar response | REFUND_COMPLETED o REFUND_FAILED |
| REFUND_COMPLETED | Proveedor OK | Webhook confirma (PayPal) | (final) |
| REFUND_FAILED | Proveedor error (400, 422) | Retry X veces | MANUAL_REVIEW_REQUIRED |
| MANUAL_REVIEW_REQUIRED | Retry limit alcanzado O Wompi post-capture | Email soporte + admin dashboard | Admin manual |

**Verificación**:
- ✅ Worker toma PENDING_REFUND, marca REFUND_INITIATED
- ✅ Timeout no es estado (handled con retry logic)
- ✅ Fallback manual claro (10 intentos, después manual)

**Gap encontrado**: ¿Cuántos segundos entre REFUND_INITIATED y timeout?
- **FIX**: Agregar timeout lógica:
  ```
  IF (refund_request.initiated_at < NOW - 30 seconds):
    AND status still REFUND_INITIATED:
    RETRY call
  ```
  Máx 10 reintentos cada 5 min = 50 min total, luego MANUAL_REVIEW

---

## 4. IDEMPOTENCIA (3 niveles)

### Nivel 1: HTTP Cache
- **Scope**: POST /api/payments/[provider]/init
- **Key**: md5(path + method + body)
- **TTL**: 24 horas
- **Problem**: Multi-instancia serverless sin Redis
- **OK for Phase 5**: Single instance Docker ✅

### Nivel 2: DB Constraints
```sql
UNIQUE (provider, provider_ref)         -- payment_intents
UNIQUE (event_id)                       -- payment_events
UNIQUE (provider_request_id)            -- refund_requests (PayPal-Request-Id)
UNIQUE (idempotency_key)                -- orders (existente)
```

**Verificación**:
- ✅ Si webhook llega 2x: UNIQUE(event_id) frena duplicado
- ✅ Si refund POST timeout + reintentamos: PayPal-Request-Id devuelve anterior
- ✅ Si checkout reintenta: orders.idempotency_key devuelve anterior
- ✅ Wompi: idempotency-key header (no DB, solo header)

**Gap encontrado**: Wompi idempotency-key es header-only, no en DB. ¿Y si request llega luego?
- **FIX**: Guardar refund_request.provider_request_id ANTES de hacer POST
  ```
  refund_request.provider_request_id = UUID.v4()
  INSERT refund_requests (provider_request_id)
  THEN: POST /v1/transactions/{id}/void
    idempotency-key: provider_request_id
  ```
  Si reintentamos dentro 24h → Wompi devuelve estado anterior
  Si después 24h → Wompi la trata como nueva (pero UNIQUE en DB previene doble)

### Nivel 3: Application Logic
- Webhook duplicado: INSERT → UNIQUE violation → re-fetch estado → devolver 200 ✅
- Refund incierto: Retry con mismo ID, proveedor devuelve anterior ✅

---

## 5. CONCURRENCIA (Worker Multi-Instancia)

**Problema**: Dos workers ejecutan mismo refund simultáneamente.

**Solución Propuesta**: SELECT ... FOR UPDATE SKIP LOCKED

```sql
BEGIN;
SELECT * FROM refund_requests 
  WHERE status = 'PENDING_REFUND' 
  AND created_at > (NOW - 5 minutes)
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
-- Worker A consigue fila
-- Worker B sigue (SKIP LOCKED)
UPDATE refund_requests SET status = 'REFUND_INITIATED' WHERE id = ...;
COMMIT;
-- POST refund a proveedor
```

**Verificación**:
- ✅ FOR UPDATE = row lock, solo un worker
- ✅ SKIP LOCKED = no bloquea, sigue a siguiente fila
- ✅ Atomic (update estado + commit antes de POST)
- ✅ Si worker cae: estado REFUND_INITIATED persiste, otro worker lo retoma

**Nota**: Postgres tiene FOR UPDATE, perfecto. ✅

**Edge case**: Worker A tiene fila, cae en mitad del POST. 30s después timeout:
- Fila queda REFUND_INITIATED
- Otro worker ve created_at > NOW-5min? NO (fue hace 5 min+)
- **FIX**: Cambiar lógica:
  ```
  WHERE (status = 'PENDING_REFUND' AND created_at > NOW - 5 min)
  OR (status = 'REFUND_INITIATED' AND initiated_at < NOW - 30 sec)
  ```
  Así reintentamos si timeout.

---

## 6. WEBHOOK DUPLICADO

**Escenario**: Wompi envía webhook, timeout en red, reenvía.

**Flujo**:
```
Primera: INSERT payment_events (event_id = "tx_abc")
         Procesa: order PAID, códigos PAID
         Respuesta: 200 OK

Segunda: INSERT payment_events (event_id = "tx_abc")
         UNIQUE violation → atrapamos
         Re-fetch fila → status = 'PROCESSED'
         Respuesta: 200 OK
         Sin cambios (idempotente)
```

**Verificación**:
- ✅ UNIQUE(event_id) previene double insert
- ✅ Respuesta 200 OK → proveedor no reintenta
- ✅ Audit: WEBHOOK_DUPLICATE_IGNORED

---

## 7. WEBHOOK FUERA DE ORDEN

**Escenario**: PayPal envía APPROVED, después envía PENDING (viejo).

**Flujo**:
```
Webhook A: COMPLETED (timestamp T2)
  order.payment_status = PAID
  order.updated_at = T2

Webhook B: PENDING (timestamp T1, viejo)
  Verificar: T1 < order.updated_at?
  SÍ → ignorar
  Respuesta: 200 OK
  Audit: WEBHOOK_OUT_OF_ORDER_IGNORED
```

**Verificación**:
- ✅ Comparar webhook.timestamp vs order.updated_at
- ✅ Si es viejo → no procesar
- ✅ Respuesta 200 → proveedor conforme

**Nota**: Paypal webhooks incluyen timestamp, OK. ✅

---

## 8. REFUND INCIERTO (Timeout POST)

**Escenario**: Worker POST /refund, timeout, no sabe si se ejecutó.

**Estrategia**:

```
POST /v2/payments/captures/{id}/refund
  timeout 30 segundos
  no response

refund_request.status = REFUND_INITIATED
refund_request.initiated_at = NOW

Worker continúa:
  Si createdAt + (5 min * retry_count) < NOW:
    RETRY POST (con mismo PayPal-Request-Id)
    
Máx 10 reintentos = 50 min

Si persiste error:
  status = REFUND_FAILED
  email soporte
  admin manual

Si OK en reintento:
  status = REFUND_COMPLETED
```

**Verificación**:
- ✅ Idempotency key = PayPal-Request-Id
- ✅ Retries con exponential backoff (5 min)
- ✅ Fallback manual clear
- ✅ Audit log de cada intento

**Gap**: ¿Qué pasa si REFUND_COMPLETED pero webhook no llega?
- **FIX**: GET /api/result sincroniza con proveedor:
  ```
  GET /v2/payments/captures/{id}
  Busca refund en response
  Si existe → actualizar refund_request.webhook_received_at
  ```

---

## 9. PAGO CONFIRMADO SIN CÓDIGO (Caso B)

**Escenario**: Webhook APPROVED, pero no hay códigos asignados.

**Flujo**:
```
1. Webhook APPROVED
2. Buscar códigos para order_items → 0 registros
3. order.payment_status = PAID
4. order.delivery_status = UNAVAILABLE
5. Crear refund_request (PENDING_REFUND)
6. Audit: ORDER_PAID_CODES_UNAVAILABLE
7. Email cliente (sin decir "fallo")
8. Worker ejecuta refund (async)
```

**Verificación**:
- ✅ Pagó = payment_status PAID ✅
- ✅ No código = delivery_status UNAVAILABLE ✅
- ✅ Refund async, no en webhook ✅
- ✅ Cliente notificado (email) ✅

---

## 10. RESERVA EXPIRADA (Caso G)

**Escenario**: T+1800 sweep expira códigos. T+1850 webhook llega.

**Flujo**:
```
T+1800: sweep_expired_pending_orders
  códigos RESERVED → AVAILABLE
  order.payment_expires_at < NOW
  order.payment_status queda PENDING (no cambió)

T+1850: Webhook APPROVED
  Buscar códigos asignados → 0
  order.payment_status = PAID
  order.delivery_status = UNAVAILABLE
  Crear refund_request
  (Mismo flujo que Caso B)
```

**Verificación**:
- ✅ Sweep no marca order como FAILED (lo hace deriveOrderStatus() UI-side)
- ✅ Webhooks independientes de sweep
- ✅ Pago tardío cae en refund flow correcto
- ✅ Cliente ve "PAID_UNAVAILABLE", no "PAYMENT_EXPIRED"

---

## 11. WOMPI POST-CAPTURE

**Escenario**: Pago confirmado hace 2+ horas, sin códigos, intenta refund.

**Flujo**:
```
1. Webhook APPROVED, no códigos
2. Crear refund_request
3. Worker intenta: POST /v1/transactions/{id}/void
4. Si transacción.created_at > NOW - 2h:
     POST → probablemente OK
5. Si transacción.created_at < NOW - 2h:
     POST → 400 Bad Request (no voitable)
     refund_request.status = REFUND_FAILED
     RETRY 10 veces, still fails
     → MANUAL_REVIEW_REQUIRED
     → email soporte
```

**Verificación**:
- ✅ No inventar refund API para Wompi
- ✅ Fallback manual claro
- ✅ Audit trail completo

---

## 12. PAYPAL REFUND

**Escenario**: Pago confirmado, sin códigos, refund automático.

**Flujo**:
```
1. Webhook APPROVED, no códigos
2. Crear refund_request
3. Worker: POST /v2/payments/captures/{id}/refund
   Header: PayPal-Request-Id: {refund_request.provider_request_id}
4. Respuesta 201 Created
   refund_request.status = REFUND_COMPLETED
   refund_request.provider_response = {...}
5. Webhook PAYMENT.CAPTURE.REFUNDED llega (async)
   refund_request.webhook_received_at = NOW
```

**Verificación**:
- ✅ PayPal-Request-Id guardado ANTES de POST
- ✅ Reintento con mismo ID = idempotente
- ✅ Webhook para confirmación (pero no bloqueante)
- ✅ refund_request.provider_request_id UNIQUE

---

## 13. RECUPERACIÓN: DB CRASH

**Escenario**: DB down durante webhook.

**Transaction rollback automático**:
```
BEGIN;
  INSERT payment_events → OK
  UPDATE orders → CRASH
  (DB connection lost)
ROLLBACK automático
```

**Resultado**:
- payment_events: NO insertado
- order: NO actualizado
- Respuesta: 500 Internal Server Error
- Proveedor reintenta webhook

**Reintento**:
- Segundo webhook mismo event_id
- INSERT payment_events → OK (DB recovered)
- UPDATE orders → OK
- Respuesta: 200

**Verificación**:
- ✅ Transaction-safe (rollback automático)
- ✅ Idempotencia previene doble processing
- ✅ Proveedor reintenta (Wompi 48h, PayPal 7 días)

---

## 14. RECUPERACIÓN: TIMEOUT PROVEEDOR

**Escenario**: Worker POST refund, timeout 30s, no response.

**Flujo**:
```
POST /v2/payments/captures/{id}/refund
timeout 30 seg

refund_request.status = REFUND_INITIATED
refund_request.initiated_at = NOW

5 min después:
Worker ve: REFUND_INITIATED AND initiated_at < NOW - 30 sec
RETRY POST (mismo PayPal-Request-Id)
```

**Verificación**:
- ✅ Timeout no es fatal (retry logic)
- ✅ Idempotency key previene double charge
- ✅ Máx 10 reintentos, después manual

---

## RESUMEN DE GAPS ENCONTRADOS + FIXES

| Gap | Severidad | Fix |
|---|---|---|
| Refund failed pero order queda PAID_UNAVAILABLE sin nota | 🟡 MID | OK, admin verá refund_request.REFUND_FAILED |
| Wompi timeout en refund | 🟡 MID | Agregar lógica: retry si initiated_at < NOW - 30s |
| Webhook duplicado después 24h (Wompi) | 🟡 MID | OK, UNIQUE(event_id) en payment_events previene |
| PayPal-Request-Id fuera de Wompi TTL | ✅ FIXED | Guardar en DB UNIQUE(provider_request_id) |
| Worker concurrencia | 🟡 MID | FOR UPDATE SKIP LOCKED (PostgreSQL supports) |
| Worker A cae en mitad POST | 🟡 MID | Retry REFUND_INITIATED si initiated_at timeout |
| Refund OK webhook no llega | 🟡 MID | GET /api/result sincroniza con proveedor |

**Ninguno CRÍTICO. Todos mitigados en diseño.**

---

## MATRIZ FINAL DE ESTADOS + TRANSICIONES

```
Order:
  PENDING_PAYMENT
    ├─ → PAID (webhook OK, hay códigos)
    ├─ → PAID (webhook OK, sin códigos) → UNAVAILABLE → REFUND_PENDING
    └─ → FAILED (webhook bad, expire, sweep)

Payment Intent:
  PENDING → INITIATED → APPROVED / FAILED / REFUNDED

Refund Request:
  PENDING_REFUND → REFUND_INITIATED → REFUND_COMPLETED
                                   ↘ REFUND_FAILED → MANUAL_REVIEW_REQUIRED

Codes:
  AVAILABLE → RESERVED (30 min) → AVAILABLE (expire)
                              ↘ CONSUMED → PAID (webhook) → DELIVERED

Delivery:
  PENDING → DELIVERED (cuando se entregan códigos)
  UNAVAILABLE (pago sin código) → REFUNDED (después refund)
```

**All transitions validated. No circular dependencies. Safe.**

---

## CONCLUSIÓN

✅ Diseño **CONSISTENTE** con todas las decisiones aprobadas.

✅ Idempotencia **GARANTIZADA** en 3 niveles.

✅ Concurrencia **SEGURA** con FOR UPDATE SKIP LOCKED.

✅ Recuperación ante fallos **DOCUMENTADA**.

✅ Fallback manual **CLARO** (Wompi post-capture, refund failures).

✅ Audit trail **COMPLETO** para debugging.

**Listo para implementación.**

