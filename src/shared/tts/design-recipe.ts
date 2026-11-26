import { z } from 'zod'

export const qwenDesignParametersSchema = z.object({
  do_sample: z.boolean().optional(), temperature: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(), top_k: z.number().int().positive().optional(),
  repetition_penalty: z.number().positive().optional(), max_new_tokens: z.number().int().positive().max(32768).optional(),
}).strict()
export const fishDesignParametersSchema = z.object({
  speed: z.number().positive().max(3).optional(), num_step: z.number().int().min(1).max(128).optional(),
  guidance_scale: z.number().nonnegative().optional(), instruct_guidance_scale: z.number().nonnegative().optional(),
}).strict()

export function validateDesignRecipe(schema: string, recipe: Record<string, unknown>, providerId: string): boolean {
  if (schema === 'nola-description-v1') return z.object({ galleryId: z.string().optional() }).strict().safeParse(recipe).success
  if (schema === 'qwen3-tts-generation-v1' && providerId === 'qwen3-tts') return qwenDesignParametersSchema.safeParse(recipe).success
  if (schema === 'fish-voice-design-v1' && providerId === 'fishaudio-tts') return fishDesignParametersSchema.safeParse(recipe).success
  return false
}
