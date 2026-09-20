export const COLORS = {
  primary: '#10b981',         // Emerald Green Accent
  primaryHover: '#059669',    // Darker Green
  primaryGlow: 'rgba(16, 185, 129, 0.2)',
  
  accentCyan: '#059669',
  accentEmerald: '#047857',
  accentRose: '#dc2626',      // Deep Rose Red Alert
  accentAmber: '#d97706',     // Warning Amber
  
  bgPrimary: '#ffffff',
  bgSecondary: '#f8fafc',
  bgDark: '#0f172a',
  
  glassBg: 'rgba(255, 255, 255, 0.85)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  glassHighlight: 'rgba(0, 0, 0, 0.03)',
  
  textMain: '#000000',
  textMuted: '#4b5563',
  textDim: '#9ca3af',
  textLight: '#ffffff',
};

export const GLASS_STYLE = {
  backgroundColor: COLORS.glassBg,
  borderWidth: 1,
  borderColor: COLORS.glassBorder,
  borderRadius: 14,
  boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.06)',
  elevation: 3,
};

export const GLASS_CARD_INTERACTIVE = {
  ...GLASS_STYLE,
  borderColor: 'rgba(16, 185, 129, 0.25)',
};
