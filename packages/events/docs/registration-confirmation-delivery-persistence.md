# Confirmação da inscrição paga — entrega durável (2026-11-05)

Caminho de `sendPendingRegistrationConfirmationEmail` depois de CONFIRMED + PAID.
Não é a entrega assistida de SUPER_ADMIN e não altera recuperação de checkout,
política UNCERTAIN da recovery, nem reenvio automático da recovery.

## Protocolo

1. Transação curta, sem I/O de provider: advisory lock
   `registration-confirmation:${churchId}:${eventId}:${registrationId}`,
   `FOR UPDATE` da Registration, releitura da elegibilidade e resolução do destino.
   Inelegível ou `confirmationEmailSentAt` já preenchido: commit vazio, `false`,
   sem INSERT e sem POST.
2. Se já existir qualquer `DELIVERY_INTENT`, `DELIVERY_ACCEPTED` ou
   `DELIVERY_UNCERTAIN` daquela Registration: `false`, sem POST.
3. Caso contrário, INSERT de `DELIVERY_INTENT` e COMMIT antes do POST. A
   unicidade `(churchId, eventId, registrationId, stage)` e o lock dão um único dono.
4. O POST fica fora da transação e fora do retry de banco. O adapter continua
   `(input) => Promise<boolean>`, com a chave `event-registration/${registrationId}`.
   Não há AbortSignal.
5. `true` observado antes do deadline: outra transação grava `DELIVERY_ACCEPTED` e
   `confirmationEmailSentAt` juntos. O marker só existe junto de ACCEPTED. Marker
   existente não é sobrescrito. Status, pagamento, `checkInToken` e o financeiro
   não mudam.
6. `false`, exceção ou timeout: grava `DELIVERY_UNCERTAIN` se o último estágio ainda
   for INTENT. Não grava marker e não faz segundo POST. O replay seguinte vê
   INTENT ou UNCERTAIN e não chama o provider.
7. ACCEPTED não é rebaixado para UNCERTAIN. Se o ACCEPTED já commitou, o UNCERTAIN
   não é inserido.
8. Se o commit de ACCEPTED falhar, o POST não se repete. INTENT permanece ou vira
   UNCERTAIN; o marker continua nulo; o próximo caller não envia de novo.
9. Depois do handoff, erro do provider não volta ao caller. O retorno é `true`
   somente quando esta chamada gravou o marker junto do ACCEPTED.
10. Não há PREPARED, DELIVERY_RECONCILED_ACCEPTED, inspect, reconcile, GET Resend,
    worker, cron, polling ou flag nova.

O deadline é o argumento opcional `options.deliveryTimeoutMs`, default 15000,
inteiro de 1 a 30000. Não há env novo. O consumidor usa `Promise.race`. Timeout
conta como UNCERTAIN mesmo se a promise original resolver depois; resposta tardia
não grava ACCEPTED nem faz outro POST.

As transações de claim e de resultado usam Serializable. O retry, no máximo cinco
após a primeira tentativa, cobre só P2034, 40001, 40P01 e 23505 da unique
`registration_confirmation_delivery_stage_key`. O timeout da transação é 5000 e
não cobre o provider.

## Elegibilidade e destino

Permanecem CONFIRMED + PAID, sem `waitlistedAt` e sem `confirmationEmailSentAt`.
A projeção é `to_jsonb(r)->>'checkoutEmail'`. Destino local válido tem prioridade.
Null, branco ou ausente cai no e-mail Person/Visitor do mesmo tenant. Local
não-branco inválido não redireciona. Contato ou evento de outro tenant bloqueia.
Sem participante ou sem destinatário, não há marker nem evento.

## Tabela

Migration aditiva `20261105140000_registration_confirmation_delivery_events`.
`EventRegistrationConfirmationDeliveryEvent` é append-only: id, sequence,
churchId, eventId, registrationId, stage e createdAt. Não guarda e-mail, PII,
corpo, API key nem checkInToken. O trigger exige INTENT primeiro; INTENT só pode
ser seguido de ACCEPTED ou UNCERTAIN; esses dois são terminais; `createdAt` não
pode regredir. UPDATE, DELETE e TRUNCATE são recusados. Não há trigger congelando
UPDATE comum de Registration: check-in e o próprio marker continuam. A FK composta
`ON UPDATE RESTRICT` impede mudar churchId, eventId ou id da Registration enquanto
houver evento.

## Limites

UNCERTAIN não dispara reenvio automático nem reconciliação com Resend ou Asaas.
Não há prova de entrega real do provider. O marker nulo com INTENT ou UNCERTAIN
significa que outro caller não deve enviar de novo, mesmo que o POST tenha sido
aceito e o commit de ACCEPTED tenha falhado.
