// Einfache Formular-Validierung (wie im Legacy-Bundle).

export const isEmail = (value) => /.+@.+\..+/.test(value.trim());

export const isPhone = (value) => /^[+\d][\d\s\-/().]{5,}$/.test(value.trim());

// Ein Betrieb gilt als konfiguriert, wenn er buchbare Tage UND Zeitfenster
// hat (entweder global loc.slots oder pro Wochentag loc.slotsByDay).
export const isVenueConfigured = (loc) =>
  !!(
    (loc.days || []).length &&
    ((loc.slots || []).length || Object.keys(loc.slotsByDay || {}).length)
  );
