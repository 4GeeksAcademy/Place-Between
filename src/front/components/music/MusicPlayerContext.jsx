import { createContext } from "react";

/**
 * Context esperado:
 * - soundEnabled: boolean
 * - toggleSound: () => void
 * - enableSound: () => void (por compat)
 * - disableSound: () => void
 */
export const MusicPlayerContext = createContext(null);