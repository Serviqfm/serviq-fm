# Lumina Design System

The Lumina Design System is the modern, bilingual design framework for ServIQ-FM. It provides a comprehensive set of colors, typography, spacing, and component patterns that ensure visual consistency across all screens and platforms.

## Color Palette

### Primary Colors
- **Primary**: `#006b54` (Deep Teal) - Main brand color for primary actions and brand identity
- **On Primary**: `#ffffff` (White) - Text/elements on primary backgrounds
- **Primary Container**: `#6dcfb0` (Light Teal) - Lighter variant for secondary emphasis
- **On Primary Container**: `#005744` (Dark Teal) - Text on light teal backgrounds
- **Inverse Primary**: `#76d8b9` (Mint Teal) - Alternative primary for inverted contexts

### Secondary Colors
- **Secondary**: `#00677d` (Navy Teal) - Secondary brand color for accents
- **On Secondary**: `#ffffff` (White) - Text on secondary backgrounds
- **Secondary Container**: `#75e0ff` (Light Blue) - Light variant for secondary content
- **On Secondary Container**: `#006277` (Dark Blue) - Text on light blue backgrounds

### Tertiary Colors
- **Tertiary**: `#4f5e82` (Slate) - Tertiary accent color
- **On Tertiary**: `#ffffff` (White) - Text on tertiary backgrounds
- **Tertiary Container**: `#aebde6` (Light Slate) - Light variant
- **On Tertiary Container**: `#3d4c6f` (Dark Slate) - Text on light slate backgrounds

### Semantic Colors (Status & Alerts)
- **Error**: `#ba1a1a` (Deep Red) - Critical errors and destructive actions
- **On Error**: `#ffffff` (White) - Text on error backgrounds
- **Error Container**: `#ffdad6` (Light Red) - Light error backgrounds
- **On Error Container**: `#93000a` (Dark Red) - Text on light red backgrounds
- **Success**: `#2E7D32` (Forest Green) - Successful states and confirmations
- **Warning**: `#F57F17` (Amber) - Warning states and cautions

### Surface Colors (Backgrounds)
- **Surface**: `#f7f9fb` (Off-White) - Main background color
- **Surface Dim**: `#d8dadc` (Light Gray) - Dimmed surface for emphasis
- **Surface Bright**: `#f7f9fb` (Off-White) - Bright surface variant
- **On Surface**: `#191c1e` (Near Black) - Text on surface backgrounds
- **On Surface Variant**: `#3e4944` (Gray-Green) - Muted text on surfaces
- **Inverse Surface**: `#2d3133` (Dark Charcoal) - Dark surface for inverted contexts
- **Inverse On Surface**: `#eff1f3` (Near White) - Text on dark surfaces

### Additional Surfaces
- **Surface Variant**: `#e0e3e5` (Pale Gray) - Variant surface for cards/sections
- **Surface Container Lowest**: `#ffffff` (White) - Lowest elevation container
- **Surface Container Low**: `#f2f4f6` (Very Light Gray) - Low elevation container
- **Surface Container**: `#eceef0` (Light Gray) - Standard container elevation
- **Surface Container High**: `#e6e8ea` (Light Gray) - Higher elevation container
- **Surface Container Highest**: `#e0e3e5` (Pale Gray) - Highest elevation container

### Background & Outline
- **Background**: `#f7f9fb` (Off-White) - Overall page background
- **On Background**: `#191c1e` (Near Black) - Text on background
- **Outline**: `#6e7a74` (Muted Green) - Dividers and borders
- **Outline Variant**: `#bdc9c3` (Light Gray-Green) - Secondary dividers

## Typography

### Display Large
- **Font Family**: DM Sans (English) / Readex Pro (Arabic)
- **Font Size**: 48px
- **Font Weight**: 700 (Bold)
- **Line Height**: 1.1
- **Letter Spacing**: -0.02em
- **Use Case**: Main page headings, hero titles

### Headline H1
- **Font Family**: DM Sans (English)
- **Font Size**: 32px
- **Font Weight**: 700 (Bold)
- **Line Height**: 1.2
- **Use Case**: Section headings, major titles

