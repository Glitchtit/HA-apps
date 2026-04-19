/* global React */
const { useState } = React;

const RECIPES = [
  { id: 1, title: 'Lohikeitto', img: 'linear-gradient(135deg, #FF4F00, #FFA27A)', emoji: '🍲', servings: 4, tags: ['Soppa', 'Kala'] },
  { id: 2, title: 'Kanapasta pesto', img: 'linear-gradient(135deg, #10B981, #FBBF24)', emoji: '🍝', servings: 2, tags: ['Pasta'] },
  { id: 3, title: 'Karjalanpiirakat', img: 'linear-gradient(135deg, #F59E0B, #FF4F00)', emoji: '🥟', servings: 12, tags: ['Leivonta'] },
  { id: 4, title: 'Mustikkapiirakka', img: 'linear-gradient(135deg, #2E6BD6, #0047AB)', emoji: '🫐', servings: 8, tags: ['Jälkiruoka'] },
  { id: 5, title: 'Lihapullat', img: 'linear-gradient(135deg, #78350F, #F59E0B)', emoji: '🍖', servings: 4, tags: ['Liha'] },
  { id: 6, title: 'Kaalikääryleet', img: 'linear-gradient(135deg, #064E3B, #10B981)', emoji: '🥬', servings: 6, tags: ['Liha'] },
];

const INGREDIENTS = [
  { name: 'Lohifile', amt: '400g', status: 'ok' },
  { name: 'Peruna', amt: '500g', status: 'ok' },
  { name: 'Kermaa', amt: '2 dl', status: 'opened' },
  { name: 'Tilli', amt: '1 rkl', status: 'missing' },
  { name: 'Sipuli', amt: '1 kpl', status: 'ok' },
  { name: 'Voita', amt: '30g', status: 'ok' },
  { name: 'Suolaa', amt: 'Ripaus', status: 'ok' },
];

const INGREDIENT_COLORS = {
  ok:      { bg: 'rgba(16,185,129,0.12)', text: '#6EE7B7', dot: '#10B981', label: '✓' },
  opened:  { bg: 'rgba(245,158,11,0.12)', text: '#FCD34D', dot: '#F59E0B', label: '◐' },
  missing: { bg: 'rgba(239,68,68,0.12)', text: '#FCA5A5', dot: '#EF4444', label: '✕' },
};

const RecipeCard = ({ r, onOpen }) => (
  <button onClick={() => onOpen(r)} style={{
    background: 'var(--bg-2)', borderRadius: 16, overflow: 'hidden',
    border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left',
    color: 'var(--fg-1)', transition: 'transform 160ms',
  }}
  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
  >
    <div style={{
      aspectRatio: '16/10', background: r.img,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 54, position: 'relative',
    }}>
      <span>{r.emoji}</span>
      <span style={{
        position: 'absolute', top: 8, right: 8, padding: '3px 8px',
        borderRadius: 999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)',
      }}>{r.servings} annosta</span>
    </div>
    <div style={{ padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{r.title}</div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {r.tags.map((t) => (
          <span key={t} style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'var(--bg-3)', color: 'var(--fg-3)', fontWeight: 500,
          }}>{t}</span>
        ))}
      </div>
    </div>
  </button>
);

const IngredientRow = ({ i }) => {
  const s = INGREDIENT_COLORS[i.status];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
      borderRadius: 10, background: s.bg,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 10, background: s.dot,
        color: '#fff', fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{s.label}</span>
      <span style={{ flex: 1, color: s.text, fontWeight: 500, fontSize: 14 }}>{i.name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: s.text, opacity: 0.8 }}>{i.amt}</span>
    </div>
  );
};

const RecipeDetail = ({ recipe, onClose }) => {
  if (!recipe) return null;
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)', zIndex: 20, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 12,
      animation: 'fadein 200ms var(--ease-out)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-2)', width: '100%', maxWidth: 420,
        maxHeight: '88%', borderRadius: 20, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-xl)',
        animation: 'slideup 260ms var(--ease-out)',
      }}>
        <div style={{
          aspectRatio: '16/9', background: recipe.img, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80,
        }}>
          <span>{recipe.emoji}</span>
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: 16, border: 'none',
            background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 14,
            cursor: 'pointer', backdropFilter: 'blur(6px)',
          }}>✕</button>
        </div>
        <div style={{ overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{recipe.title}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{recipe.servings} annosta · 45 min · k-ruoka.fi</div>
          </div>

          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 8 }}>Ainekset</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {INGREDIENTS.map((i) => <IngredientRow key={i.name} i={i} />)}
            </div>
          </div>

          <div>
            <div className="ds-eyebrow" style={{ marginBottom: 8 }}>Ohjeet</div>
            <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>Kuori ja kuutioi perunat. Kuullota sipuli voissa kattilan pohjalla.</li>
              <li>Lisää perunat ja vesi. Keitä 10 min tai kunnes perunat pehmenevät.</li>
              <li>Lisää lohikuutiot ja kerma. Anna hautua 5 min.</li>
              <li>Mausta suolalla ja tilllillä ennen tarjoilua.</li>
            </ol>
          </div>
        </div>
        <div style={{
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--line-2)', display: 'flex', gap: 8,
        }}>
          <button className="btn brand-cobalt" style={{ flex: 1 }}>Lisää ostoslistalle</button>
          <button className="btn ghost" style={{ color: 'var(--danger)' }}>Poista</button>
        </div>
      </div>
    </div>
  );
};

const RecipesApp = () => {
  const [detail, setDetail] = useState(null);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchRecipe = () => {
    if (!url) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setUrl(''); }, 1200);
  };

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
        <div style={{ fontSize: 22 }}>🍽️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>Reseptit</div>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>6 tallennettua · 2 odottaa</div>
        </div>
      </header>

      {/* Sticky URL composer */}
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid var(--line-2)',
        background: 'var(--bg-1)', display: 'flex', gap: 8,
      }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="Liitä reseptin URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={fetchRecipe}
          disabled={loading || !url}
          className="btn brand-cobalt"
          style={{ opacity: !url || loading ? 0.5 : 1, minWidth: 72 }}
        >
          {loading ? '⏳' : 'Hae'}
        </button>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {RECIPES.map((r) => <RecipeCard key={r.id} r={r} onOpen={setDetail} />)}
        </div>
      </div>

      <RecipeDetail recipe={detail} onClose={() => setDetail(null)} />
    </div>
  );
};

window.RecipesApp = RecipesApp;
