/**
 * Detects if a string contains a potential phone number and returns a WhatsApp link.
 * 
 * @param contact The contact string (could be email, phone number, or both/text)
 * @returns The wa.me link or null if no valid sequence of digits is found
 */
export function getWhatsAppLink(contact: string | null | undefined): string | null {
  if (!contact) return null;

  // Extract only digits
  const digits = contact.replace(/\D/g, '');

  // A phone number usually has between 10 and 15 digits (including country code)
  // For Mexico (common in this context), it's 10 digits or 12 with 52
  if (digits.length >= 10 && digits.length <= 15) {
    // If it's 10 digits and doesn't start with 52 (Mexico), we could optionally add it
    // But wa.me works best if the user provides the full number.
    // For now, let's just use the digits as provided.
    return `https://wa.me/${digits}`;
  }

  return null;
}
