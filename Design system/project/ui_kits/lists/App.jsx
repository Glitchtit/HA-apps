/* global React */
const { useState } = React;

// ─── Mock data ──────────────────────────────────────────────────────────────

const FOLDERS = [
  { id: 1, icon: '🏠', name: 'Home' },
  { id: 2, icon: '💼', name: 'Work' },
];

const LISTS = [
  { id: 1, folder_id: 1, icon: '🛠️', name: 'House projects', count: 4 },
  { id: 2, folder_id: 1, icon: '🧳', name: 'Trip to Lapland', count: 3 },
  { id: 3, folder_id: 2, icon: '🗒️', name: 'Q2 OKRs', count: 2 },
  { id: 4, folder_id: null, icon: '✨', name: 'Someday / maybe', count: 5 },
];

const PERSONS = [
  { entity_id: 'person.anni', name: 'Anni', emoji: '👩‍🦰', color: 'var(--brand-orange)' },
  { entity_id: 'person.jari', name: 'Jari', emoji: '🧔', color: 'var(--brand-cobalt-400)' },
];

const ITEMS = [
  {
    id: 10, title: 'Launch the garden blog', notes: 'Domain reserved; pick a CMS.',
    spiciness: 4, assigned_to: 'person.anni', status: 'open',
    due: 'Thu · 2 days', tags: ['writing', 'web'],
    estimate: [120, 240],
    ai_subs: ['Pick CMS (Astro vs 11ty)', 'Wire up DNS on domain', 'Draft first 3 posts'],
    manual_subs: ['Screenshot homepage for mum'],
  },
  {
    id: 11, title: 'Pack for trip', notes: null,
    spiciness: 2, assigned_to: null, status: 'open',
    due: 'Tomorrow', tags: ['travel'],
  },
  {
    id: 12, title: 'Fix the leaky tap', notes: null,
    spiciness: 5, assigned_to: 'person.jari', status: 'overdue',
    due: 'Overdue · 1d', tags: ['fix'],
  },
  {
    id: 13, title: 'Email therapist to reschedule', notes: null,
    spiciness: 3, assigned_to: 'person.anni', status: 'open',
    due: null, tags: [],
  },
  {
    id: 14, title: 'Sort winter tyres', notes: null,
    spiciness: 1, assigned_to: null, status: 'done',
    due: null, tags: ['car'],
  },
];

const TONES = ['formal', 'casual', 'concise', 'kind', 'firm'];

// ─── Primitives ─────────────────────────────────────────────────────────────

const Pepper = ({ n }) => (
  <span style={{ fontSize: 12, letterSpacing: -2 }}>
    {'🌶️'.repeat(Math.max(1, Math.min(5, n)))}
  </span>
);

const Tag = ({ children }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '2px 8px', borderRadius: 999,
    background: 'var(--bg-3)', color: 'var(--fg-2)',
    fontSize: 11, fontFamily: 'var(--font-mono)',
    border: '1px solid var(--line-1)',
  }}>#{children}</span>
);

