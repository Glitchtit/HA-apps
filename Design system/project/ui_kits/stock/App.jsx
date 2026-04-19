/* global React */
const { useState } = React;

const LOCATIONS = [
  { id: 'kitchen', emoji: '🍳', name: 'Kitchen' },
  { id: 'fridge', emoji: '❄️', name: 'Fridge' },
  { id: 'freezer', emoji: '🧊', name: 'Freezer' },
  { id: 'pantry', emoji: '🥫', name: 'Pantry' },
];

const SEED_PRODUCTS = [
  { id: 1, emoji: '🥛', name: 'Maito', sub: 'Arla Luomu 1L', qty: 2, opened: 1, unit: 'pkt', loc: 'fridge', status: 'ok' },
  { id: 2, emoji: '🧈', name: 'Voi', sub: 'Valio 500g', qty: 1, opened: 1, unit: 'pkt', loc: 'fridge', status: 'opened' },
  { id: 3, emoji: '🍞', name: 'Ruisleipä', sub: 'Fazer', qty: 0, opened: 0, unit: 'pkt', loc: 'kitchen', status: 'missing' },
  { id: 4, emoji: '🥚', name: 'Kananmunat', sub: '10 kpl', qty: 6, opened: 0, unit: 'kpl', loc: 'fridge', status: 'ok' },
  { id: 5, emoji: '🧀', name: 'Juusto', sub: 'Arla Edam 500g', qty: 1, opened: 0, unit: 'pkt', loc: 'fridge', status: 'ok' },
  { id: 6, emoji: '🍝', name: 'Spaghetti', sub: 'Barilla No.5', qty: 3, opened: 1, unit: 'pkt', loc: 'pantry', status: 'ok' },
  { id: 7, emoji: '☕', name: 'Kahvi', sub: 'Paulig Juhla Mokka', qty: 2, opened: 1, unit: 'pkt', loc: 'pantry', status: 'ok' },
  { id: 8, emoji: '🧄', name: 'Valkosipuli', sub: '3 kpl pussi', qty: 0, opened: 0, unit: 'kpl', loc: 'kitchen', status: 'missing' },
];

const StatusDot = ({ status }) => {
  const map = {
    ok: { bg: 'rgba(16,185,129,0.2)', fg: '#6EE7B7', label: 'in stock' },
    opened: { bg: 'rgba(245,158,11,0.2)', fg: '#FCD34D', label: 'opened' },
    missing: { bg: 'rgba(239,68,68,0.2)', fg: '#FCA5A5', label: 'missing' },
  };
  const s = map[status];
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.fg, letterSpacing: '0.02em',
    }}>{s.label}</span>
  );
};

const Thumb = ({ emoji }) => (
  <div style={{
    width: 48, height: 48, borderRadius: 10, background: 'var(--bg-3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 26, flexShrink: 0,
  }}>{emoji}</div>
);

const ProductRow = ({ p, onTap }) => (
  <button
    onClick={() => onTap(p)}
    style={{
      width: '100%', background: 'var(--bg-2)', border: 'none',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      borderRadius: 12, cursor: 'pointer', color: 'var(--fg-1)',
      textAlign: 'left', transition: 'background 160ms var(--ease-out)',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
  >
    <Thumb emoji={p.emoji} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--fg-1)' }}>{p.name}</div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>{p.sub}</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-2)' }}>
        {p.qty} {p.unit}{p.opened ? ` · ${p.opened} open` : ''}
      </div>
      <StatusDot status={p.status} />
    </div>
  </button>
);

const TrapTab = ({ loc, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1, padding: '12px 8px 14px', background: active ? 'var(--bg-2)' : 'transparent',
      border: 'none', cursor: 'pointer', color: active ? 'var(--brand-orange)' : 'var(--fg-3)',
      fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)',
      clipPath: 'polygon(12% 0%, 88% 0%, 100% 100%, 0% 100%)',
      transition: 'color 160ms, background 160ms',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    }}
  >
    <span style={{ fontSize: 20, lineHeight: 1 }}>{loc.emoji}</span>
    <span>{loc.name}</span>
  </button>
);

