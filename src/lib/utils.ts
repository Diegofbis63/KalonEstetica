import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskPhone(phone: string | undefined, role: string | undefined) {
  if (!phone || role === "admin") return phone || "";
  const cleaned = phone.replace(/\s/g, "");
  if (cleaned.length < 8) return phone;
  // Format: +54 9 351 **** 864
  const lastThree = cleaned.slice(-3);
  const firstPart = cleaned.slice(0, Math.max(0, cleaned.length - 7));
  return `${firstPart} **** ${lastThree}`;
}
