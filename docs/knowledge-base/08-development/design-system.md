# Design System Guide

Complete documentation for the FinTrack webapp design system.

## Overview

The FinTrack webapp uses a custom design system built with:
- **Tailwind CSS** - Utility-first CSS framework
- **React + TypeScript** - Component-based UI with type safety
- **Vite** - Fast build tool and dev server

**Design Philosophy:**
- Mobile-first responsive design
- Modern, rounded aesthetic (4xl/5xl border radius)
- Consistent spacing and typography
- Smooth animations and transitions
- Accessibility-focused

---

## Design Tokens

**Location:** `webapp/src/design-system/tokens.ts`

Design tokens provide a single source of truth for design values.

### Colors

```typescript
export const colors = {
  // Backgrounds
  appBg: '#F5F5F7',        // Light gray app background
  white: '#FFFFFF',         // White cards/surfaces

  // Primary colors
  cardDark: '#1C1C1E',     // Dark cards and navigation

  // Accent colors
  lime: '#D4F14D',         // Primary accent (Transfer buttons)
  lavender: '#D4CFED',     // Secondary accent (Request buttons)
  brightLime: '#E5F14D',   // Brighter lime variant

  // Pastel variants
  lightBlue: '#D8E5EF',    // Light blue accents
  lightPink: '#F4D8D8',    // Light pink accents
  lightYellow: '#F4ECD8',  // Light yellow accents

  // Semantic colors
  greenIncome: '#00D68F',  // Income transactions
  redExpense: '#FF6B6B',   // Expense transactions

  // Gray scale
  gray: {
    50: '#F9F9F9',
    100: '#F5F5F7',
    200: '#E5E5EA',
    300: '#D1D1D6',
    400: '#C7C7CC',
    500: '#8E8E93',
    600: '#6B6B6B',
  }
};
```

**Usage in Tailwind:**
```tsx
<div className="bg-card-dark text-white">Dark card</div>
<div className="bg-lime text-black">Lime button</div>
<div className="text-green-income">+$1,000</div>
<div className="text-red-expense">-$500</div>
```

### Spacing

```typescript
export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.5rem',    // 24px
  '2xl': '2rem',   // 32px
  '3xl': '2.5rem', // 40px
};
```

**Usage:**
```tsx
<Card padding="lg">     {/* 16px padding */}
<Card padding="2xl">    {/* 32px padding */}
```

### Typography

```typescript
export const typography = {
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",

  fontSizes: {
    xs: '0.75rem',   // 12px
    sm: '0.875rem',  // 14px
    base: '1rem',    // 16px
    lg: '1.125rem',  // 18px
    xl: '1.25rem',   // 20px
    '2xl': '1.5rem', // 24px
    '3xl': '2rem',   // 32px
    '4xl': '2.5rem', // 40px
    '5xl': '3rem',   // 48px
  },

  fontWeights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
};
```

**Usage:**
```tsx
<p className="text-lg font-semibold">Large semibold text</p>
<h1 className="text-5xl font-bold">Huge bold heading</h1>
```

### Shadows

```typescript
export const shadows = {
  card: '0 4px 20px rgba(0, 0, 0, 0.08)',
  cardHover: '0 8px 30px rgba(0, 0, 0, 0.12)',
  modal: '0 10px 40px rgba(0, 0, 0, 0.15)',
};
```

**Usage:**
```tsx
<Card shadow>           {/* Applies shadow-card */}
<Card shadow hover>     {/* Adds hover:shadow-card-hover */}
```

### Border Radius

```typescript
export const borderRadius = {
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem',   // 32px
  '4xl': '2.5rem', // 40px
  full: '9999px',  // Fully rounded
};
```

**Usage:**
```tsx
<Card rounded="4xl">    {/* Very rounded corners */}
<Button size="md">      {/* 3xl rounded by default */}
```

---

## Core Components

### Button Component

**Location:** `webapp/src/design-system/components/Button/`

Full-featured button component with variants, sizes, icons, and loading states.

