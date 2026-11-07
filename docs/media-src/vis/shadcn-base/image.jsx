export default function Image({ src, fill, priority, quality, placeholder, style, ...props }) {
  const source = typeof src === 'string' ? src : src.src
  const url = source.startsWith('/') ? new URL(source, 'https://ui.shadcn.com').href : source
  return <img {...props} src={url} loading={priority ? 'eager' : 'lazy'} style={fill ? {
    position: 'absolute', inset: 0, width: '100%', height: '100%', ...style,
  } : style} />
}
