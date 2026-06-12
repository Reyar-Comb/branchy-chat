import { getProviderConfig } from '../utils/provider-config'

export default defineEventHandler(() => {
  const config = getProviderConfig()

  return {
    baseURL: config.baseURL,
    model: config.model,
    hasApiKey: config.apiKey.length > 0,
  }
})