#### Props

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'lime' | 'lavender';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  // ...extends ButtonHTMLAttributes
}
```

#### Variants

- **primary** - Dark background, white text (default actions)
- **secondary** - Light gray background, dark text
- **outline** - Transparent with border
- **ghost** - Transparent, no border (subtle actions)
- **lime** - Lime accent color (transfers, primary CTAs)
- **lavender** - Lavender accent color (requests, secondary CTAs)

#### Sizes

- **sm** - `px-4 py-2 text-sm rounded-2xl`
- **md** - `px-6 py-3 text-base rounded-3xl` (default)
- **lg** - `px-8 py-4 text-lg rounded-4xl`

#### Examples

```tsx
// Primary button
<Button variant="primary" size="md">
  Save Changes
</Button>

// Lime button with icon
<Button variant="lime" size="lg" leftIcon="💸">
  Transfer Money
</Button>

// Loading state
<Button variant="primary" isLoading>
  Processing...
</Button>

// Full width
<Button variant="secondary" fullWidth>
  Cancel
</Button>

// Disabled
<Button variant="primary" disabled>
  Disabled Action
</Button>
```

---

### Card Component

**Location:** `webapp/src/design-system/components/Card/`

Flexible container component for grouping content.

#### Props

```typescript
interface CardProps {
  variant?: 'white' | 'dark' | 'gradient';
  rounded?: 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  padding?: 'sm' | 'md' | 'lg';
  shadow?: boolean;
  hover?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

#### Variants

- **white** - White background (default)
- **dark** - Dark background with white text
- **gradient** - Lime to lavender gradient

#### Examples

```tsx
// White card (default)
<Card rounded="4xl" padding="lg" shadow>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>

// Dark card (balance card)
<Card variant="dark" rounded="4xl" padding="lg">
  <p className="text-white/70">My Balance</p>
  <p className="text-5xl font-bold">$12,345</p>
</Card>

// Gradient card
<Card variant="gradient" rounded="3xl" padding="md">
  <p>Special promotion card</p>
</Card>

// Card with hover effect
<Card shadow hover className="cursor-pointer">
  <p>Clickable card</p>
</Card>
```

---

### Avatar Component

**Location:** `webapp/src/design-system/components/Avatar/`

User avatar with initials and gradient background.

#### Props

```typescript
interface AvatarProps {
  initials?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  gradient?: string;
  className?: string;
}
```

#### Examples

```tsx
// Default avatar
<Avatar initials="JD" size="md" />

// Large avatar
<Avatar initials="AB" size="lg" />

// Custom gradient
<Avatar
  initials="CD"
  size="xl"
  gradient="from-purple-400 to-pink-400"
/>
```

---

### Badge Component

**Location:** `webapp/src/design-system/components/Badge/`

Small status or category indicator.

#### Props

```typescript
interface BadgeProps {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
  className?: string;
}
```

#### Examples

```tsx
<Badge variant="default">Shopping</Badge>
<Badge variant="success">Completed</Badge>
<Badge variant="error">Failed</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="info">New</Badge>
```

---

### Modal Component

**Location:** `webapp/src/design-system/components/Modal/`

Full-screen mobile modal that slides up from bottom.

#### Props

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
}
```

#### Examples

```tsx
const [isOpen, setIsOpen] = useState(false);

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Create Transaction"
  size="md"
>
  <form>
    {/* Form content */}
  </form>
</Modal>
```

---

## Custom Components

### BalanceCard

**Location:** `webapp/src/components/BalanceCard.tsx`

Dark card displaying user balance with dynamic font sizing.

**Features:**
- Automatically scales font size based on balance amount
- Trend icon in top-right corner
- Expense change percentage

**Dynamic Font Sizing:**
- ≤6 digits: `text-5xl md:text-6xl` (e.g., $1,234)
- 7-10 digits: `text-3xl md:text-4xl` (e.g., $1,234,567)
- >10 digits: `text-2xl md:text-3xl` (e.g., $1,234,567,890)

**Example:**
```tsx
<BalanceCard
  balance={12345.67}
  expenseChange={15}
