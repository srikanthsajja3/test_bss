import React, { useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * A horizontal strip of tabs / buttons that may not fit (phones). When it scrolls it shows:
 *   - a ‹ / › arrow on the side that has more (tap = scroll a page that way)
 *   - a thin bar under the strip showing where you are
 * Nothing extra shows when everything fits.
 *
 *   <ScrollTabs style={...} contentContainerStyle={{ padding: 5, gap: 4 }}>{buttons}</ScrollTabs>
 */
export const ScrollTabs = ({ children, style, contentContainerStyle, barColor = '#94a3b8' }) => {
  const ref = useRef(null);
  const [box, setBox] = useState(0);
  const [content, setContent] = useState(0);
  const [x, setX] = useState(0);
  const scrolls = content > box + 2;
  const canLeft = scrolls && x > 2;
  const canRight = scrolls && x < content - box - 2;
  const go = (dir) => ref.current?.scrollTo({ x: Math.max(0, Math.min(content - box, x + dir * box * 0.7)), animated: true });
  const thumbW = scrolls ? Math.max(24, (box / content) * box) : 0;
  const thumbX = scrolls ? (x / Math.max(1, content - box)) * (box - thumbW) : 0;
  return (
    <View style={[st.wrap, style]}>
      <View style={{ position: 'relative' }}>
        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => setBox(e.nativeEvent.layout.width)}
          onContentSizeChange={(w) => setContent(w)}
          onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          contentContainerStyle={[{ flexDirection: 'row', alignItems: 'center' }, contentContainerStyle, scrolls && { paddingRight: 34 }]}
        >
          {children}
        </ScrollView>
        {canLeft ? (
          <TouchableOpacity style={[st.arrow, st.left]} onPress={() => go(-1)} accessibilityLabel="Scroll left">
            <Feather name="chevron-left" size={16} color="#334155" />
          </TouchableOpacity>
        ) : null}
        {canRight ? (
          <TouchableOpacity style={[st.arrow, st.right]} onPress={() => go(1)} accessibilityLabel="Scroll right">
            <Feather name="chevron-right" size={16} color="#334155" />
          </TouchableOpacity>
        ) : null}
      </View>
      {scrolls ? (
        <View style={st.track}>
          <View style={[st.thumb, { width: thumbW, left: thumbX, backgroundColor: barColor }]} />
        </View>
      ) : null}
    </View>
  );
};

const st = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  arrow: {
    position: 'absolute', top: 0, bottom: 0, width: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  left: { left: 0, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  right: { right: 0, borderLeftWidth: 1, borderLeftColor: '#e2e8f0' },
  track: { height: 3, marginHorizontal: 10, marginBottom: 5, borderRadius: 2, backgroundColor: '#eef2f7' },
  thumb: { position: 'absolute', top: 0, height: 3, borderRadius: 2 },
});

export default ScrollTabs;
