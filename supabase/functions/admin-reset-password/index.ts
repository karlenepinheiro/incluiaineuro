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

const ALLOWED_ROLES = ['super_admin', 'operacional']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  try {
    // 1. Extrai JWT do header Authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401)
    const jwt = authHeader.slice(7)

    // 2. Admin client (service_role — nunca exposto ao frontend)
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 3. Valida JWT → obtém o usuário chamador
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(jwt)
    if (authErr || !caller?.email) {
      console.warn('[admin-reset-password] JWT inválido:', authErr?.message)
      return json({ error: 'Token inválido ou expirado' }, 401)
    }

    // 4. Verifica se o chamador está na tabela admin_users com role permitida
    const { data: adminRow, error: adminErr } = await admin
      .from('admin_users')
      .select('role')
      .eq('email', caller.email)
      .eq('active', true)
      .maybeSingle()

    if (adminErr) {
      console.error('[admin-reset-password] Erro ao checar admin_users:', adminErr.message)
      return json({ error: 'Erro de autorização' }, 500)
    }

    if (!adminRow || !ALLOWED_ROLES.includes(adminRow.role)) {
      console.warn('[admin-reset-password] Permissão negada para:', caller.email, 'role:', adminRow?.role)
      return json({ error: 'Permissão insuficiente. Apenas super_admin e operacional podem redefinir senhas.' }, 403)
    }

    // 5. Parse do body
    let body: { targetEmail?: string; targetUserId?: string; newPassword?: string; mustChangePassword?: boolean }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Body JSON inválido' }, 400)
    }

    const { targetEmail, targetUserId, newPassword, mustChangePassword = true } = body

    if (!newPassword || newPassword.length < 8) {
      return json({ error: 'Senha deve ter no mínimo 8 caracteres' }, 400)
    }
    if (!targetEmail && !targetUserId) {
      return json({ error: 'Forneça targetEmail ou targetUserId' }, 400)
    }

    // 6. Resolve o auth user ID — usa a tabela users (email = coluna indexada)
    let authUserId = targetUserId

    if (!authUserId && targetEmail) {
      const { data: userRow, error: userErr } = await admin
        .from('users')
        .select('id')
        .eq('email', targetEmail.toLowerCase().trim())
        .maybeSingle()

      if (userErr) {
        console.error('[admin-reset-password] Erro ao buscar usuário:', userErr.message)
        return json({ error: 'Erro ao buscar usuário' }, 500)
      }
      if (!userRow) return json({ error: 'Usuário não encontrado' }, 404)
      authUserId = userRow.id
    }

    // 7. Atualiza a senha via Admin API (service_role — seguro)
    const { error: updateErr } = await admin.auth.admin.updateUserById(
      authUserId!,
      { password: newPassword }
    )
    if (updateErr) {
      console.error('[admin-reset-password] Erro ao atualizar senha:', updateErr.message)
      throw updateErr
    }

    // 8. Atualiza o flag must_change_password na tabela users
    await admin
      .from('users')
      .update({
        must_change_password: mustChangePassword,
        password_changed_at: mustChangePassword ? null : new Date().toISOString(),
      })
      .eq('id', authUserId!)

    // 9. Registra na auditoria
    await admin.from('audit_logs').insert({
      user_id:     caller.id,
      user_name:   caller.email,
      action:      'PASSWORD_RESET_BY_ADMIN',
      entity_type: 'users',
      entity_id:   authUserId,
      details: {
        admin_email:          caller.email,
        admin_role:           adminRow.role,
        target_email:         targetEmail ?? null,
        target_user_id:       authUserId,
        must_change_password: mustChangePassword,
      },
    })

    console.info('[admin-reset-password] Senha redefinida por', caller.email, '→ usuário', authUserId)
    return json({ success: true })

  } catch (err: any) {
    console.error('[admin-reset-password] Erro interno:', err?.message ?? err)
    return json({ error: 'Erro interno. Tente novamente.' }, 500)
  }
})