/>
```

---

### TransactionItem

**Location:** `webapp/src/components/TransactionItem.tsx`

List item for displaying transaction details.

**Features:**
- Category icon with gradient background
- Transaction description and category badge
- Amount with income/expense color coding
- Click handler for editing

**Example:**
```tsx
<TransactionItem
  transaction={transaction}
  onEdit={(t) => handleEdit(t)}
/>
```

---

### BudgetCard

**Location:** `webapp/src/components/BudgetCard.tsx`

Card displaying budget progress with visual indicators.

**Features:**
- Progress bar with percentage
- Color coding (green/yellow/red based on usage)
- Days remaining indicator
- Over budget warnings

---

### Navigation Components

#### TopNav (Desktop)

**Location:** `webapp/src/components/Navigation.tsx`

Horizontal navigation bar visible on desktop (`hidden md:block`).

#### BottomNav (Mobile)

**Location:** `webapp/src/components/BottomNav.tsx`

Fixed bottom navigation with rounded pill design, visible on mobile (`md:hidden`).

**Features:**
- Floating pill design
- Active state with white background
- Ripple animation on selection
- Auto-hides on desktop

---

## Responsive Design

### Breakpoints

```css
/* Mobile-first approach */
default: < 768px   (mobile)
md:     ≥ 768px   (tablet)
lg:     ≥ 1024px  (desktop)
```

### Best Practices

1. **Design for mobile first**, then enhance for larger screens
2. **Use responsive classes**: `text-3xl md:text-4xl lg:text-5xl`
3. **Hide/show elements**: `hidden md:block` or `md:hidden`
4. **Responsive padding**: `p-4 md:p-6 lg:p-8`
5. **Grid layouts**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

### Example

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <Card className="p-4 md:p-6">
    <h3 className="text-xl md:text-2xl lg:text-3xl">
      Responsive Heading
    </h3>
  </Card>
</div>
```

---

## Theme System

### Dark Mode Support

**Location:** `webapp/src/shared/hooks/useTheme.ts`

The app supports light, dark, and system-preference themes.

#### useTheme Hook

```typescript
import { useTheme } from '@/shared/hooks';

function MyComponent() {
  const { theme, setTheme, resolvedTheme, isDark } = useTheme();

  // theme: 'light' | 'dark' | 'system'
  // resolvedTheme: actual applied theme ('light' | 'dark')
  // isDark: boolean shorthand

  return (
    <button onClick={() => setTheme('dark')}>
      Enable Dark Mode
    </button>
  );
}
```

#### ThemeToggle Component

**Location:** `webapp/src/shared/ui/theme-toggle.tsx`

```tsx
import { ThemeToggle } from '@/shared/ui';

// Renders a button with popover for theme selection
<ThemeToggle />
```

**Options:**
- Светлая (Light)
- Тёмная (Dark)
- Система (System preference)

#### CSS Variables

Dark mode colors are defined in `globals.css`:

```css
.dark {
  --color-background: oklch(9.6% 0 0);
  --color-foreground: oklch(98.2% 0 0);
  --color-card: oklch(14.5% 0 0);
  /* ... */
}
```

---

## Empty States

### EmptyState Component

**Location:** `webapp/src/shared/ui/empty-state.tsx`

Reusable component for displaying helpful empty state messages.

#### Props

```typescript
interface EmptyStateProps {
  icon?: ReactNode;      // Emoji or icon
  title: string;         // Main message
  description?: string;  // Secondary explanation
  tip?: string;          // Helpful tip with 💡 prefix
  action?: ReactNode;    // CTA button
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}
```

#### Examples

