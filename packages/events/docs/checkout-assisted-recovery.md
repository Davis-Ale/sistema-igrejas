# Recuperação assistida v2 — preparada e inativa

Este corte não ativa rotas nem configura um remetente, destino ou banco reais.
O usuário aprovou e-mail verificado via Resend, após verificação humana prévia
por SUPER_ADMIN, evidência registrada e auditoria. Nenhum contato autoriza recuperação.

## Procedimento obrigatório — ASSISTED_VERIFIED_EMAIL_V1

1. O SUPER_ADMIN autenticado e atualmente ACTIVE identifica igreja, evento e
   inscrição pelo contexto administrativo e IDs exatos. Nome, telefone, e-mail e
   token antigo não são identificadores de autorização nem mecanismo de busca pública.
2. Verifica humanamente a titularidade da inscrição e a posse do endereço que
   receberá a chave. Coincidência cadastral, conhecer dados pessoais ou marcar
   checkbox não constitui prova. Registra no atendimento a evidência, método,
   responsável e momento da verificação. Não anexar documentos/CPF ao audit de checkout.
3. Se a inscrição não puder ser individualizada ou a posse do endereço não estiver
   comprovada, não emitir nem entregar. Escalar o atendimento; não escolher um
   candidato, não corrigir contatos compartilhados nem trocar o destino existente.
4. Envia a atestação explícita de titularidade, posse do e-mail e inscrição sem
   ambiguidade, com referências opacas da evidência e do canal, e `verifiedEmail`.
   O serviço confere que esse endereço é o destino efetivo da inscrição; somente
   RECOVER pode preencher checkoutEmail ausente, pela regra de recuperação existente.
   REISSUE não altera endereço. A igualdade de endereços apenas protege o roteamento.
5. O backend gera a chave e a retém somente em memória, vinculada a ator, igreja,
   evento, inscrição, operationId e payload imutável. O prazo de retenção é
   explicitamente configurado, limitado a 15 minutos, sem renovação. Não é o TTL
   de acesso: este continua exatamente 24h desde a emissão persistida, sem renovação.
6. `recoverCheckoutAccess` mantém sua transação, locks, revalidação SUPER_ADMIN,
   hash, auditoria e revogação. Nenhuma chave vai à resposta HTTP, logs, arquivos,
   auditoria ou armazenamento do browser. Buffers retidos são zerados ao descarte;
   strings transitórias exigidas pelo envio/serviço ficam sob gestão do runtime.
7. Antes do envio, a trilha durável registra DELIVERY_INTENT e a operação revalida
   ator, destino e acesso. Só então entrega pelo Resend ao e-mail atestado. O
   adapter usa chave de idempotência por igreja/evento/inscrição/acesso/operação e tag de correlação, sem chave
   privada na URL, no assunto ou nos metadados. Não envia QR/checkInToken e não
   afirma confirmação de pagamento. Aceitação pelo Resend não comprova leitura/entrega final.
8. DELIVERY_ACCEPTED contém somente a referência do recibo, escopo e referências
   de evidência/canal. Apaga a chave retida. Repetição retorna recibo sem reenviar.
   Timeout, exceção ou falha da auditoria após iniciar o envio vira
   DELIVERY_UNCERTAIN; apaga a chave e impede reenvio, mesmo que chegue resposta tardia.
   Abort não prova que o e-mail não foi aceito.
9. Falha anterior ao envio permite retry explícito com a mesma chave/operação
   enquanto retida. Reinício, descarte ou expiração não recriam a chave de uma
   preparação já persistida. ACCEPTED pode ser consultado sem a chave; PREPARED
   sem chave exige atendimento e nova operação REISSUE explícita. INTENT sem
   resultado permanece incerto e exige reconciliação, nunca novo envio automático.
   A nova REISSUE revoga o acesso anterior atomicamente. Nenhum reset automático.

## Históricos e financeiro

PUBLIC com paymentStatus PENDING/PAID pode recuperar acesso após a verificação.
RECOVER não substitui grant não revogado, mesmo expirado: usar REISSUE explícito.
Destino existente inválido/conflitante, relação cross-tenant, outro status ou
titularidade ambígua bloqueiam a operação. Recuperação não altera elegibilidade
de participante, valores, snapshots, referências, método ou histórico financeiro.
CARD antigo sem semântica comprovada, ausência de referências e cobrança
STARTED/UNCERTAIN continuam sujeitos aos bloqueios do checkout/guard; entregar
uma chave não reconcilia nem autoriza uma nova cobrança.

## Configuração pendente antes de homologação/ativação

- Injetar explicitamente `createAssistedCheckoutRecovery` no quarto argumento dos
  descritores preparados. Sem coordenador, recuperação retorna 503; não há fallback
  para a antiga operação que aceitava chave do chamador. Nada foi ligado aos builders.
- Configurar o adapter Resend com secret e remetente verificado, sem defaults de teste.
- Escolher prazo de retenção e deadline de envio dentro dos limites técnicos.
- Aprovar critérios/evidências operacionais de atendimento. A persistência de entrega
  foi implementada no corte 2: PostgreSQL por padrão, PREPARED atômico com emissão,
  DELIVERY_INTENT antes do envio e eventos de resultado/reconciliação append-only.
  Detalhes, testes e limites em `checkout-recovery-delivery-persistence.md`.
- Homologar posse de endereço, remetente, envio, falhas, reinício e atendimento de
  entrega incerta. Ativação segue dependendo de autorização explícita coordenada.

Os testes isolados usam doubles e Resend simulado. Não comprovam atendimento
humano ou entrega externa real. A prova PostgreSQL do corte 2 usa banco descartável,
clientes independentes e recriação do coordenador com perda de sua memória.
