# 🔐 Guia: Como Obter Credenciais OAuth do Gmail

Este guia explica passo a passo como obter as credenciais OAuth 2.0 necessárias para conectar o sistema ao Gmail.

## 📋 Pré-requisitos

- Conta Google (Gmail)
- Acesso ao Google Cloud Console

## 🚀 Passo a Passo

### 1. Acesse o Google Cloud Console

1. Acesse: https://console.cloud.google.com/
2. Faça login com sua conta Google

### 2. Crie um Novo Projeto (ou use um existente)

1. No topo da página, clique no seletor de projetos
2. Clique em **"Novo Projeto"**
3. Digite um nome para o projeto (ex: "Sistema Gmail Verificação")
4. Clique em **"Criar"**
5. Aguarde alguns segundos e selecione o projeto criado

### 3. Ative a API do Gmail

1. No menu lateral, vá em **"APIs e Serviços"** > **"Biblioteca"**
2. Na barra de busca, digite **"Gmail API"**
3. Clique em **"Gmail API"**
4. Clique no botão **"ATIVAR"**
5. Aguarde a confirmação

### 4. Configure a Tela de Consentimento OAuth

1. No menu lateral, vá em **"APIs e Serviços"** > **"Tela de consentimento OAuth"**
2. Selecione **"Externo"** (para desenvolvimento) ou **"Interno"** (se tiver Google Workspace)
3. Clique em **"Criar"**
4. Preencha os campos obrigatórios:
   - **Nome do aplicativo**: "Sistema Gmail Verificação" (ou outro nome)
   - **Email de suporte do usuário**: Seu email
   - **Email de contato do desenvolvedor**: Seu email
5. Clique em **"Salvar e continuar"**
6. Na etapa **"Escopos"**, clique em **"Adicionar ou remover escopos"**
7. Selecione os seguintes escopos:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
8. Clique em **"Atualizar"** e depois **"Salvar e continuar"**
9. Na etapa **"Usuários de teste"**, adicione seu email Gmail
10. Clique em **"Salvar e continuar"** até finalizar

### 5. Crie as Credenciais OAuth 2.0

1. No menu lateral, vá em **"APIs e Serviços"** > **"Credenciais"**
2. Clique em **"Criar credenciais"** > **"ID do cliente OAuth 2.0"**
3. Se solicitado, escolha **"Aplicativo da Web"**
4. Configure:
   - **Nome**: "Sistema Gmail Verificação" (ou outro nome)
   - **URIs de redirecionamento autorizados**: 
     ```
     http://localhost:3001/api/gmail/oauth/callback
     ```
     ⚠️ **IMPORTANTE**: Adicione exatamente esta URL (sem barra no final)
5. Clique em **"Criar"**

### 6. Copie as Credenciais

Após criar, você verá uma janela com:
- **ID do cliente** (Client ID) - Copie este valor
- **Segredo do cliente** (Client Secret) - Clique em "Mostrar" e copie

### 7. Configure no Arquivo .env

1. Copie o arquivo `env.example.txt` para `.env`:
   ```bash
   cp env.example.txt .env
   ```

2. Abra o arquivo `.env` e preencha:
   ```env
   GMAIL_CLIENT_ID=seu-client-id-copiado-aqui
   GMAIL_CLIENT_SECRET=seu-client-secret-copiado-aqui
   GMAIL_REDIRECT_URI=http://localhost:3001/api/gmail/oauth/callback
   ```

## ✅ Verificação

1. Inicie o servidor: `npm run dev:server`
2. Acesse: `http://localhost:3000`
3. Faça login
4. Clique em "Conectar Gmail"
5. Você deve ser redirecionado para a página de autorização do Google

## ⚠️ Problemas Comuns

### Erro: "redirect_uri_mismatch"
- Verifique se a URI no Google Cloud Console está **exatamente** igual à do `.env`
- Não deve ter barra no final
- Deve ser `http://localhost:3001/api/gmail/oauth/callback`

### Erro: "access_denied"
- Verifique se adicionou seu email como "Usuário de teste" na tela de consentimento
- Se estiver em modo "Externo", pode levar alguns dias para aprovação

### Erro: "API não ativada"
- Verifique se a Gmail API está ativada no projeto
- Vá em "APIs e Serviços" > "Biblioteca" e confirme que "Gmail API" está ativada

## 🔒 Segurança

- **NUNCA** compartilhe seu Client Secret publicamente
- **NUNCA** faça commit do arquivo `.env` no Git
- Mantenha as credenciais seguras

## 📝 Notas Adicionais

- Para produção, você precisará adicionar o domínio real nas URIs de redirecionamento
- O modo "Externo" requer verificação do Google para uso público
- Para desenvolvimento local, o modo "Externo" com usuários de teste funciona perfeitamente

## 🆘 Precisa de Ajuda?

Se tiver problemas:
1. Verifique se todos os passos foram seguidos
2. Confirme que a Gmail API está ativada
3. Verifique se as URIs estão corretas (sem espaços, sem barras extras)
4. Certifique-se de que o servidor está rodando na porta 3001

