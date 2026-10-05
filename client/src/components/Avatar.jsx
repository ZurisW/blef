// Avatar: emoji or a custom photo (dataURL) - always rendered as a circle.
// Przekazuj w className rozmiar kontenera (np. "w-11 h-11 text-2xl").
export default function Avatar({ value, className = '' }) {
  const isImg = typeof value === 'string' && value.startsWith('data:image')
  return (
    <span className={`inline-flex items-center justify-center overflow-hidden rounded-full ${className}`}>
      {isImg ? (
        <img src={value} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : (
        <span className="leading-none">{value}</span>
      )}
    </span>
  )
}
