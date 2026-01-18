# Finance Tracker Design Guidelines

> Based on user preferences and Claude's frontend design best practices

## Design Profile Summary

| Aspect | Choice |
|--------|--------|
| **Style** | Minimal & Clean |
| **Typography** | Geometric Sans |
| **Animations** | Moderate |
| **Colors** | Neutral + Single Accent |
| **Border Radius** | Very Rounded (20-32px) |
| **References** | Linear, Revolut/Wise |
| **Key Focus** | Mobile-first, Brand Identity, Data Visualization |

---

## 1. Visual Style: Minimal & Clean

### Core Principles
- **Whitespace is a feature** — generous padding, breathing room between elements
- **Hierarchy through size, not decoration** — no unnecessary borders or shadows
- **Content-first** — UI elements should never compete with data
- **Subtle depth** — light shadows only when needed for separation

### Do's
```css
/* Clean card */
.card {
  background: white;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
```

### Don'ts
- Heavy drop shadows
- Gradients on backgrounds
- Decorative borders
- Multiple competing colors in one view
- Busy patterns or textures

---

## 2. Typography: Geometric Sans

### Recommended Fonts
1. **Inter** (primary choice) — clean, highly readable
2. **Plus Jakarta Sans** — slightly warmer alternative
3. **Outfit** — geometric with personality

### Font Import
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

### Type Scale
| Element | Size | Weight | Use |
|---------|------|--------|-----|
| H1 (Page Title) | 28-32px | 700 | Dashboard titles |
| H2 (Section) | 20-24px | 600 | Section headers |
| H3 (Card Title) | 16-18px | 600 | Card headers |
| Body | 14-16px | 400 | Main content |
| Caption | 12-13px | 400/500 | Labels, hints |
| Balance Display | 36-48px | 700 | Main balance number |

### Typography Rules
- **High contrast weight pairing**: Use 400 vs 700 (not 400 vs 500)
- **Size jumps**: At least 1.5x between hierarchy levels
- **Line height**: 1.4-1.6 for body, 1.2 for headings
- **Letter spacing**: Tight (-0.02em) for large text, normal for body

```tsx
// Example: Balance display
<span className="text-4xl font-bold tracking-tight">
  {formatCurrency(balance)}
</span>
```

---

## 3. Color Palette: Neutral + Accent

### Primary Colors
```css
:root {
  /* Backgrounds */
  --bg-primary: oklch(100% 0 0);           /* #FFFFFF - Main background */
  --bg-secondary: oklch(98% 0 0);          /* #FAFAFA - Cards, sections */
  --bg-tertiary: oklch(95.3% 0 0);         /* #F2F2F2 - Hover states */

  /* Text */
  --text-primary: oklch(14.5% 0 0);        /* #1C1C1E - Headlines */
  --text-secondary: oklch(45% 0 0);        /* #6B6B6B - Body text */
  --text-muted: oklch(60% 0 0);            /* #8E8E93 - Captions */

  /* Accent (choose ONE) */
  --accent-primary: oklch(55% 0.2 145);    /* Green - for finance apps */
  /* Alternative: oklch(55% 0.15 250)       Blue */
  /* Alternative: oklch(55% 0.15 280)       Purple */

  /* Semantic */
  --color-income: oklch(65% 0.18 145);     /* Green for income */
  --color-expense: oklch(60% 0.2 25);      /* Red for expenses */
  --color-warning: oklch(70% 0.15 85);     /* Orange for alerts */

  /* Borders */
  --border-light: oklch(92% 0 0);          /* Subtle borders */
  --border-medium: oklch(85% 0 0);         /* Visible borders */
}
```

### Color Usage Rules
1. **One accent color only** — used sparingly for CTAs and highlights
2. **Semantic colors for data** — green=income, red=expense, always consistent
3. **Gray scale for UI** — navigation, borders, backgrounds
4. **Never mix accent colors** — if you need variety, use opacity

