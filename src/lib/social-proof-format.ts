export function formatSocialProofMessage(productName: string, productCode?: string) {
  const code = productCode?.trim();

  if (code) {
    return `تم عمل أوردر: ${productName} — ${code}`;
  }

  return `تم عمل أوردر: ${productName}`;
}
