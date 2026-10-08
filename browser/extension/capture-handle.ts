// Capture Handle belongs to the captured page, so configuration must run in MAIN.
if (window === window.top && location.protocol === 'https:' && !document.documentElement?.dataset.nolaCaptureHandle) {
  const handle = crypto.randomUUID()
  try {
    if (navigator.mediaDevices?.setCaptureHandleConfig) {
      navigator.mediaDevices.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: ['*'] })
      // document_start can precede creation of the root element.
      if (document.documentElement) document.documentElement.dataset.nolaCaptureHandle = handle
      else {
        const observer = new MutationObserver(() => {
          if (document.documentElement) { document.documentElement.dataset.nolaCaptureHandle = handle; observer.disconnect() }
        })
        observer.observe(document, { childList: true })
      }
    }
  } catch { /* An absent marker makes verification fail closed in the content world. */ }
}