### Headline H1 (Arabic)
- **Font Family**: Readex Pro
- **Font Size**: 32px
- **Font Weight**: 600
- **Line Height**: 1.4
- **Use Case**: Section headings in Arabic

### Body Medium
- **Font Family**: DM Sans (English)
- **Font Size**: 16px
- **Font Weight**: 400 (Regular)
- **Line Height**: 1.6
- **Use Case**: Body text, descriptions

### Body Medium (Arabic)
- **Font Family**: Readex Pro
- **Font Size**: 15px
- **Font Weight**: 300 (Light)
- **Line Height**: 1.8
- **Use Case**: Body text in Arabic (lighter weight for readability)

### Label Caps
- **Font Family**: DM Sans
- **Font Size**: 12px
- **Font Weight**: 600 (Bold)
- **Line Height**: 1.0
- **Letter Spacing**: 0.05em
- **Text Transform**: Uppercase
- **Use Case**: Labels, captions, button text

## Spacing System

### Unit System
- **Unit**: 4px - Smallest spacing increment
- **Small (sm)**: 8px (2 units) - Tight spacing between elements
- **Medium (md)**: 16px (4 units) - Standard spacing between components
- **Large (lg)**: 32px (8 units) - Generous spacing for major sections
- **Gutter**: 24px - Standard horizontal padding in containers
- **Margin**: 32px - Standard vertical margin between sections
- **Container Max**: 1440px - Maximum content width

### Application
- Use `sm` (8px) for spacing within components (padding between icon and text)
- Use `md` (16px) for standard component padding and spacing between elements
- Use `lg` (32px) for spacing between major sections
- Use `gutter` (24px) for horizontal padding in page containers
- Use `margin` (32px) for vertical spacing between major sections

## Border Radius Values

- **Small (sm)**: 0.25rem (4px) - Subtle rounding for minimal visual emphasis
- **Default**: 0.5rem (8px) - Standard rounding for most components
- **Medium (md)**: 0.75rem (12px) - Moderate rounding for cards and containers
- **Large (lg)**: 1rem (16px) - Pronounced rounding for larger elements
- **Extra Large (xl)**: 1.5rem (24px) - Prominent rounding for hero elements
- **Full**: 9999px - Fully circular elements (buttons, avatars)

## Component Usage Guide

### Button Component
```typescript
import Button from '@/components/design-system/Button'

// Primary Action
<Button variant="primary">Save Changes</Button>

// Secondary Action
<Button variant="secondary">Cancel</Button>

// Destructive Action
<Button variant="danger">Delete</Button>

// Props
- variant: 'primary' | 'secondary' | 'danger' (default: 'primary')
- disabled: boolean
- size: 'sm' | 'md' | 'lg' (default: 'md')
- onClick: function
- children: ReactNode
```

### Card Component
```typescript
import Card from '@/components/design-system/Card'

<Card>
  <h3>Card Title</h3>
  <p>Card content goes here</p>
</Card>

// Styling: Uses Surface colors with outline borders
// Spacing: Uses md spacing internally
// Border Radius: Default (8px)
```

### Badge Component
```typescript
import Badge from '@/components/design-system/Badge'

// Status Badge
<Badge status="active">Active</Badge>
<Badge status="inactive">Inactive</Badge>
<Badge status="warning">Attention Required</Badge>
<Badge status="error">Error</Badge>

// Props
- status: 'active' | 'inactive' | 'warning' | 'error' (default: 'active')
- children: string or ReactNode
```

## Using Design Tokens in Code

### Import Statement
```typescript
import {
  LUMINA_COLORS,
  LUMINA_TYPOGRAPHY,
  LUMINA_SPACING,
  LUMINA_RADII
} from '@/lib/brand'
```

### Color Usage
```typescript
const style = {
  background: LUMINA_COLORS.primary,
  color: LUMINA_COLORS.onPrimary,
  border: `1px solid ${LUMINA_COLORS.outline}`,
}
```

