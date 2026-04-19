/* global React */
const { useState } = React;

const TABS = [
  { id: 'dashboard', emoji: '🏠', name: 'Dashboard' },
  { id: 'chores', emoji: '📋', name: 'Chores' },
  { id: 'my', emoji: '✅', name: 'My chores' },
  { id: 'pet', emoji: '🐾', name: 'Pet' },
  { id: 'achievements', emoji: '🎖️', name: 'Achievements' },
];

const PEOPLE = [
  { id: 'an', name: 'Anni', emoji: '👩‍🦰', xp: 1240, lvl: 8, color: '#FF4F00' },
  { id: 'ja', name: 'Jari', emoji: '🧔', xp: 980, lvl: 6, color: '#0047AB' },
  { id: 'ii', name: 'Iida', emoji: '🧒', xp: 620, lvl: 4, color: '#10B981' },
];

const CHORES = [
  { id: 1, emoji: '🧺', name: 'Pese pyykit', sub: 'Due today · 20 XP', who: 'an', done: false },
  { id: 2, emoji: '🗑️', name: 'Vie roskat', sub: 'Due today · 10 XP', who: 'ja', done: false },
  { id: 3, emoji: '🧽', name: 'Tiskaa', sub: 'Overdue 2d · 15 XP', who: null, done: false, overdue: true },
  { id: 4, emoji: '🪴', name: 'Kastele kasvit', sub: 'Every 3d · 5 XP', who: 'ii', done: true },
  { id: 5, emoji: '🧹', name: 'Imuroi olohuone', sub: 'Tomorrow · 25 XP', who: null, done: false },
];

const Tab = ({ tab, active, onClick }) => (
  <button onClick={onClick} style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    padding: '8px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
    color: active ? 'var(--brand-orange)' : 'var(--fg-3)',
    fontSize: 10, fontWeight: 600, flex: 1,
    transition: 'color 160ms',
  }}>
    <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.emoji}</span>
    <span>{tab.name}</span>
  </button>
);

const XPBar = ({ xp, nextLvl = 1500, color = 'var(--brand-orange)' }) => {
  const pct = Math.min(100, (xp / nextLvl) * 100);
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${color}, var(--xp-gold))`,
          borderRadius: 4, boxShadow: `0 0 12px ${color}88`, transition: 'width 300ms var(--ease-out)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
        <span>{xp} XP</span>
        <span>{nextLvl - xp} to lvl up</span>
      </div>
    </div>
  );
};

const PersonCard = ({ p, rank }) => (
  <div style={{
    background: 'var(--bg-2)', borderRadius: 14, padding: 14,
    display: 'flex', alignItems: 'center', gap: 12,
    border: rank === 1 ? '1px solid rgba(251,191,36,0.4)' : '1px solid var(--line-2)',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 22, background: `${p.color}22`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
      border: `2px solid ${p.color}`,
    }}>{p.emoji}</div>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</span>
        {rank === 1 && <span style={{ fontSize: 11 }}>🏆</span>}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          background: 'var(--bg-3)', color: 'var(--fg-2)', fontFamily: 'var(--font-mono)',
        }}>LVL {p.lvl}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <XPBar xp={p.xp} color={p.color} />
      </div>
    </div>
  </div>
);

const ChoreRow = ({ c, people, onToggle }) => {
  const owner = c.who ? people.find((p) => p.id === c.who) : null;
  return (
    <button onClick={() => onToggle(c.id)} style={{
      width: '100%', background: c.done ? 'rgba(16,185,129,0.08)' : 'var(--bg-2)',
      border: c.overdue ? '1px solid rgba(239,68,68,0.35)' : 'none',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      borderRadius: 14, cursor: 'pointer', color: 'var(--fg-1)', textAlign: 'left',
      transition: 'background 160ms, transform 120ms',
      opacity: c.done ? 0.6 : 1,
    }}
    onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
    onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: 'var(--bg-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
        flexShrink: 0,
      }}>{c.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 15,
          textDecoration: c.done ? 'line-through' : 'none',
          color: c.overdue ? '#FCA5A5' : 'var(--fg-1)',
        }}>{c.name}</div>
        <div style={{ fontSize: 12, color: c.overdue ? '#FCA5A5' : 'var(--fg-3)', marginTop: 2 }}>
          {c.sub}
        </div>
      </div>
      {owner && (
        <div title={owner.name} style={{
          width: 26, height: 26, borderRadius: 13, background: `${owner.color}22`,
          border: `1.5px solid ${owner.color}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 13, flexShrink: 0,
        }}>{owner.emoji}</div>
      )}
      <div style={{
        width: 26, height: 26, borderRadius: 13,
        background: c.done ? 'var(--success)' : 'var(--bg-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 12, fontWeight: 700,
      }}>{c.done ? '✓' : ''}</div>
    </button>
  );
};

