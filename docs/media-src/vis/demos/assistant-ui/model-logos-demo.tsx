import { ClaudeLogo, GeminiLogo, OpenAILogo } from '../../assistant-ui/elements/logos'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="flex flex-wrap justify-center gap-8">
        <figure className="grid place-items-center gap-2"><OpenAILogo className="size-9" aria-hidden /><figcaption>OpenAI</figcaption></figure>
        <figure className="grid place-items-center gap-2"><ClaudeLogo className="size-9" aria-hidden /><figcaption>Claude</figcaption></figure>
        <figure className="grid place-items-center gap-2"><GeminiLogo className="size-9" aria-hidden /><figcaption>Gemini</figcaption></figure>
      </div>
    </AssistantPreview>
  )
}
