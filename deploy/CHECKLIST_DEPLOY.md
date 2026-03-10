# IncluiAI — Checklist de Deploy em Produção

## PRÉ-REQUISITO: Configurar Supabase

### 1. Criar projeto no Supabase (supabase.com)
- [ ] Acessar https://supabase.com → New Project
- [ ] Anotar: URL do projeto (ex: https://xyzabc.supabase.co) e `anon key`

### 2. Executar Schema SQL
- [ ] No Supabase → SQL Editor → colar e executar `supabase/schema.sql`
- [ ] Verificar que todas as tabelas foram criadas (Table Editor)

### 3. Configurar Auth
- [ ] Supabase → Authentication → URL Configuration
  - Site URL: https://seudominio.com.br
  - Redirect URLs: https://seudominio.com.br/*, https://seudominio.com.br
- [ ] Habilitar Email Auth (já habilitado por padrão)

### 4. Criar bucket de Storage
- [ ] Supabase → Storage → New Bucket
  - Nome: `attachments`
  - Public: **NÃO** (privado)
- [ ] Policies → New Policy → "Users can manage own files":
  ```sql
  (bucket_id = 'attachments') AND (auth.uid()::text = (storage.foldername(name))[1])
  ```

---

## AMBIENTE LOCAL (.env)

```bash
cp .env.example .env
# Editar .env com suas chaves reais:
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...sua_anon_key
VITE_GEMINI_API_KEY=AIzaSy...sua_chave_gemini
VITE_APP_URL=https://seudominio.com.br
VITE_APP_ENV=production
```

---

## BUILD

```bash
npm install
npm run build
# Gera a pasta dist/ pronta para deploy
```

---

## OPÇÃO A: Nginx (VPS/Servidor Dedicado)

### 1. Enviar arquivos para o servidor
```bash
scp -r dist/ usuario@servidor:/var/www/incluiai/
```

### 2. Configurar Nginx
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/incluiai
sudo ln -s /etc/nginx/sites-available/incluiai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Certificado SSL (Let's Encrypt)
```bash
sudo certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

### 4. Variáveis de ambiente em produção
- NUNCA commite `.env` no repositório
- Configure as variáveis VITE_ **antes** do `npm run build`
  (Vite embute os valores no build estático)
- No servidor CI/CD: configure como secrets/env vars do pipeline

---

## OPÇÃO B: cPanel/Hospedagem Compartilhada

### 1. Criar subdomínio ou apontar domínio
- cPanel → Domínios → configurar document root para a pasta do app

### 2. Upload dos arquivos
- Fazer upload do conteúdo de `dist/` para o document root via File Manager ou FTP
- Fazer upload de `deploy/.htaccess` para a mesma pasta

### 3. SSL
- cPanel → SSL/TLS → Let's Encrypt (AutoSSL) → ativar para o domínio

### 4. Variáveis de ambiente
- Como o Vite embute as variáveis no build, configure no `.env` ANTES de fazer o build localmente
- Depois faça upload do `dist/` gerado

---

## PÓS-DEPLOY: Validação

- [ ] Acessar https://seudominio.com.br → tela de login aparece
- [ ] Criar conta → verificar se email chega
- [ ] Fazer login → verificar se redireciona para dashboard
- [ ] Cadastrar aluno → verificar se salva no Supabase (Table Editor)
- [ ] Acessar rota inexistente (ex: /teste-rota) → deve carregar index.html (SPA)
- [ ] Acessar https://seudominio.com.br/validar/QUALQUER → deve carregar app

---

## SUPABASE: Verificações Finais

- [ ] RLS ativo em todas as tabelas (Database → Tables → cada tabela → RLS Enabled)
- [ ] Trigger `on_auth_user_created` presente (Database → Functions)
- [ ] Bucket `attachments` criado com policies corretas
- [ ] Auth Redirect URLs configuradas

---

## SEGURANÇA: NUNCA FAZER

- ❌ Nunca expor `SERVICE_ROLE_KEY` no frontend (só anon_key é segura)
- ❌ Nunca commitar `.env` com chaves reais
- ❌ Nunca desabilitar RLS em produção
