// React owns normal startup failures. This handles only an entry module that never mounts.
window.setTimeout(() => {
  const root = document.getElementById('root')
  const splash = document.getElementById('splash')
  if (!root || root.childElementCount || !splash || splash.hasAttribute('data-exit')) return
  const chinese = (navigator.language || '').toLowerCase().startsWith('zh')
  const panel = document.createElement('div')
  panel.setAttribute('role', 'alertdialog')
  panel.setAttribute('aria-modal', 'true')
  panel.style.cssText = 'position:relative;z-index:2;max-width:440px;margin:24px;padding:24px;border:1px solid #d6e3f5;border-radius:20px;background:#fff;color:#18253c;box-shadow:0 20px 60px #233e7133;font:14px system-ui'
  const title = document.createElement('h2')
  title.textContent = chinese ? '界面启动失败' : 'The interface did not start'
  title.style.cssText = 'margin:0 0 12px;font-size:18px'
  const detail = document.createElement('p')
  detail.textContent = chinese ? '界面在 45 秒内未能载入。请重新载入；如果问题反复出现，请附上本次启动日志。' : 'The interface did not load within 45 seconds. Reload it; if this repeats, include the current launch log.'
  detail.style.cssText = 'line-height:1.6;margin:0 0 20px'
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = chinese ? '重新载入界面' : 'Reload the window'
  reload.style.cssText = 'padding:10px 18px;border:0;border-radius:12px;background:#0879ee;color:#fff;cursor:pointer'
  reload.addEventListener('click', () => location.reload())
  panel.append(title, detail, reload)
  splash.replaceChildren(panel)
}, 45_000)