const Pet = () => (
  <div style={{
    background: 'linear-gradient(180deg, rgba(46,107,214,0.2), rgba(255,79,0,0.1))',
    borderRadius: 18, padding: 20, display: 'flex', alignItems: 'center', gap: 14,
    border: '1px solid var(--line-1)',
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 14, background: 'var(--bg-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
      imageRendering: 'pixelated',
      boxShadow: '0 0 30px rgba(46,107,214,0.35)',
      animation: 'breathe 3s ease-in-out infinite',
    }}>🐾</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)' }}>Axol</div>
      <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>Happy · 3‑day streak</div>
      <div style={{ marginTop: 8 }}>
        <XPBar xp={280} nextLvl={400} color="#2E6BD6" />
      </div>
    </div>
  </div>
);

const ChoresApp = () => {
  const [tab, setTab] = useState('dashboard');
  const [chores, setChores] = useState(CHORES);
  const sorted = [...PEOPLE].sort((a, b) => b.xp - a.xp);
  const due = chores.filter((c) => !c.done).length;

  const toggle = (id) => setChores((cs) => cs.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));

  return (
    <div style={{
      background: 'var(--bg-1)', color: 'var(--fg-1)', fontFamily: 'var(--font-body)',
      height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        padding: '14px 16px 12px', borderBottom: '1px solid var(--line-2)',
        background: 'rgba(17,24,39,0.9)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 10, zIndex: 10,
      }}>
        <div style={{ fontSize: 22 }}>🧹</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Chores</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>{due} due today · 🔥 3 day streak</div>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
          borderRadius: 999, border: '1px solid var(--line-1)', background: 'var(--bg-2)',
          color: 'var(--fg-2)', fontSize: 12, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14 }}>👩‍🦰</span> Anni
          <span style={{ fontSize: 10, color: 'var(--brand-orange)', fontWeight: 700 }}>you</span>
        </button>
      </header>

      {/* Scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 84px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'dashboard' && <>
          <Pet />
          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 8 }}>Leaderboard</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map((p, i) => <PersonCard key={p.id} p={p} rank={i + 1} />)}
            </div>
          </div>
          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 8 }}>Today's chores</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chores.slice(0, 3).map((c) => <ChoreRow key={c.id} c={c} people={PEOPLE} onToggle={toggle} />)}
            </div>
          </div>
        </>}
        {tab === 'chores' && <>
          <div className="ds-eyebrow" style={{ marginTop: 4 }}>All chores</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chores.map((c) => <ChoreRow key={c.id} c={c} people={PEOPLE} onToggle={toggle} />)}
          </div>
        </>}
        {tab === 'my' && <>
          <div className="ds-eyebrow">Assigned to you</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chores.filter((c) => c.who === 'an').map((c) => <ChoreRow key={c.id} c={c} people={PEOPLE} onToggle={toggle} />)}
          </div>
        </>}
        {tab === 'pet' && <>
          <Pet />
          <div className="ds-eyebrow">Pet care</div>
          <div style={{ background: 'var(--bg-2)', borderRadius: 14, padding: 14, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
            Axol is happy! Complete chores to feed · 24 / 30 meals this week.
          </div>
        </>}
        {tab === 'achievements' && <>
          <div className="ds-eyebrow">Achievements</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {['🏆','🔥','⭐','🎖️','🏅','🧹','💪','👑','🚀'].map((e, i) => (
              <div key={i} style={{
                aspectRatio: '1', background: i < 4 ? 'var(--bg-2)' : 'transparent',
                border: i < 4 ? '1px solid rgba(251,191,36,0.3)' : '1px dashed var(--line-1)',
                borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, opacity: i < 4 ? 1 : 0.3,
                boxShadow: i < 4 ? '0 0 20px rgba(251,191,36,0.15)' : 'none',
              }}>{e}</div>
            ))}
          </div>
        </>}
      </div>

      {/* Bottom tab bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(17,24,39,0.95)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--line-2)',
        padding: '6px 6px calc(6px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 2,
      }}>
        {TABS.map((t) => <Tab key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
      </div>
    </div>
  );
};

window.ChoresApp = ChoresApp;