### Dark Mode
```css
.dark {
  --bg-primary: oklch(9.6% 0 0);
  --bg-secondary: oklch(14.5% 0 0);
  --text-primary: oklch(98.2% 0 0);
  --text-secondary: oklch(70% 0 0);
}
```

---

## 4. Border Radius: Very Rounded

### Scale
```css
:root {
  --radius-sm: 8px;      /* Small elements (badges, chips) */
  --radius-md: 12px;     /* Buttons, inputs */
  --radius-lg: 16px;     /* Small cards */
  --radius-xl: 20px;     /* Standard cards */
  --radius-2xl: 24px;    /* Large cards */
  --radius-3xl: 32px;    /* Feature cards, modals */
  --radius-full: 9999px; /* Pills, avatars */
}
```

### Application Guide
| Element | Radius |
|---------|--------|
| Buttons | 12px (md) or pill |
| Input fields | 12px |
| Cards | 20-24px |
| Modals/Dialogs | 24-32px |
| Bottom sheets | 24px (top corners) |
| Avatars | Full (circular) |
| Badges | 8px or pill |
| Navigation bar | 20px |

```tsx
// Example: Card with very rounded corners
<Card className="rounded-3xl p-6">
  <CardContent>...</CardContent>
</Card>
```

---

## 5. Animations: Moderate

### Timing Functions
```css
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* Primary - for entrances */
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); /* For toggles, hovers */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy - for success */
}
```

### Duration Guidelines
| Animation Type | Duration |
|---------------|----------|
| Micro-interactions (hover, focus) | 150-200ms |
| Page transitions | 300-400ms |
| Modal/Sheet appearance | 250-350ms |
| Loading skeletons | 1.5-2s (loop) |
| Success celebrations | 400-600ms |

### Required Animations

#### 1. Page Transitions
```css
.page-enter {
  opacity: 0;
  transform: translateY(10px);
}
.page-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: all 300ms var(--ease-out);
}
```

#### 2. List Items (Stagger)
```tsx
// Stagger animation for transaction list
{transactions.map((tx, index) => (
  <TransactionCard
    key={tx.id}
    style={{ animationDelay: `${index * 50}ms` }}
    className="animate-fade-in-up"
  />
))}
```

#### 3. Skeleton Loading
```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-secondary) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

#### 4. Success States
```tsx
// After successful transaction
<CheckIcon className="animate-scale-in text-green-500" />
```

### Don'ts
- No parallax effects
- No 3D transforms
- No animations longer than 600ms
- No animation on scroll (except lazy loading)

---

## 6. Component Patterns

### Cards
```tsx
<Card className="bg-card rounded-3xl p-5 border-0 shadow-sm">
  <div className="flex items-center justify-between mb-4">
    <h3 className="font-semibold text-base">{title}</h3>
    <Badge variant="outline">{status}</Badge>
  </div>
  <p className="text-muted-foreground text-sm">{description}</p>
</Card>
```

### Buttons
```tsx
// Primary CTA
<Button className="rounded-xl h-12 px-6 font-medium">
  Add Transaction
</Button>

// Secondary
<Button variant="secondary" className="rounded-xl">
  Cancel
</Button>

// Icon button
<Button variant="ghost" size="icon" className="rounded-full">
  <PlusIcon />
</Button>
```

### Inputs
```tsx
<Input
  className="rounded-xl h-12 border-border/50 focus:border-accent"
  placeholder="Enter amount..."
/>
```

### Navigation (Bottom)
```tsx
<nav className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-lg border-t border-border/30 pb-safe">
  <div className="flex justify-around py-2">
    {navItems.map(item => (
      <NavItem
        key={item.path}
        active={isActive}
        className="flex flex-col items-center gap-1 p-2 rounded-2xl"
      />
    ))}
  </div>
