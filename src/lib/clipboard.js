// Copia texto al portapapeles con fallback para WebViews / contextos no seguros
// donde navigator.clipboard no existe o rechaza la escritura. Lanza error si ambos fallan.
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Sigue con el método alternativo.
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    if (!document.execCommand('copy')) throw new Error('execCommand("copy") rechazado');
  } finally {
    document.body.removeChild(area);
  }
}
