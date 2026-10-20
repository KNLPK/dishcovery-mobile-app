/**
 * constants/theme.ts
 *
 * The app's existing colour identity, written down.
 *
 * Nothing here is a new palette. Every value was already in use across
 * HomePage, Search, ChefHat and recipe — #20515a for primary text and icons,
 * #abe1e5 for the active/banner accent, #f3f7f8 for input surfaces, #1a2b3b for
 * headings. They were repeated as literals in four StyleSheets and had drifted
 * slightly apart. Collecting them changes no colour; it just makes the identity
 * consistent and gives spacing and type a scale instead of ad-hoc numbers.
 */

export const palette = {
  /** Primary: headings, icons, the brand teal. */
  primary: '#20515a',
  /** Accent: active chips, banners. */
  accent: '#abe1e5',
  /** Secondary accent for fills (progress bars). Too light for text: 1.9:1 on white. */
  accentDeep: '#7ec8c9',
  /** Heading ink, slightly warmer than primary. */
  ink: '#1a2b3b',
  /** Body copy. */
  body: '#3d4d5c',
  /**
   * Secondary copy, timestamps, units, placeholders. Darkened from #7b8a97
   * (3.5:1 on white) to reach 4.5:1 on every light surface the app uses.
   */
  muted: '#5f6e7a',
  /** Decorative only (dividers, disabled fills); never for text or meaning. */
  faint: '#b0b0b0',

  /** Page backgrounds already in use. */
  surface: '#ffffff',
  surfaceAlt: '#f9faf7',
  surfaceTint: '#f3f7f8',
  surfaceCool: '#eaf4f4',

  /** Hairlines. */
  border: '#e2eaec',

  /** States. */
  danger: '#b3261e',
  dangerSurface: '#fdecea',
  success: '#1f7a56',
} as const;

/**
 * One colour per serialization format, used by every chart so a format looks
 * the same everywhere. JSON keeps the brand teal; the other two are chosen to
 * stay apart from it and from each other, including for red-green colour
 * blindness. Bars are always labelled as well, never colour alone.
 */
export const formatColors = {
  json: '#20515a',
  msgpack: '#3d9fa3',
  protobuf: '#d08a2e',
} as const;

/** Minimum touch target, in dp (Android accessibility guideline). */
export const touchTarget = 48;

/** 4-point spacing scale. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/**
 * Type scale. Sizes match what the screens already used; the weights and line
 * heights are the part that was missing, which is why the old screens read as
 * flat — everything was bold at one of two sizes.
 */
export const type = {
  title: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  section: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  cardTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  body: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  caption: { fontSize: 11, fontWeight: '500', lineHeight: 15 },
} as const;

/** One elevation, used consistently instead of five slightly different shadows. */
export const shadow = {
  card: {
    shadowColor: '#0b2b33',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
} as const;
