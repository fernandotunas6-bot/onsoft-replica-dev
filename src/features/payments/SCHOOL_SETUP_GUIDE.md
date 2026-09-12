# 💰 Guia: Como Configurar Pagamentos na Sua Escola

Siga este guia passo-a-passo para começar a receber pagamentos de mensalidades dos seus alunos.

---

## ⏱️ Tempo Total: ~15-20 minutos

---

## 🎯 O Que Você Consegue Depois de Configurar

✅ Alunos pagam mensalidades direto do portal  
✅ Pagamentos vão diretamente para a sua conta  
✅ Recebe notificação imediata de cada pagamento  
✅ Relatórios de pagamentos no dashboard  
✅ Múltiplos métodos: GPO, UMM, REF, eTPA  

---

## 📋 Pré-requisitos

Antes de começar, certifique-se que tem:

- [ ] Conta ativa no AppyPay (https://appypay.co.ao)
- [ ] Acesso ao painel administrativo AppyPay
- [ ] Dados de conta bancária verificados no AppyPay
- [ ] Acesso administrativo ao SIGA Plus

---

## 🔧 Passo-a-Passo

### **PASSO 1: Criar/Verificar Conta AppyPay**

#### Se você JÁ tem conta AppyPay:
1. ✅ Pule para **PASSO 2**

#### Se você NÃO tem:
1. Acesse: https://appypay.co.ao
2. Clique em **"Criar Conta"** ou **"Registrar"**
3. Escolha tipo de conta: **"Negócio / Educação"**
4. Preencha informações:
   - Nome da Escola
   - Email administrativo
   - Telefone
   - Endereço
   - NUIT/NIF (número de identificação fiscal)

5. Aguarde confirmação (geralmente 24-48 horas)
6. Ative sua conta via link recebido por email
7. Verifique seus dados bancários (AppyPay precisa disso para transferir)

---

### **PASSO 2: Obter Credenciais do AppyPay**

Agora você precisa obter três credenciais para conectar ao SIGA Plus:

#### 2.1 Acessar Painel AppyPay

1. Vá para: https://dashboard.appypay.co.ao
2. Faça login com sua conta
3. Vá para: **Configurações** → **Credenciais da API**

#### 2.2 Obter Merchant ID

```
No painel AppyPay:
Configurações → Credenciais da API → Merchant ID

Exemplo: "escola-123-ao"

Copie este ID 📋
```

#### 2.3 Obter Bearer Token

```
No painel AppyPay:
Configurações → Credenciais da API → Tokens da API

Opções:
  • Use um token existente (se tiver)
  • Gere um novo token (recomendado)

Se for gerar novo:
  1. Clique em "Gerar Novo Token"
  2. Nomeie como: "SIGA Plus Integration"
  3. Copie o token gerado
```

⚠️ **IMPORTANTE:** Depois de gerar, você SÓ vê o token uma vez! Copie e guarde em local seguro.

#### 2.4 Obter Webhook Secret

```
No painel AppyPay:
Configurações → Webhooks → Secrets

Se não existir:
  1. Clique em "Gerar Novo Secret"
  2. Nomeie como: "SIGA Plus Webhook"
  3. Copie o secret gerado

Guarde este secret! Você precisará depois.
```

---

### **PASSO 3: Conectar no SIGA Plus**

Agora você tem as 3 credenciais. Vamos registrá-las no SIGA Plus:

#### 3.1 Acessar Configuração de Pagamentos

1. Abra o SIGA Plus
2. Vá para: **Admin** → **Configurações** → **Pagamentos**
3. Clique em: **"Configurar Pagamentos"** (ou **"Atualizar"** se já tem algo)

#### 3.2 Preencher Formulário

Você verá um formulário com 3 campos:

| Campo | O Que Preencher | Onde Encontrar |
|-------|-----------------|-----------------|
| **Merchant ID** | ex: `escola-123-ao` | AppyPay → Credenciais → Merchant ID |
| **Bearer Token** | ex: `sk_live_abc123...` | AppyPay → Tokens da API |
| **Webhook Secret** | ex: `whsec_abc123...` | AppyPay → Webhooks → Secret |

Exemplo preenchido:
```
Merchant ID: escola-123-ao
Bearer Token: sk_live_XyZ9B3c4D5e6F7g8H9i0
Webhook Secret: whsec_a1B2c3D4e5F6g7H8i9J0
```

#### 3.3 Testar Conexão

1. Depois de preencher, clique: **"Testar Conexão"**
2. Sistema vai validar credenciais com AppyPay
3. Se aparecer ✅ (verde):
   - Significa credenciais estão corretas!
   - Sistema detectou automaticamente seus métodos de pagamento
   - Exemplo: "Encontradas 3 aplicações: GPO, UMM, REF"

4. Se aparecer ❌ (vermelho):
   - Verifique se copiou os dados corretamente
   - Confirme que os dados estão ativos no AppyPay
   - Tente novamente

#### 3.4 Salvar Configuração

1. Se teste passou (✅), clique: **"Salvar Configuração"**
2. Pronto! Suas credenciais foram registradas com segurança

---

### **PASSO 4: Registrar Webhook no AppyPay**

Webhook é como AppyPay avisa o SIGA Plus quando um pagamento é recebido.

#### 4.1 Copiar URL do Webhook

1. No SIGA Plus, na seção de Pagamentos, procure por:
   **"Configuração de Webhook"**

2. Você verá uma URL como:
   ```
   https://app.siga.ao/api/webhooks/appypay-payment
   ```

3. Clique em: **"Copiar"** 📋

#### 4.2 Registrar no Painel AppyPay

1. Abra AppyPay: https://dashboard.appypay.co.ao
2. Vá para: **Webhooks** → **Criar Novo**
3. Cole a URL copiada no campo: **"URL do Webhook"**
4. Selecione eventos:
   - ☑️ `payment.succeeded` (pagamento confirmado)
   - ☑️ `payment.failed` (pagamento falhou)
   - ☑️ `payment.pending` (pagamento em processamento)

5. Selecione segurança:
   - Tipo: **HMAC-SHA256**
   - Secret: Cole o **Webhook Secret** que você usou no SIGA Plus

6. Clique: **"Criar Webhook"**

#### 4.3 Testar Webhook

AppyPay oferece um botão "Enviar Teste":

1. Clique em: **"Enviar Teste"**
2. Vá ao SIGA Plus → Logs → Webhooks
3. Você deve ver o evento de teste registrado ✅

---

### **PASSO 5: Selecionar Métodos de Pagamento**

#### O que é Aplicação?

Uma "aplicação" no AppyPay é um método de pagamento disponível:

| Método | O Que É | Quando Usar |
|--------|---------|-------------|
| **GPO** | Giro Postal / Transferência Bancária | Pagamentos de responsáveis que têm conta bancária |
| **UMM** | E-wallet/Carteira Digital | Pagamentos rápidos via telefone |
| **REF** | Referência de Pagamento | Pagamento por referência (tipo boleto) |
| **eTPA** | Transferência Eletrônica | Pagamentos diretos via banco |

#### Como Escolher

1. No SIGA Plus, você verá:
   **"Aplicações Habilitadas"**

2. Sistema detectou automaticamente quais você tem no AppyPay
3. Exemplo:
   ```
   ✅ GPO (Padrão)
   ✅ UMM
   ❌ REF (não configurado)
   ❌ eTPA (não configurado)
   ```

4. Recomendação:
   - Habilite **no mínimo GPO** (mais comum)
   - Se quer mais agilidade, adicione **UMM** também

5. Para adicionar mais aplicações:
   - Vá ao AppyPay Dashboard
   - Ative as aplicações desejadas
   - Volte ao SIGA Plus e atualize

---

### **PASSO 6: Testar com Aluno Real**

Agora vamos testar com um pagamento real (pode ser valor mínimo):

#### 6.1 Pedir ao Aluno para Pagar

1. Vá ao portal do aluno (como se fosse ele)
2. Selecione uma mensalidade
3. Clique em: **"Pagar Mensalidade"**
4. Será redirecionado para AppyPay
5. Escolha um método (ex: GPO)
6. Complete o pagamento

#### 6.2 Verificar no SIGA Plus

1. Volte ao SIGA Plus
2. Vá para: **Admin** → **Finanças** → **Pagamentos Recebidos**
3. Você deve ver o pagamento listado ✅
4. Status: **"Confirmado"** ou **"Processando"**

#### 6.3 Verificar no AppyPay

1. Abra AppyPay Dashboard
2. Vá para: **Transações** → **Histórico**
3. Você deve ver o pagamento
4. Quando confirmado, dinheiro é transferido para sua conta

---

## ✅ Checklist: Tudo Pronto?

Marque cada item conforme concluir:

- [ ] Conta AppyPay criada e verificada
- [ ] Merchant ID obtido
- [ ] Bearer Token gerado
- [ ] Webhook Secret gerado
- [ ] Credenciais registradas no SIGA Plus
- [ ] Teste de conexão passou ✅
- [ ] Webhook registrado no AppyPay
- [ ] Métodos de pagamento selecionados
- [ ] Teste com aluno real bem-sucedido
- [ ] Admin notificado de pagamento recebido

---

## 💡 Dicas & Troubleshooting

### Problema: "Teste de Conexão Falhou"

**Causas comuns:**
1. Merchant ID copiado errado
2. Bearer Token expirado
3. Conta AppyPay não verificada
4. Credenciais inativas no AppyPay

**Solução:**
1. Verifique cada campo no painel AppyPay
2. Gere novo Bearer Token se necessário
3. Confirme conta está ativa
4. Tente novamente

### Problema: "Webhook não está recebendo pagamentos"

**Causas comuns:**
1. URL webhook copiada errado
2. Webhook Secret não coincide
3. Webhook não está ativo no AppyPay

**Solução:**
1. Re-copie a URL do SIGA Plus
2. Confirme secret é igual em ambos os lugares
3. Verifique status do webhook no AppyPay (deve estar ativo/verde)

### Problema: "Aluno não vê opção de pagar"

**Causas comuns:**
1. Configuração ainda não foi salva
2. Métodos não foram ativados
3. Aluno não tem mensalidade pendente

**Solução:**
1. Confirme status da configuração (deve estar ✅)
2. Verifique se aplicações estão habilitadas
3. Crie uma mensalidade de teste para o aluno

### Problema: "Pagamento recebeu mas SIGA não foi notificado"

**Causas comuns:**
1. Webhook está registrado errado
2. Webhook Secret não coincide
3. Sistema estava em manutenção

**Solução:**
1. Verifique webhook no AppyPay
2. Envie um "teste de webhook" a partir de AppyPay
3. Verifique logs do SIGA Plus: Admin → Logs → Webhooks

---

## 📞 Suporte

Se tiver dúvidas:

1. **AppyPay Support:** https://appypay.co.ao/support
   - Para problemas com conta, pagamentos, transações

2. **SIGA Plus Support:** https://siga-plus.ao/support
   - Para problemas com configuração, notificações, relatórios

3. **Documentação AppyPay:**
   - https://appypay.stoplight.io/docs/appypay-payment-gateway

---

## 🎉 Parabéns!

Sua escola está pronta para receber pagamentos! 

**Próximos passos:**
- Divulgue para responsáveis e alunos que podem pagar online
- Configure as mensalidades no sistema
- Monitore pagamentos no dashboard
- Ajuste valores e datas conforme necessário

Boa sorte! 💪
