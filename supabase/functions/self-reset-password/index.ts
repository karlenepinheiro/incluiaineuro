import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Mensagens genéricas — nunca vazar se o e-mail existe ou não
const MSG_GENERIC   = 'Verificação falhou. Confira os dados e tente novamente.'
const MSG_RATE      = 'Muitas tentativas. Aguarde 1 hora antes de tentar novamente.'
const MAX_ATTEMPTS  = 5
const WINDOW_MIN    = 60

function normalizeDoc(s: string) {
  return s.replace(/\D/g, '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Parse body
    let body: { email?: string; phone?: string; cpf?: string; newPassword?: string }
    try {
      body = await req.json()
    } catch {
      return json({ error: MSG_GENERIC }, 400)
    }

    const { email, phone, cpf, newPassword } = body

    if (!email || (!phone && !cpf)) {
      return json({ error: MSG_GENERIC }, 400)
    }
    if (!newPassword || newPassword.length < 8) {
      return json({ error: 'Senha deve ter no mínimo 8 caracteres' }, 400)
    }

    const identifier = email.toLowerCase().trim()

    // 2. Rate limiting — conta tentativas falhas na janela
    const windowStart = new Date(Date.now() - WINDOW_MIN * 60 * 1000).toISOString()
    const { count: attemptCount } = await admin
      .from('password_reset_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', identifier)
      .eq('success', false)
      .gte('created_at', windowStart)

    if ((attemptCount ?? 0) >= MAX_ATTEMPTS) {
      await admin.from('audit_logs').insert({
        action:      'PASSWORD_RESET_RATE_LIMITED',
        entity_type: 'users',
        details:     { identifier, ip },
      })
      return json({ error: MSG_RATE }, 429)
    }

    // 3. Busca usuário na tabela users por email
    const { data: userRow, error: userErr } = await admin
      .from('users')
      .select('id, phone, cpf')
      .eq('email', identifier)
      .maybeSingle()

    if (userErr) {
      console.error('[self-reset-password] Erro ao buscar usuário:', userErr.message)
      return json({ error: MSG_GENERIC }, 500)
    }

    if (!userRow) {
      // Registra tentativa falha com mensagem genérica (não revela que e-mail não existe)
      await admin.from('password_reset_attempts').insert({ identifier, ip_address: ip, success: false })
      await admin.from('audit_logs').insert({
        action:      'PASSWORD_RESET_SELF_FAILED',
        entity_type: 'users',
        details:     { identifier, ip, reason: 'user_not_found' },
      })
      return json({ error: MSG_GENERIC }, 400)
    }

    // 4. Verifica dado secundário (telefone ou CPF)
    let verified = false
    if (phone && userRow.phone) {
      verified = normalizeDoc(userRow.phone) === normalizeDoc(phone)
    } else if (cpf && userRow.cpf) {
      verified = normalizeDoc(userRow.cpf) === normalizeDoc(cpf)
    }

    if (!verified) {
      await admin.from('password_reset_attempts').insert({ identifier, ip_address: ip, success: false })
      await admin.from('audit_logs').insert({
        action:      'PASSWORD_RESET_SELF_FAILED',
        entity_type: 'users',
        details:     { identifier, ip, reason: 'verification_failed' },
      })
      return json({ error: MSG_GENERIC }, 400)
    }

    // 5. Atualiza senha via Admin API
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      userRow.id,
      { password: newPassword }
    )
    if (updateErr) {
      console.error('[self-reset-password] Erro ao atualizar senha:', updateErr.message)
      throw updateErr
    }

    // 6. Limpa must_change_password e registra timestamp
    await admin.from('users').update({
      must_change_password: false,
      password_changed_at:  new Date().toISOString(),
    }).eq('id', userRow.id)

    // 7. Registra sucesso
    await admin.from('password_reset_attempts').insert({ identifier, ip_address: ip, success: true })
    await admin.from('audit_logs').insert({
      user_id:     userRow.id,
      action:      'PASSWORD_RESET_SELF_SUCCESS',
      entity_type: 'users',
      details:     { identifier, ip },
    })

    console.info('[self-reset-password] Reset com sucesso para', identifier)
    return json({ success: true })

  } catch (err: any) {
    console.error('[self-reset-password] Erro interno:', err?.message ?? err)
    return json({ error: 'Erro interno. Tente novamente.' }, 500)
  }
})