const DetailSheet = ({ product, onClose }) => {
  if (!product) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end',
      animation: 'fadein 200ms var(--ease-out)', zIndex: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-2)', width: '100%', borderRadius: '20px 20px 0 0',
        padding: 20, boxShadow: 'var(--shadow-xl)',
        animation: 'slideup 260ms var(--ease-out)',
      }}>
        <div style={{ width: 36, height: 4, background: 'var(--bg-4)', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 12, background: 'var(--bg-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>{product.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{product.name}</div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 2 }}>{product.sub}</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, border: 'none',
            background: 'var(--bg-3)', color: 'var(--fg-2)', fontSize: 14, cursor: 'pointer',
          }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'var(--bg-1)', padding: 12, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{product.qty}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>In stock</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg-1)', padding: 12, borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--warning)' }}>{product.opened}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Opened</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button className="btn success">+1 add</button>
          <button className="btn warning">↓ Open 1</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button className="btn danger">−1 consume</button>
          <button className="btn brand-cobalt">Keep in stock</button>
        </div>
      </div>
    </div>
  );
};

const Toast = ({ toast }) => {
  if (!toast) return null;
  const map = {
    success: { bg: 'rgba(16,185,129,0.15)', border: 'var(--success)', emoji: '✅' },
    undo: { bg: 'var(--bg-2)', border: 'var(--brand-orange)', emoji: '↩︎' },
    error: { bg: 'rgba(239,68,68,0.15)', border: 'var(--danger)', emoji: '⚠️' },
  };
  const s = map[toast.type] || map.success;
  return (
    <div style={{
      position: 'absolute', top: 80, right: 12, background: s.bg,
      borderLeft: `3px solid ${s.border}`, padding: '10px 14px', borderRadius: 10,
      color: 'var(--fg-1)', fontSize: 13, boxShadow: 'var(--shadow-lg)',
      display: 'flex', alignItems: 'center', gap: 10, backdropFilter: 'blur(8px)',
      animation: 'slidein 200ms var(--ease-out)', zIndex: 30, maxWidth: 260,
    }}>
      <span style={{ fontSize: 16 }}>{s.emoji}</span>
      <span>{toast.msg}</span>
    </div>
  );
};

const StockApp = () => {
  const [loc, setLoc] = useState('fridge');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState({ type: 'undo', msg: 'Opened Voi · undo in 4s' });
  const products = SEED_PRODUCTS.filter((p) => p.loc === loc);

  return (
    <div style={{
      background: 'var(--bg-1)', color: 'var(--fg-1)',
      fontFamily: 'var(--font-body)', height: '100%',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 16px 12px', borderBottom: '1px solid var(--line-2)',
        background: 'rgba(17,24,39,0.9)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <div style={{ fontSize: 22 }}>📦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Stock</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>8 products · 2 missing</div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 18, border: 'none',
          background: 'var(--brand-orange)', color: '#fff', fontSize: 16, cursor: 'pointer',
          boxShadow: 'var(--glow-orange)',
        }}>⏣</button>
      </header>

      {/* Location tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '10px 8px 0', background: 'var(--bg-1)' }}>
        {LOCATIONS.map((l) => (
          <TrapTab key={l.id} loc={l} active={loc === l.id} onClick={() => setLoc(l.id)} />
        ))}
      </div>

      {/* Product list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 84px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="ds-eyebrow" style={{ padding: '8px 4px 4px' }}>Products</div>
        {products.map((p) => (
          <ProductRow key={p.id} p={p} onTap={setSelected} />
        ))}
        {products.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-3)' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🥫</div>
            <div style={{ fontSize: 13 }}>Ei tuotteita täällä</div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--line-2)',
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 8,
      }}>
        <button className="btn brand-cobalt" style={{ flex: 1 }}>＋ Add product</button>
        <button className="btn neutral">⟳</button>
      </div>

      <Toast toast={toast} />
      <DetailSheet product={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

window.StockApp = StockApp;
