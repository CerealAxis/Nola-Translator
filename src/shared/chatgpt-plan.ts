import { z } from 'zod'

export const CHATGPT_PLAN_SERVICE = 'chatgpt-plan'
export const CHATGPT_PLAN_ENDPOINT = 'https://api.openai.com/v1'
export const chatGptPlanRequest = z.object({
  sourceId: z.string().regex(/^provider_[a-f0-9]{24}$/),
  action: z.enum(['status', 'sign-in', 'cancel', 'models', 'disconnect']),
}).strict()
export type ChatGptPlanRequest = z.infer<typeof chatGptPlanRequest>
export type ChatGptPlanResult = {
  account?: { name: string; email: string; authorized: boolean }
  models?: { id: string; name: string; contextWindow?: number; maxOutputTokens?: number }[]
  revocationConfirmed?: boolean
}
