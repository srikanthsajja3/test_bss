// IPTV pack rules shared by the IPTV and Combo recharge screens (the server checks the same,
// see iptv_pack_rules.php):
//   - a DPO always comes with the FTA base pack (chargeable); FTA alone is allowed
//   - an add-on (A-la-carte / Broadcaster) can't be taken when one of its channels is already
//     in the DPO / FTA or in another selected add-on — Pioneer refuses such a renewal.
// pack.channel_ids: Pioneer channel ids of the pack, or null when never synced (not checked).

/** The operator's FTA pack (cheapest when several are assigned), or null. */
export const pickFta = (ftaPacks = []) =>
  (ftaPacks || []).filter((p) => p && p.price !== null && p.price !== undefined).sort((a, b) => Number(a.price) - Number(b.price))[0] || null;

/** Map channel_id -> pack name for the given packs (in order; the first owner wins). */
export const ownedChannels = (packs = []) => {
  const owned = new Map();
  packs.filter(Boolean).forEach((p) => {
    (p.channel_ids || []).forEach((cid) => {
      if (!owned.has(cid)) owned.set(cid, p.plan_name);
    });
  });
  return owned;
};

/** Why this pack can't be added on top of `owned` (null = it can). */
export const overlapReason = (pack, owned) => {
  const hits = new Map();
  (pack?.channel_ids || []).forEach((cid) => {
    if (owned.has(cid)) {
      const by = owned.get(cid);
      hits.set(by, (hits.get(by) || 0) + 1);
    }
  });
  if (!hits.size) return null;
  const parts = [...hits.entries()].map(([by, n]) => (pack.channel_ids.length === 1 ? `Already in ${by}` : `${n} channel${n > 1 ? 's' : ''} already in ${by}`));
  return parts.join(' · ');
};

/**
 * Selected add-ons that clash with the base packs or with an add-on selected before them.
 * Returns Map(sub_plan_id -> reason).
 */
export const selectedConflicts = (basePacks = [], selectedAddons = []) => {
  const owned = ownedChannels(basePacks);
  const out = new Map();
  selectedAddons.forEach((p) => {
    const why = overlapReason(p, owned);
    if (why) out.set(p.sub_plan_id, why);
    else (p.channel_ids || []).forEach((cid) => owned.has(cid) || owned.set(cid, p.plan_name));
  });
  return out;
};
