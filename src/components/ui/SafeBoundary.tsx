import React from 'react';

// Red de seguridad: si una escena (p. ej. un <Canvas> de three sin WebGL2) lanza un error al
// renderizar, React desmontaba TODA la aplicación y la página quedaba en negro. Con esta frontera
// solo se cae esa escena y se muestra su respaldo (`fallback`, por defecto nada).
export class SafeBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode; name?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // no se propaga: el resto de la página sigue funcionando
    // eslint-disable-next-line no-console
    console.warn(`[SafeBoundary] ${this.props.name ?? 'escena'} desactivada:`, error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
