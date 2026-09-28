"use client";

import { createContext, useContext } from "react";
import { shiftWords, type ShiftWords } from "@/lib/templates/nudges";

// Personel portalı: şubenin sektörüne göre "vardiya / nöbet / posta". Değeri portal layout'u sağlar.
export const ShiftWordsContext = createContext<ShiftWords>(shiftWords(null));

export const useShiftWords = () => useContext(ShiftWordsContext);
