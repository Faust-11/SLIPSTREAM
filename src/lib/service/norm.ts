/** Ключ пошуку: нижній регістр, без наголосів і діакритики (Hülkenberg → hulkenberg). Спільний для сервера й клієнта. */
export const normKey = (s: string) => s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
