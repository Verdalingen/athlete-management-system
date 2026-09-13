import type { Language } from "../language";
import { en } from "./en";
import { no } from "./no";

export const dictionaries: Record<Language, typeof en> = { en, no };