```tsx
import { EmptyState, Button } from '@/shared/ui';

// Basic empty state
<EmptyState
  icon="📝"
  title="Нет транзакций"
  description="Начните записывать расходы и доходы"
/>

// With tip and action
<EmptyState
  icon="📊"
  title="Нет активных бюджетов"
  description="Создайте бюджет для контроля расходов"
  tip="Бюджеты помогают не превышать лимиты"
  action={<Button>Создать бюджет</Button>}
  size="lg"
/>

// Search empty state
<EmptyState
  icon="🔍"
  title="Ничего не найдено"
  description="Попробуйте изменить параметры поиска"
  size="md"
/>
```

---

## Autocomplete Input

### AutocompleteInput Component

**Location:** `webapp/src/shared/ui/autocomplete-input.tsx`

Input with dropdown suggestions for quick selection.

#### Props

```typescript
interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  maxSuggestions?: number; // Default: 5
}
```

#### Example

```tsx
import { AutocompleteInput } from '@/shared/ui';

const recentMerchants = ['Магнит', 'Пятёрочка', 'Кофе Хауз'];

<AutocompleteInput
  value={merchant}
  onChange={setMerchant}
  suggestions={recentMerchants}
  placeholder="Название места"
  maxSuggestions={5}
/>
```

---

## Animations

### Animation Classes

**Location:** `webapp/src/app/styles/globals.css`

#### fade-in

Fade in with slight upward movement.

```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Usage:**
```tsx
<div className="fade-in">
  {/* Content */}
