const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant → value for <input type="datetime-local"> in the browser's zone. */
export const toLocalInput = (isoString: string) => {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '');