</nav>
```

---

## 7. Data Visualization

### Chart Colors
```typescript
const chartColors = {
  primary: 'oklch(55% 0.2 145)',      // Main data series
  secondary: 'oklch(55% 0.15 250)',   // Comparison
  tertiary: 'oklch(55% 0.1 45)',      // Additional data

  // Category breakdown (max 6 colors)
  categories: [
    'oklch(60% 0.15 145)',  // Green
    'oklch(60% 0.15 250)',  // Blue
    'oklch(60% 0.15 320)',  // Purple
    'oklch(65% 0.15 85)',   // Orange
    'oklch(60% 0.15 195)',  // Teal
    'oklch(55% 0.1 0)',     // Gray
  ]
};
```

### Chart Guidelines
1. **Minimal grid lines** — only horizontal, light color
2. **No chart borders** — let data speak
3. **Animated on load** — smooth drawing animation
4. **Touch-friendly** — large hit areas for mobile
5. **Clear legends** — positioned below or inline

```tsx
// Recharts example
<AreaChart data={data}>
  <defs>
    <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3}/>
      <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
    </linearGradient>
  </defs>
  <Area
    type="monotone"
    dataKey="amount"
    stroke="var(--accent-primary)"
    fill="url(#colorSpending)"
    strokeWidth={2}
  />
  <XAxis
    axisLine={false}
    tickLine={false}
    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
  />
</AreaChart>
```

---

## 8. Mobile-First Principles

### Touch Targets
- Minimum tap target: **44x44px**
- Recommended: **48x48px**
- Spacing between targets: **8px minimum**

### Safe Areas
```css
.container {
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}
```

### Responsive Patterns
```tsx
// Mobile-first card grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {cards.map(card => <Card key={card.id} />)}
</div>

// Mobile bottom sheet, desktop modal
{isMobile ? <Sheet>...</Sheet> : <Dialog>...</Dialog>}
```

### Performance
- Use `content-visibility: auto` for long lists
- Lazy load images and charts below fold
- Prefer CSS animations over JS
- Use `will-change` sparingly

---

## 9. Reference Implementations

### Linear-style Clean List
```tsx
<div className="space-y-1">
  {items.map(item => (
    <button
      key={item.id}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                 hover:bg-muted transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  ))}
</div>
```

### Revolut-style Balance Card
```tsx
<Card className="bg-foreground text-background rounded-3xl p-6">
  <p className="text-sm opacity-70 mb-1">Total Balance</p>
  <p className="text-4xl font-bold tracking-tight mb-4">
    {formatCurrency(balance)}
  </p>
  <div className="flex gap-3">
    <Button variant="secondary" className="flex-1 rounded-xl bg-background/10 text-background border-0">
      Add Money
    </Button>
    <Button variant="secondary" className="flex-1 rounded-xl bg-background/10 text-background border-0">
      Send
    </Button>
  </div>
</Card>
```

---

## 10. Anti-Patterns to Avoid

### Typography
- Inter with 500 weight (too subtle) — use 400 or 700
- Purple/violet as primary color (AI slop)
- Multiple font families on one screen

### Colors
- Gradient backgrounds on cards
- Multiple accent colors competing
- Low-contrast text on colored backgrounds

### Layout
- Sticky headers that take >15% of mobile viewport
- Infinite scroll without loading indicators
- Hidden navigation requiring swipes

### Animations
- Bounce effects on every interaction
- Spinning loaders (use shimmer instead)
- Auto-playing celebratory animations

---

## Quick Reference Card

```
STYLE:        Minimal & Clean (Linear/Revolut vibe)
FONT:         Inter 400/600/700
COLORS:       Neutral grays + ONE accent (green recommended)
RADIUS:       Cards 24px, Buttons 12px, Inputs 12px
ANIMATIONS:   Fade-in 300ms, Stagger 50ms, Hover 150ms
TOUCH:        44px minimum, prefer 48px
FOCUS:        Mobile-first, then scale up
```

---

*Last updated: Based on user preferences survey and Claude Design Skills article*