</div>
```

#### slide-up

Slide up from bottom (used for modals).

```css
@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
```

#### bubble-in

Scale up with bubble effect.

```css
@keyframes bubbleIn {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
```

#### animate-ripple

Ripple effect (used for active nav items).

```css
@keyframes ripple {
  from {
    transform: scale(0.8);
    opacity: 1;
  }
  to {
    transform: scale(1.3);
    opacity: 0;
  }
}
```

### New Micro-Animations (2025)

#### animate-fade-in-up

Smooth fade with upward movement for page content.

```css
.animate-fade-in-up {
  animation: fadeInUp 0.4s ease-out forwards;
}
```

**Usage with stagger:**
```tsx
<div className="animate-fade-in-up">First item</div>
<div className="animate-fade-in-up stagger-1">Second item</div>
<div className="animate-fade-in-up stagger-2">Third item</div>
```

#### card-hover

Subtle lift effect on hover for cards.

```css
.card-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
```

**Usage:**
```tsx
<Card className="card-hover cursor-pointer">
  Clickable card
</Card>
```

#### list-item-transition

Smooth hover transition for list items.

```css
.list-item-transition {
  transition: opacity 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
}
.list-item-transition:hover {
  background-color: var(--color-muted);
}
```

#### Button Press Effect

All buttons have a subtle scale-down on press.

```css
/* Built into Button component */
active:scale-[0.98]
```

#### Stagger Delays

For sequential animations:

```css
.stagger-1 { animation-delay: 0.05s; }
.stagger-2 { animation-delay: 0.1s; }
.stagger-3 { animation-delay: 0.15s; }
/* ... up to stagger-8 */
```

#### Reduced Motion Support

Animations are disabled for users who prefer reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Common Patterns

### Handling Text Overflow

**Problem:** Long text overflows container

**Solutions:**

1. **Truncate with ellipsis:**
```tsx
<p className="truncate">
  Very long text that will be cut off with ellipsis...
</p>
```

2. **Word break:**
```tsx
<p className="break-words">
  Long words will break to new line
</p>
```

3. **Break all (for numbers):**
```tsx
<p className="break-all">
  $1,234,567,890
</p>
```

4. **Dynamic font sizing** (see BalanceCard example)

---

### Touch Feedback

Add active states for better mobile UX:

```tsx
<button className="active:scale-95 transition-transform">
  Tap Me
</button>
```

---

### Loading States

```tsx
<Button isLoading>
  Processing...
</Button>

// Or custom loading
{loading ? (
  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-card-dark" />
) : (
  <Content />
)}
```

---

## Adding New Components

### Step-by-step Guide

1. **Create component folder:**
```bash
mkdir webapp/src/design-system/components/NewComponent
cd webapp/src/design-system/components/NewComponent
```

2. **Create TypeScript types (optional):**
```typescript
// NewComponent.types.ts
export interface NewComponentProps {
  variant?: 'default' | 'custom';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}
```

3. **Create component:**
```typescript
// NewComponent.tsx
import { NewComponentProps } from './NewComponent.types';

export const NewComponent = ({
  variant = 'default',
  size = 'md',
  children
}: NewComponentProps) => {
  return (
    <div className={`new-component ${variant} ${size}`}>
      {children}
    </div>
  );
};
```

4. **Create barrel export:**
```typescript
// index.ts
export * from './NewComponent';
export * from './NewComponent.types';
```

5. **Add to main barrel:**
```typescript
// webapp/src/design-system/components/index.ts
export * from './Button/Button';
export * from './Card/Card';
// ... existing exports
export * from './NewComponent'; // Add this
```

6. **Use component:**
```typescript
import { NewComponent } from './design-system/components';

<NewComponent variant="custom" size="lg">
  Content
</NewComponent>
```

---

## Styling Guidelines

### Do's ✅

- Use Tailwind utility classes
- Reference design tokens from `tokens.ts`
- Maintain consistent border radius (3xl, 4xl)
- Add hover states for interactive elements
- Include active states for touch feedback
- Use semantic color names (green-income, red-expense)
- Apply overflow handling for long text/numbers
- Test on mobile first

### Don'ts ❌

- Don't use inline styles (use Tailwind classes)
- Don't hardcode colors (use design tokens)
- Don't mix design systems (stay consistent)
- Don't ignore responsive breakpoints
- Don't forget hover/active states
- Don't skip accessibility considerations

---

## Testing Components

### Visual Testing Checklist

When creating new components, test:

- [ ] Mobile (375px width)
- [ ] Tablet (768px width)
- [ ] Desktop (1024px+ width)
- [ ] Hover states
- [ ] Active/pressed states
- [ ] Disabled states
- [ ] Loading states
- [ ] With long text
- [ ] With very short text
- [ ] Dark mode (if applicable)

### Example Test Page

Create a test page to visualize all variants:

```tsx
// TestPage.tsx
export const TestPage = () => {
  return (
    <div className="p-8 space-y-8">
      <h1>Component Showcase</h1>

      <section>
        <h2>Buttons</h2>
        <div className="flex gap-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="lime">Lime</Button>
          <Button variant="lavender">Lavender</Button>
        </div>
      </section>

      {/* More sections */}
    </div>
  );
};
```

---

## Troubleshooting

### Issue: Tailwind classes not applying

**Solution:**
1. Check `tailwind.config.js` content paths include your file
2. Ensure `index.css` imports Tailwind directives
3. Restart dev server (`npm run dev:full`)

### Issue: Custom colors not working

**Solution:**
1. Verify color is defined in `tailwind.config.js`
2. Use correct class name (e.g., `bg-card-dark` not `bg-cardDark`)
3. Check for typos in class names

### Issue: Component not responsive

**Solution:**
1. Use mobile-first approach (default styles for mobile)
2. Add responsive variants (`md:`, `lg:`)
3. Test at different breakpoints

### Issue: Text overflowing container

**Solution:**
1. Add `overflow-hidden` to container
2. Use `truncate` for single line ellipsis
3. Use `break-words` or `break-all` for wrapping
4. Consider dynamic font sizing for numbers

---

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [Inter Font](https://fonts.google.com/specimen/Inter)
- Design inspiration from fintracker-v2 mockups

---

## Summary

The FinTrack design system provides:
- ✅ Consistent, reusable components
- ✅ Mobile-first responsive design
- ✅ Full TypeScript type safety
- ✅ Modern, polished aesthetics
- ✅ Smooth animations and transitions
- ✅ Accessibility-focused patterns

When building new features, always:
1. Use existing design system components
2. Follow styling guidelines
3. Test responsive behavior
4. Add hover/active states
5. Consider text overflow scenarios
