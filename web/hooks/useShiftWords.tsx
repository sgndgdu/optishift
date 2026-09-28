"use client";

import { createContext, useContext } from "react";
import { shiftWords, type ShiftWords } from "@/lib/templates/nudges";

// Personel portalı: şubenin sektörüne göre "vardiya / nöbet / posta". Değeri portal layout'u sağlar.
export const ShiftWordsContext = createContext<ShiftWords>(shiftWords(null));

export const useShiftWords = () => useContext(ShiftWordsContext);

// Personel portalı: şubede uygunluk toplama açık mı (rules.availability_collection_enabled).
// null = henüz yüklenmedi; sayfalar bu sürede uygunluk uyarısı göstermez.
export const AvailabilityEnabledContext = createContext<boolean | null>(null);

export const useAvailabilityEnabled = () => useContext(AvailabilityEnabledContext);
