import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';

export default function PageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-[20px] bg-sage text-forest">
          <Leaf className="h-6 w-6" strokeWidth={1.7} />
        </span>
        <h1 className="mt-4 font-display text-[28px] leading-tight text-foreground">
          No encontramos esa página
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Puede que el enlace sea viejo o que la dirección esté mal escrita.
        </p>
        <Link to="/" className="btn-primary press mt-6 h-12 px-6">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}