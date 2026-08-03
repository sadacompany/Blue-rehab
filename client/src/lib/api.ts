const base = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export const apiUrl = (path: string) => `${base}${path.startsWith("/") ? path : `/${path}`}`;
