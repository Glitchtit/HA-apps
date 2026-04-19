/* global React */
const { useState } = React;

const TABS = [
  { id: 'dashboard', emoji: '🏠', name: 'Dashboard' },
  { id: 'products', emoji: '🥫', name: 'Products' },
  { id: 'stock', emoji: '📦', name: 'Stock' },
  { id: 'recipes', emoji: '🍽️', name: 'Recipes' },
  { id: 'shopping', emoji: '🛒', name: 'Shopping' },
  { id: 'units', emoji: '📏', name: 'Units' },
  { id: 'locations', emoji: '📍', name: 'Locations' },
  { id: 'groups', emoji: '🏷️', name: 'Groups' },
  { id: 'barcodes', emoji: '🔖', name: 'Barcodes' },
  { id: 'optimize', emoji: '✨', name: 'Optimize' },
  { id: 'settings', emoji: '⚙️', name: 'Settings' },
];

const STATS = [
  { label: 'Products', v: 342, sub: '+12 this week', tone: 'cobalt' },
  { label: 'In stock', v: 287, sub: '43 opened', tone: 'ok' },
  { label: 'Missing', v: 18, sub: '6 on shopping list', tone: 'danger' },
  { label: 'Recipes', v: 56, sub: '4 pending', tone: 'warning' },
];

const PRODUCTS = [
  { id: 1, emoji: '🥛', name: 'Maito Arla Luomu 1L', cat: 'Maitotuotteet', unit: 'pkt', loc: 'Fridge', stock: 2, status: 'ok' },
  { id: 2, emoji: '🧈', name: 'Voi Valio 500g',        cat: 'Maitotuotteet', unit: 'pkt', loc: 'Fridge', stock: 1, status: 'opened' },
  { id: 3, emoji: '🍞', name: 'Ruisleipä Fazer',       cat: 'Leivät',        unit: 'pkt', loc: 'Kitchen',stock: 0, status: 'missing' },
  { id: 4, emoji: '🥚', name: 'Kananmunat 10kpl',      cat: 'Maitotuotteet', unit: 'kpl', loc: 'Fridge', stock: 6, status: 'ok' },
  { id: 5, emoji: '🧀', name: 'Juusto Arla Edam 500g', cat: 'Maitotuotteet', unit: 'pkt', loc: 'Fridge', stock: 1, status: 'ok' },
  { id: 6, emoji: '🍝', name: 'Spaghetti Barilla No.5',cat: 'Pasta',         unit: 'pkt', loc: 'Pantry', stock: 3, status: 'ok' },
  { id: 7, emoji: '☕', name: 'Kahvi Paulig Juhla Mokka',cat:'Kuivat',       unit: 'pkt', loc: 'Pantry', stock: 2, status: 'opened' },
  { id: 8, emoji: '🧄', name: 'Valkosipuli 3kpl',      cat: 'Vihannekset',   unit: 'kpl', loc: 'Kitchen',stock: 0, status: 'missing' },
];

const STATUS_STYLES = {
  ok:      { bg: 'rgba(16,185,129,0.15)', fg: '#6EE7B7', label: 'in stock' },
  opened:  { bg: 'rgba(245,158,11,0.15)', fg: '#FCD34D', label: 'opened' },
  missing: { bg: 'rgba(239,68,68,0.15)', fg: '#FCA5A5', label: 'missing' },
};

const StatCard = ({ s }) => {
  const toneColor = {
    cobalt: 'var(--brand-cobalt-400)',
    ok: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
  }[s.tone];
  return (
    <div style={{
      background: 'var(--bg-2)', borderRadius: 14, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
      borderLeft: `3px solid ${toneColor}`,
    }}>
      <div className="ds-eyebrow" style={{ fontSize: 10 }}>{s.label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
        {s.v}
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{s.sub}</div>
    </div>
  );
};

const Row = ({ p }) => {
  const s = STATUS_STYLES[p.status];
  return (
    <tr style={{ borderBottom: '1px solid var(--line-2)' }}>
      <td style={{ padding: '10px 12px', width: 40 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--bg-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{p.emoji}</div>
      </td>
      <td style={{ padding: '10px 12px', fontWeight: 500, fontSize: 13 }}>{p.name}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--fg-3)' }}>{p.cat}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--fg-3)' }}>{p.loc}</td>
      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-2)' }}>
        {p.stock} {p.unit}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <span style={{
          padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 600,
          background: s.bg, color: s.fg,
        }}>{s.label}</span>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
        <button style={{
          padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--line-1)',
          background: 'transparent', color: 'var(--fg-2)', cursor: 'pointer',
        }}>Edit</button>
      </td>
    </tr>
  );
};

const StorageApp = () => {
  const [tab, setTab] = useState('products');
  const [search, setSearch] = useState('');
  const filtered = PRODUCTS.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{
      background: 'var(--bg-1)', color: 'var(--fg-1)', fontFamily: 'var(--font-body)',
      height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        padding: '12px 20px', borderBottom: '1px solid var(--line-2)',
        background: 'rgba(17,24,39,0.9)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 14, zIndex: 10, flexShrink: 0,
      }}>
        <div style={{ fontSize: 22 }}>🗄️</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Storage</div>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            v2.14.0 · storage.db 4.8MB · healthy
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
          borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#6EE7B7', fontSize: 11, fontWeight: 600 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
          API 8100
        </div>
        <button style={{
          padding: '6px 12px', borderRadius: 8, border: 'none',
          background: 'var(--brand-cobalt)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>＋ New product</button>
      </header>

      {/* Tab bar — horizontal underline */}
      <nav style={{
        display: 'flex', gap: 4, padding: '0 12px', borderBottom: '1px solid var(--line-2)',
        overflowX: 'auto', background: 'var(--bg-1)', flexShrink: 0,
      }}>
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '12px 12px 10px', border: 'none', background: 'transparent',
              borderBottom: active ? '2px solid var(--brand-orange)' : '2px solid transparent',
              color: active ? 'var(--brand-orange)' : 'var(--fg-3)',
              fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
              transition: 'color 160ms, border-color 160ms',
            }}>
              <span style={{ fontSize: 14 }}>{t.emoji}</span>
              {t.name}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {STATS.map((s) => <StatCard key={s.label} s={s} />)}
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center',
        }}>
          <input
            className="field"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 320 }}
          />
          <button className="btn ghost" style={{ padding: '8px 14px' }}>Category ▾</button>
          <button className="btn ghost" style={{ padding: '8px 14px' }}>Location ▾</button>
          <button className="btn ghost" style={{ padding: '8px 14px' }}>Status ▾</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} / {PRODUCTS.length}
          </span>
        </div>

        {/* Products table */}
        <div style={{
          background: 'var(--bg-2)', borderRadius: 14, overflow: 'hidden',
          border: '1px solid var(--line-2)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{
                background: 'var(--bg-3)', color: 'var(--fg-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}></th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}>Name</th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}>Category</th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}>Location</th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}>Stock</th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'left' }}>Status</th>
                <th style={{ padding: '10px 12px', fontSize: 10, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => <Row key={p.id} p={p} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

window.StorageApp = StorageApp;
