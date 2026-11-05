export function readPageContext(document: Document): string {
  const source = document.querySelector<HTMLElement>('main,article,[role=main]') ?? document.body
  const copy = source.cloneNode(true) as HTMLElement
  for (const element of copy.querySelectorAll('script,style,noscript,form,input,textarea,select,button,[contenteditable]:not([contenteditable=false]),[hidden],[aria-hidden=true],[data-nola-extension],[data-nola-translation]')) element.remove()
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 12000)
}