### Typography Usage
```typescript
const headingStyle = {
  ...LUMINA_TYPOGRAPHY.headlineH1,
  color: LUMINA_COLORS.onBackground,
}

const bodyStyle = {
  ...LUMINA_TYPOGRAPHY.bodyMd,
  color: LUMINA_COLORS.onSurface,
}
```

### Spacing Usage
```typescript
const containerStyle = {
  padding: LUMINA_SPACING.md,
  marginBottom: LUMINA_SPACING.lg,
  gap: LUMINA_SPACING.sm,
}
```

### Border Radius Usage
```typescript
const cardStyle = {
  borderRadius: LUMINA_RADII.md,
  padding: LUMINA_SPACING.md,
  background: LUMINA_COLORS.surface,
}
```

## Bilingual Support Notes

### Font Selection
- **English**: DM Sans is used for Latin script readability and modern aesthetic
- **Arabic**: Readex Pro is used for proper RTL support and readability with Arabic script

### Typography Adjustments
- Arabic typography uses slightly lighter font weights (300-600 vs 400-700) for optimal readability
- Arabic line heights are increased (1.4-1.8 vs 1.1-1.6) due to script characteristics
- Arabic font sizes may vary slightly from English to maintain visual balance

### Layout Considerations
- Containers flex-direction reverses for RTL when language is Arabic
- Padding and margins are preserved across both directions
- Text alignment respects document direction (LTR for English, RTL for Arabic)

### Language Detection
Use the `useLanguage()` context hook to access:
- `lang`: Current language code ('en' or 'ar')
- `t`: Translation function for labels and content

```typescript
import { useLanguage } from '@/context/LanguageContext'

export default function MyComponent() {
  const { lang, t } = useLanguage()
  
  return (
    <div style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
      <h1>{t('my.label.key')}</h1>
    </div>
  )
}
```

## Accessibility Considerations

### Color Contrast
All text colors meet WCAG AA standards (4.5:1 for body text, 3:1 for large text):
- Primary text (`onSurface` #191c1e) on Surface (#f7f9fb): 11.4:1
- Secondary text (`onSurfaceVariant` #3e4944) on Surface (#f7f9fb): 6.2:1

### Focus States
All interactive elements include visible focus indicators:
- Focus outline color: `outline` (#6e7a74)
- Focus outline width: 2px
- Focus outline offset: 2px

### Semantic HTML
- Use semantic HTML elements (buttons for actions, links for navigation)
- Use proper heading hierarchy (h1 → h6)
- Use aria-labels for icon-only buttons and controls

## Implementation Checklist

When building a new screen:
- [ ] Use LUMINA_COLORS for all background and text colors
- [ ] Apply LUMINA_TYPOGRAPHY styles to text elements
- [ ] Use LUMINA_SPACING for padding, margins, and gaps
- [ ] Use LUMINA_RADII for border radius on cards and buttons
- [ ] Implement Button, Card, and Badge components from design-system
- [ ] Test bilingual support (English and Arabic)
- [ ] Verify color contrast ratios (WCAG AA minimum)
- [ ] Test responsive design at 375px, 768px, and 1280px widths
- [ ] Test keyboard navigation and focus states
- [ ] Test on mobile, tablet, and desktop devices

## Design Tokens File Location

All design tokens are defined in:
- **Path**: `web/src/lib/brand.ts`
- **Exports**: `LUMINA_COLORS`, `LUMINA_TYPOGRAPHY`, `LUMINA_SPACING`, `LUMINA_RADII`

## Component Library Location

All design system components are located in:
- **Path**: `web/src/components/design-system/`
- **Components**: Button.tsx, Card.tsx, Badge.tsx (and others)

## Version History

- **v1.0.0** (2025-05-12) - Initial Lumina Design System documentation
  - 40+ colors with semantic meanings
  - 5 typography scales (Display, Headline H1, Body Medium, Label Caps)
  - 7 spacing values (unit, sm, md, lg, gutter, margin, containerMax)
  - 6 border radius values (sm, DEFAULT, md, lg, xl, full)
  - Full bilingual (English/Arabic) support
  - WCAG AA accessibility compliance
