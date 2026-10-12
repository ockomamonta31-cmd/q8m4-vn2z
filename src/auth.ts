export type Auth = { loggedIn: boolean; steamAccountId?: number; name?: string; avatar?: string | null }

/** Текущая сессия Steam OpenID на нашем же API. */
export async function fetchAuth(): Promise<Auth> {
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return { loggedIn: false }
    return (await res.json()) as Auth
  } catch {
    return { loggedIn: false }
  }
}

export async function logoutAuth(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch {
    /* сессия всё равно заканчивается вместе со страницей */
  }
}
