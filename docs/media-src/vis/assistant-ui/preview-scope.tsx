import { createContext, useContext, useState, type ReactNode } from 'react'

const PreviewPortal = createContext<HTMLDivElement | null>(null)

export function usePreviewPortal() {
  return useContext(PreviewPortal)
}

export function AssistantPreview({ children }: { children: ReactNode }) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null)

  return (
    <PreviewPortal.Provider value={portal}>
      <div data-assistant-preview className="w-full min-w-0">
        {children}
        <div ref={setPortal} className="contents" />
      </div>
    </PreviewPortal.Provider>
  )
}
