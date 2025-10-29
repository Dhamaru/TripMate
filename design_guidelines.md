# TripMate Design Guidelines

## Design Approach

**Reference-Based: iOS-Inspired Dark Interface**
Drawing from Apple's iOS design language (Apple Maps, Photos, Weather apps) with emphasis on depth, translucency, and premium feel. The design prioritizes clarity through generous spacing, bold typography, and glass-morphic UI elements that feel native to iOS while working beautifully on web.

---

## Typography System

**Primary Font**: SF Pro Display (via CDN) or Inter as fallback
**Secondary Font**: SF Pro Text or system font stack

**Hierarchy**:
- Display/Hero: 4xl to 6xl, font-weight 700, tight letter-spacing
- Section Headings: 3xl to 4xl, font-weight 600
- Component Titles: xl to 2xl, font-weight 600
- Body Text: base to lg, font-weight 400, relaxed line-height (1.6)
- Captions/Meta: sm to base, font-weight 500, reduced opacity
- Button Text: base, font-weight 600, tracking-wide

---

## Layout & Spacing System

**Tailwind Unit Pattern**: Use 4, 6, 8, 12, 16, 20, 24 for consistent rhythm
- Component padding: p-6 to p-8
- Section spacing: py-16 to py-24 (desktop), py-12 (mobile)
- Container max-width: max-w-7xl with px-6
- Card gaps: gap-6 to gap-8
- Element spacing: space-y-4 to space-y-6

**Grid System**:
- Hero/Features: Single column on mobile, 2-3 columns on desktop
- Feature cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard content: Flexible grid based on widgets

---

## Component Library

### Navigation
**Top Navigation Bar**:
- Translucent backdrop-blur effect (iOS style)
- Sticky position with subtle shadow on scroll
- Logo left, main nav center, profile/settings right
- Mobile: Hamburger menu with slide-in panel
- Height: h-16 to h-20

### Hero Section
**Full-width immersive hero** (80vh on desktop, auto on mobile):
- Large background travel image (mountains, beaches, or cityscapes at golden hour)
- Dark gradient overlay for text legibility
- Centered content with headline, subheading, primary CTA
- Search bar component: Translucent glass card with rounded-full input, location icon, search button
- Floating glass-morphic cards showing: "500K+ trips planned" and "Available in 150+ countries"

**Button Treatment on Hero**: Backdrop-blur background (iOS frosted glass effect), rounded-full, bold text, no border

### Core Sections

**1. Key Features Grid** (py-20):
- 3-column grid showcasing: AI Trip Planning, Smart Journaling, Offline Maps, Live Weather, Currency Tools, Photo Timeline
- Each card: Icon (Heroicons), title, description, subtle gradient backdrop
- Cards use backdrop-blur with rounded-3xl borders
- Hover: Subtle lift effect (no complex animations)

**2. AI Trip Planner Showcase** (py-24):
- Two-column layout: Left = large mockup/screenshot, Right = benefits list
- Mockup shows conversation-style AI interface
- Benefits presented as checklist with icons
- Include: "Personalized itineraries in seconds", "Budget-aware suggestions", "Local insider tips"

**3. Travel Journal Preview** (py-20):
- Timeline-style layout showing sample journal entries
- Cards with travel photos, dates, location pins, mood indicators
- Staggered layout creating visual interest (not strict grid)
- "Start Your Journey" CTA at bottom

**4. Mobile App Showcase** (py-24):
- Phone mockup displaying app interface
- Feature callouts pointing to: Offline maps, Quick currency conversion, Weather widgets
- Background: Subtle map pattern or travel-themed illustration

**5. Social Proof & Stats** (py-16):
- 4-column stat grid: "2M+ travelers", "150+ countries", "5M+ memories saved", "4.8★ rating"
- Large numbers with descriptive labels
- Centered layout

**6. Final CTA Section** (py-24):
- Centered content with compelling headline
- Dual CTAs: "Start Planning Free" (primary), "Watch Demo" (secondary)
- Background: Subtle gradient or abstract travel pattern

### Footer
**Comprehensive iOS-style footer**:
- Multi-column layout: Product links, Resources, Company, Social
- Newsletter signup card with glass-morphic styling
- App store badges (iOS/Android)
- Legal links, language selector
- All text uses reduced opacity for hierarchy

### UI Components

**Cards**:
- Rounded-3xl corners (iOS style)
- Backdrop-blur glass-morphic treatment
- Subtle borders with reduced opacity
- Padding: p-6 to p-8

**Buttons**:
- Primary: Rounded-full, bold text, medium height (h-12)
- Secondary: Rounded-full, border style, backdrop-blur
- Icon buttons: Rounded-full, icon-only, w-12 h-12

**Form Inputs**:
- Rounded-2xl styling
- Backdrop-blur on focus
- Placeholder text with reduced opacity
- Icon prefix support (search, location, calendar)

**Badges/Tags**:
- Rounded-full, small text (text-xs to text-sm)
- Backdrop-blur treatment
- Used for: Trip status, weather conditions, currency labels

---

## Images Section

**Hero Image**: 
Full-width background image of stunning travel destination (recommended: aerial view of tropical coastline at sunset, mountain valley with lakes, or iconic cityscape). Image should evoke wanderlust and adventure. Position: Cover, center. Overlay: Dark gradient (top to bottom) for text legibility.

**AI Planner Section**: 
Screenshot/mockup showing chat-style AI interface with sample trip suggestions. Clean, realistic UI showing conversation flow.

**Journal Preview**: 
4-6 sample travel photos (beach sunset, street food, mountain hiking, city exploration). Authentic travel photography, not stock poses. Images: 400x300px minimum, landscape orientation.

**Mobile Mockup**: 
Phone frame displaying app's map interface with location pins and route overlay. Professional device mockup.

---

## Icon System

**Library**: Heroicons (outline style for most elements, solid for emphasis)
**Key Icons**: 
- Navigation: map-pin, globe, camera, calendar, user-circle
- Features: sparkles (AI), cloud-sun (weather), currency-dollar, map, book-open
- Actions: search, plus, share, heart, bookmark

---

## Animations & Interactions

**Minimal, Purposeful Motion**:
- Scroll-triggered fade-ins for sections (subtle, once)
- Card hover: Transform scale(1.02) with smooth transition
- Button hover: Native iOS-style subtle darkening
- Navigation: Smooth scroll behavior
- NO complex scroll animations, parallax, or distracting motion

---

## Accessibility

- Maintain WCAG AA contrast ratios despite dark theme
- Focus states: Visible outline on all interactive elements
- Semantic HTML structure throughout
- Alt text for all imagery
- Keyboard navigation fully supported
- Form labels and ARIA attributes implemented consistently

---

## Layout Principles

**Depth Through Layering**: Use backdrop-blur and subtle shadows to create iOS-style depth hierarchy without relying on heavy shadows.

**Generous Breathing Room**: Don't crowd elements. iOS aesthetic prioritizes whitespace and clarity.

**Content-First**: Let travel imagery and content shine. UI elements should feel elegant but not compete with content.

**Responsive Strategy**: Mobile-first approach with thoughtful breakpoints. Cards stack gracefully, navigation condenses cleanly.