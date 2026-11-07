import { Image } from '../../assistant-ui/elements/image'
import { AssistantPreview } from '../../assistant-ui/preview-scope'

const src = 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=640&q=80'

export default function Demo() {
  return (
    <AssistantPreview>
      <div className="mx-auto max-w-sm">
        <Image.Root>
          <Image.Zoom src={src} alt="群山和湖泊">
            <Image.Preview src={src} alt="群山和湖泊" />
          </Image.Zoom>
          <Image.Filename>山间湖泊.jpg</Image.Filename>
        </Image.Root>
      </div>
    </AssistantPreview>
  )
}