const AssigneeDot = ({ entityId }) => {
  const p = PERSONS.find(x => x.entity_id === entityId);
  if (!p) return null;
  return (
    <div title={p.name} style={{
      width: 24, height: 24, borderRadius: '50%',
      background: `color-mix(in srgb, ${p.color} 20%, transparent)`,
      border: `1.5px solid ${p.color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
      flexShrink: 0,
    }}>{p.emoji}</div>
  );
};

const EyebrowRow = ({ children, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
    <span className="ds-eyebrow">{children}</span>
    {right}
  </div>
);

// ─── Sidebar ────────────────────────────────────────────────────────────────

const ListRow = ({ list, active, onClick }) => (
  <button onClick={onClick} style={{
    width: '100%', textAlign: 'left',
    padding: '8px 10px', marginBottom: 2,
    borderRadius: 10, border: 'none', cursor: 'pointer',
    background: active ? 'var(--brand-cobalt)' : 'transparent',
    color: active ? '#fff' : 'var(--fg-2)',
    fontSize: 14, fontWeight: active ? 600 : 500,
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'background var(--dur-base) var(--ease-out)',
    boxShadow: active ? 'var(--glow-cobalt)' : 'none',
  }}>
    <span style={{ fontSize: 16 }}>{list.icon}</span>
    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {list.name}
    </span>
    <span style={{
      fontSize: 11, fontFamily: 'var(--font-mono)',
      color: active ? 'rgba(255,255,255,0.7)' : 'var(--fg-4)',
    }}>{list.count}</span>
  </button>
);

const Sidebar = ({ activeId, onSelect }) => {
  const byFolder = Object.fromEntries(FOLDERS.map(f => [f.id, []]));
  const loose = [];
  LISTS.forEach(l => { (l.folder_id ? byFolder[l.folder_id] : loose).push(l); });

  return (
    <aside style={{
      width: 240, borderRight: '1px solid var(--line-1)',
      background: 'var(--bg-0)', padding: 16, overflowY: 'auto', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 22 }}>📋</span>
        <span className="ds-title-app" style={{ flex: 1 }}>Lists</span>
        <button style={{
          width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line-1)',
          background: 'var(--bg-2)', color: 'var(--fg-3)', cursor: 'pointer',
        }} title="New folder">+</button>
      </div>

      {FOLDERS.map(f => (
        <div key={f.id} style={{ marginBottom: 14 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            color: 'var(--fg-3)', fontSize: 13, fontWeight: 600, marginBottom: 4,
          }}>
            <span>{f.icon}</span><span>{f.name}</span>
          </div>
          {byFolder[f.id].map(l => (
            <ListRow key={l.id} list={l} active={l.id === activeId} onClick={() => onSelect(l.id)} />
          ))}
        </div>
      ))}

      <div className="ds-eyebrow" style={{ marginTop: 16, marginBottom: 4 }}>Unfiled</div>
      {loose.map(l => (
        <ListRow key={l.id} list={l} active={l.id === activeId} onClick={() => onSelect(l.id)} />
      ))}
    </aside>
  );
};

// ─── Item row + list column ────────────────────────────────────────────────

const ItemRow = ({ item, active, onClick, onToggle }) => {
  const overdue = item.status === 'overdue';
  const done = item.status === 'done';
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', padding: '12px 14px',
      background: active ? 'var(--bg-3)' : 'var(--bg-2)',
      border: overdue ? '1px solid rgba(239,68,68,0.35)'
             : active ? '1px solid var(--brand-cobalt-400)' : '1px solid var(--line-2)',
      borderRadius: 14, marginBottom: 6, cursor: 'pointer',
      color: 'var(--fg-1)', display: 'flex', alignItems: 'center', gap: 12,
      opacity: done ? 0.55 : 1,
      transition: 'background var(--dur-base), border-color var(--dur-base)',
    }}>
      <span onClick={(e) => { e.stopPropagation(); onToggle(item.id); }} style={{
        width: 22, height: 22, borderRadius: 11,
        background: done ? 'var(--success)' : 'var(--bg-3)',
        border: done ? 'none' : '1.5px solid var(--fg-4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 12, flexShrink: 0,
      }}>{done ? '✓' : ''}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 14,
          textDecoration: done ? 'line-through' : 'none',
          color: overdue ? '#FCA5A5' : 'var(--fg-1)',
        }}>{item.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, fontSize: 11, color: 'var(--fg-3)' }}>
          {item.due && (
            <span style={{ color: overdue ? '#FCA5A5' : 'var(--fg-3)' }}>
              {overdue ? '⚠️' : '📅'} {item.due}
            </span>
          )}
          <Pepper n={item.spiciness} />
          {item.tags.slice(0, 2).map(t => <Tag key={t}>{t}</Tag>)}
        </div>
      </div>
      <AssigneeDot entityId={item.assigned_to} />
    </button>
  );
};

const ItemsColumn = ({ list, items, activeItemId, setActiveItemId, toggle, onCompile }) => {
  const [showDone, setShowDone] = useState(false);
  const visible = showDone ? items : items.filter(i => i.status !== 'done');
  return (
    <section style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      borderRight: '1px solid var(--line-1)', background: 'var(--bg-1)', minWidth: 0,
    }}>
      <header style={{
        padding: '14px 16px', borderBottom: '1px solid var(--line-1)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'rgba(17,24,39,0.9)', backdropFilter: 'blur(10px)',
      }}>
        <span style={{ fontSize: 22 }}>{list.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ds-h4" style={{ fontSize: 18, lineHeight: '22px' }}>{list.name}</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>
            {items.filter(i => i.status !== 'done').length} open · {items.length} total
          </div>
        </div>
        <button onClick={onCompile} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 999,
          background: 'var(--brand-orange)', color: '#fff',
          border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          boxShadow: 'var(--glow-orange)',
        }}>✨ Compile</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fg-3)' }}>
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Done
        </label>
      </header>

      <form style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-1)' }}
        onSubmit={e => e.preventDefault()}>
        <input placeholder="Add item…  (Enter)" style={{
          width: '100%', padding: '8px 12px',
          background: 'var(--bg-2)', border: '1px solid var(--line-1)',
          borderRadius: 10, color: 'var(--fg-1)', fontSize: 14, outline: 'none',
        }} />
      </form>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {visible.map(it => (
          <ItemRow key={it.id} item={it}
            active={it.id === activeItemId}
            onClick={() => setActiveItemId(it.id)}
            onToggle={toggle}
          />
        ))}
      </div>
    </section>
  );
};

// ─── Detail (spiciness + AI actions) ────────────────────────────────────────

const AiActionButton = ({ emoji, label, subtitle, variant = 'cobalt', onClick }) => {
  const bg = variant === 'orange' ? 'var(--brand-orange)' : 'var(--bg-3)';
  const color = variant === 'orange' ? '#fff' : 'var(--fg-1)';
  const glow = variant === 'orange' ? 'var(--glow-orange)' : 'none';
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 10,
      background: bg, color, border: variant === 'orange' ? 'none' : '1px solid var(--line-1)',
      cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: glow,
      transition: 'transform var(--dur-fast)',
    }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <div style={{ textAlign: 'left' }}>
        <div>{label}</div>
        {subtitle && <div style={{ fontSize: 10, opacity: 0.75, fontFamily: 'var(--font-mono)' }}>{subtitle}</div>}
      </div>
    </button>
  );
};

const ItemDetail = ({ item, onClose, onFireToast }) => {
  const [spice, setSpice] = useState(item.spiciness);
  const [tone, setTone] = useState('formal');

  return (
    <aside style={{
      width: 400, flexShrink: 0, background: 'var(--bg-1)',
      borderLeft: '1px solid var(--line-1)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--line-1)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div className="ds-h4" style={{ flex: 1, fontSize: 18, lineHeight: '24px' }}>{item.title}</div>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', color: 'var(--fg-4)',
          fontSize: 16, cursor: 'pointer',
        }}>✕</button>
      </div>

      <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Notes */}
        <div>
          <div className="ds-eyebrow" style={{ marginBottom: 6 }}>Notes</div>
          <textarea defaultValue={item.notes || ''} rows={3} style={{
            width: '100%', padding: '8px 10px', background: 'var(--bg-2)',
            border: '1px solid var(--line-1)', borderRadius: 10,
            color: 'var(--fg-1)', fontSize: 14, resize: 'vertical',
            fontFamily: 'var(--font-body)', outline: 'none',
          }} />
        </div>

        {/* Spiciness */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span className="ds-eyebrow">Spiciness</span>
            <Pepper n={spice} />
          </div>
          <input type="range" min={1} max={5} value={spice}
            onChange={(e) => setSpice(Number(e.target.value))}
            className="spice" style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-4)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            <span>gentle</span><span>goblin</span>
          </div>
        </div>

        {/* Assigned + due */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 6 }}>Assigned</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AssigneeDot entityId={item.assigned_to} />
              <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                {PERSONS.find(p => p.entity_id === item.assigned_to)?.name || '— anyone —'}
              </span>
            </div>
          </div>
          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 6 }}>Due</div>
            <div style={{ fontSize: 13, color: item.status === 'overdue' ? '#FCA5A5' : 'var(--fg-2)' }}>
              {item.due || '—'}
            </div>
          </div>
        </div>

        {/* AI actions */}
        <div>
          <EyebrowRow>AI actions</EyebrowRow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <AiActionButton
              emoji="🪄" label="Break down" subtitle={'🌶️'.repeat(spice)}
              variant="orange" onClick={() => onFireToast('breakdown')}
            />
            <AiActionButton
              emoji="⏱️" label="Estimate"
              subtitle={item.estimate ? `${item.estimate[0]}–${item.estimate[1]}m` : null}
              onClick={() => onFireToast('estimate')}
            />
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line-1)',
              background: 'var(--bg-3)',
            }}>
              <span style={{ fontSize: 16 }}>✏️</span>
              <select value={tone} onChange={(e) => setTone(e.target.value)} style={{
                background: 'transparent', border: 'none', color: 'var(--fg-1)',
                fontSize: 12, fontWeight: 600, outline: 'none',
              }}>{TONES.map(t => <option key={t} value={t}>{t}</option>)}</select>
              <button onClick={() => onFireToast('formalize')} style={{
                background: 'transparent', border: 'none', color: 'var(--brand-orange-300)',
                fontWeight: 700, cursor: 'pointer', fontSize: 12,
              }}>Rewrite</button>
            </div>
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <EyebrowRow>Subtasks</EyebrowRow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(item.ai_subs || []).map((s, i) => (
              <label key={`ai-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 8, background: 'rgba(255,79,0,0.06)',
                border: '1px solid rgba(255,79,0,0.25)', fontSize: 13,
              }}>
                <input type="checkbox" />
                <span style={{ flex: 1 }}>{s}</span>
                <span title="AI-generated" style={{ fontSize: 11, color: 'var(--brand-orange-300)' }}>✨</span>
              </label>
            ))}
            {(item.manual_subs || []).map((s, i) => (
              <label key={`m-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 8, background: 'var(--bg-2)',
                border: '1px solid var(--line-1)', fontSize: 13,
              }}>
                <input type="checkbox" />
                <span style={{ flex: 1 }}>{s}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <EyebrowRow>Tags</EyebrowRow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {item.tags.map(t => <Tag key={t}>{t}</Tag>)}
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── AI toast ───────────────────────────────────────────────────────────────

const AiJobToast = ({ kind, onDismiss }) => {
  const label = {
    breakdown: 'Breaking down into subtasks',
    compile: 'Compiling brain-dump',
    estimate: 'Estimating…',
    formalize: 'Rewriting…',
  }[kind] || 'AI job';
  return (
    <div style={{
      position: 'absolute', bottom: 20, right: 20, width: 320,
      borderRadius: 14, overflow: 'hidden',
      background: 'var(--brand-cobalt-600)',
      border: '1px solid var(--brand-cobalt-400)',
      boxShadow: 'var(--glow-cobalt), var(--shadow-lg)',
      color: '#fff', animation: 'slide-up 0.3s var(--ease-out)',
    }}>
      <div className="ai-running" style={{ position: 'relative', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{label}</span>
        <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'rgba(255,255,255,0.85)' }}>
        <div>› Fetching AI config from Storage…</div>
        <div>› Calling gemini-2.0-flash-exp</div>
        <div>› Parsing response…</div>
      </div>
    </div>
  );
};

// ─── Compile dialog ─────────────────────────────────────────────────────────

const CompileDialog = ({ onClose, onRun }) => (
  <div style={{
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20,
  }} onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} style={{
      width: 460, background: 'var(--bg-1)',
      border: '1px solid var(--line-1)', borderRadius: 16,
      boxShadow: 'var(--shadow-xl)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--line-1)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>✨</span>
        <span className="ds-h4" style={{ fontSize: 18, flex: 1 }}>Compile brain-dump → House projects</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--fg-4)', fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: 16 }}>
        <textarea rows={8} defaultValue={`paint the hallway\nget quote for tile guy\nbuy sauna lamp — warm white not cold\npick up the drill from dad\nactually send the drill back first?\nthen we can finally hang the shelves`} style={{
          width: '100%', padding: '10px 12px',
          background: 'var(--bg-2)', border: '1px solid var(--line-1)',
          borderRadius: 10, color: 'var(--fg-1)', fontSize: 13,
          fontFamily: 'var(--font-mono)', resize: 'vertical', outline: 'none',
        }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={{
            padding: '8px 14px', borderRadius: 10, background: 'var(--bg-3)',
            color: 'var(--fg-2)', border: 'none', fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onRun} style={{
            padding: '8px 14px', borderRadius: 10,
            background: 'var(--brand-orange)', color: '#fff',
            border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            boxShadow: 'var(--glow-orange)',
          }}>Compile</button>
        </div>
      </div>
    </div>
  </div>
);

// ─── Root ───────────────────────────────────────────────────────────────────

const ListsApp = () => {
  const [activeListId, setActiveListId] = useState(1);
  const [activeItemId, setActiveItemId] = useState(10);
  const [items, setItems] = useState(ITEMS);
  const [toast, setToast] = useState(null);
  const [compileOpen, setCompileOpen] = useState(false);

  const list = LISTS.find(l => l.id === activeListId) || LISTS[0];
  const activeItem = items.find(i => i.id === activeItemId);

  const toggle = (id) => setItems(curr => curr.map(i =>
    i.id === id ? { ...i, status: i.status === 'done' ? 'open' : 'done' } : i));

  return (
    <div style={{
      position: 'relative', height: '100%', width: '100%',
      background: 'var(--bg-1)', color: 'var(--fg-1)',
      fontFamily: 'var(--font-body)', display: 'flex', overflow: 'hidden',
    }}>
      <Sidebar activeId={activeListId} onSelect={(id) => { setActiveListId(id); setActiveItemId(null); }} />
      <ItemsColumn list={list} items={items}
        activeItemId={activeItemId} setActiveItemId={setActiveItemId}
        toggle={toggle}
        onCompile={() => setCompileOpen(true)}
      />
      {activeItem && (
        <ItemDetail item={activeItem}
          onClose={() => setActiveItemId(null)}
          onFireToast={(kind) => setToast(kind)}
        />
      )}
      {toast && <AiJobToast kind={toast} onDismiss={() => setToast(null)} />}
      {compileOpen && (
        <CompileDialog
          onClose={() => setCompileOpen(false)}
          onRun={() => { setCompileOpen(false); setToast('compile'); }}
        />
      )}
    </div>
  );
};

window.ListsApp = ListsApp;
