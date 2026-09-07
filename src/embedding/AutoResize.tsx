/**
 * Auto-Resize — guest side. Faithful port of the recipe
 * (react-recipes/.../recipes/embedding/AutoResize.tsx), minus shadcn UI.
 *
 * No SDK call is needed here: the session bootstrapped by GuestLayout includes
 * an EmbeddingResizer that observes document.body and sends a
 * ui/notifications/resize on every content change; <lightning-ui-embedding>
 * applies the new pixel height to the iframe (the host's .auto-resize-embed
 * CSS lets it flow instead of clipping). So this guest just renders a list that
 * grows/shrinks — the height follows automatically.
 *
 * (viewSDK.resize(width, height) is available to set the size explicitly.)
 */
import { useRef, useState } from 'react'

interface Item {
  id: number
  text: string
}

export default function AutoResize() {
  const nextIdRef = useRef(3)
  const [items, setItems] = useState<Item[]>(() => [
    { id: 1, text: 'Item 1' },
    { id: 2, text: 'Item 2' },
  ])

  function makeItem(): Item {
    const id = nextIdRef.current++
    return { id, text: `Item ${id} — added at ${new Date().toLocaleTimeString()}` }
  }

  function addItem() {
    setItems((prev) => [...prev, makeItem()])
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="embed-card">
      <h2 className="embed-card__title">
        {items.length} item{items.length !== 1 ? 's' : ''}
      </h2>
      <p className="embed-card__subtitle">
        The iframe height follows this list — add or remove to see it.
      </p>

      <div className="embed-actions">
        <button type="button" className="embed-btn embed-btn--primary" onClick={addItem}>
          ＋ Add item
        </button>
        <button
          type="button"
          className="embed-btn"
          onClick={() => setItems([])}
          disabled={items.length === 0}
        >
          Clear all
        </button>
      </div>

      {items.length === 0 ? (
        <p className="embed-card__subtitle" style={{ marginTop: 12 }}>
          No items — iframe should be at minimum height.
        </p>
      ) : (
        <ul className="embed-list">
          {items.map((item) => (
            <li key={item.id} className="embed-list__item">
              <span>{item.text}</span>
              <button
                type="button"
                className="embed-list__remove"
                onClick={() => removeItem(item.id)}
                aria-label="Remove item"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}