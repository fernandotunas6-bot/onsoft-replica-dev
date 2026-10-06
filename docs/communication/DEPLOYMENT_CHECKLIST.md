# Deployment Checklist — SIGA Communication Layer

## Pre-Deployment ✓

- [ ] Build sucesso: `npm run build` ✅
- [ ] Testes passam: `npm run test` 
- [ ] Type checking: `npx tsc --noEmit`
- [ ] Linting: `npm run lint`
- [ ] Commits feitos: `git log` ✅
- [ ] Branch atualizado: `git pull origin main`

## Staging Deployment ✓

### Database
- [ ] Migração Supabase aplicada
  ```bash
  npm run supabase db push
  ```
- [ ] RLS policies verificadas
- [ ] Índices criados
- [ ] Backups configurados

### Environment Variables
- [ ] `RESEND_API_KEY` configurada
- [ ] `TWILIO_ACCOUNT_SID` configurada
- [ ] `TWILIO_AUTH_TOKEN` configurada
- [ ] `TWILIO_FROM_NUMBER` configurada
- [ ] `TWILIO_WEBHOOK_AUTH_TOKEN` configurada
- [ ] `WHATSAPP_ACCESS_TOKEN` configurada
- [ ] `WHATSAPP_PHONE_NUMBER_ID` configurada
- [ ] `WHATSAPP_WEBHOOK_VERIFY_TOKEN` configurada
- [ ] `META_APP_SECRET` configurada
- [ ] `OTP_PEPPER_SECRET` configurada

### Webhook Configuration
- [ ] Twilio webhook URL registrado
  ```
  https://seu-dominio-staging.com/api/webhooks/twilio-sms
  ```
- [ ] Meta webhook URL registrado
  ```
  https://seu-dominio-staging.com/api/webhooks/whatsapp-status
  ```
- [ ] Webhooks testados com números de teste

### Testing
- [ ] Teste magic link completo
- [ ] Teste reset password completo
- [ ] Teste OTP (email)
- [ ] Teste SMS (Twilio)
- [ ] Teste WhatsApp (Meta)
- [ ] Teste fallback (SMS → Email)
- [ ] Teste rate limiting
- [ ] Teste multi-tenant isolation

### Monitoring Setup
- [ ] Logs configurados
- [ ] Alertas configurados
- [ ] Dashboard de status
- [ ] Webhook health check

## Production Deployment ✓

### Pre-Production
- [ ] Staging tests 100% passed
- [ ] Performance testing concluído
- [ ] Load testing concluído
- [ ] Security audit concluído
- [ ] Backup & recovery plan testado

### Production Infrastructure
- [ ] Database backup strategy
- [ ] SSL certificates válidos
- [ ] CORS configurado corretamente
- [ ] Rate limiting configurado
- [ ] DDoS protection ativo

### Production Environment
- [ ] Variáveis de ambiente em production
- [ ] Secrets manager integrado (AWS Secrets, Vault, etc)
- [ ] API keys rotacionadas
- [ ] Twilio production account
- [ ] Meta production app
- [ ] Resend production account

### Monitoring & Alerting
- [ ] CloudWatch/DataDog alertas
- [ ] PagerDuty integrado
- [ ] Slack notifications ativo
- [ ] Error tracking (Sentry)
- [ ] Performance monitoring
- [ ] Uptime monitoring

### Documentation
- [ ] README atualizado
- [ ] API documentation completa
- [ ] Runbook de incident response
- [ ] Disaster recovery plan
- [ ] Team training concluído

## Post-Deployment ✓

### Validation
- [ ] Testes de smoke (staging → prod)
- [ ] Dados migrados corretamente
- [ ] Performance aceitável (< 200ms)
- [ ] Sem erros críticos nos logs

### Monitoring
- [ ] Dashboards em tempo real
- [ ] Alertas funcionando
- [ ] Webhooks recebendo updates
- [ ] Taxa de entrega normal

### Rollback Plan
- [ ] Rollback script pronto
- [ ] Backup database validado
- [ ] Previous version disponível
- [ ] Communication plan pronto

## Ongoing ✓

### Weekly
- [ ] Revisar logs de erro
- [ ] Verificar taxa de sucesso
- [ ] Revisar custos (Twilio, Meta, Resend)
- [ ] Verificar performance metrics

### Monthly
- [ ] Security audit
- [ ] Backup restore test
- [ ] Update dependencies
- [ ] Performance optimization review

### Quarterly
- [ ] Disaster recovery drill
- [ ] Capacity planning review
- [ ] Cost optimization review
- [ ] Architecture review

## Emergency Contact

**Oncall Engineer:** [Nome]  
**Slack Channel:** #siga-communication  
**Incident Severity Levels:**
- P1 (Critical): Todas as verificações falhando
- P2 (High): Alguns canais indisponíveis (60%+ entrega)
- P3 (Medium): Performance degradada (> 500ms)
- P4 (Low): Avisos não críticos

---

**Última verificação:** 2026-09-11  
**Responsável:** [Nome]  
**Aprovação:** [Nome]
