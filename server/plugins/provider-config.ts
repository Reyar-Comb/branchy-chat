import { getProviderConfig } from '../utils/provider-config'

export default defineNitroPlugin(() => {
  const config = getProviderConfig()

  if (process.env.NODE_ENV === 'production') return

  console.log('[provider-config] loaded config.toml', {
    baseURL: config.baseURL || '(empty)',
    model: config.model || '(empty)',
    hasApiKey: config.apiKey.length > 0,
  })
})
