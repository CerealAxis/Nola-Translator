export default function Link({ href, prefetch, ...props }) {
  return <a {...props} href={href.startsWith('/docs') ? new URL(href, 'https://ui.shadcn.com').href : href} />
}
