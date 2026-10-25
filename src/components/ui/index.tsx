import { useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type PointerEvent, type ReactNode, type SelectHTMLAttributes } from 'react';

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' ');

export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cx('min-h-12 rounded-2xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', variant === 'primary' && 'bg-brand text-white shadow-sm hover:bg-red-700', variant === 'secondary' && 'bg-white text-ink ring-1 ring-black/10 hover:bg-neutral-50', variant === 'ghost' && 'text-ink hover:bg-black/5', variant === 'danger' && 'bg-red-50 text-brand hover:bg-red-100', className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('min-h-12 w-full rounded-2xl border-0 bg-white px-4 text-sm text-ink shadow-sm outline-none ring-1 ring-black/10 placeholder:text-neutral-400 focus:ring-2 focus:ring-brand', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('min-h-12 w-full appearance-none rounded-2xl border-0 bg-white px-4 text-sm text-ink shadow-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-brand', className)} {...props}>{children}</select>;
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) { return <div className={cx('rounded-3xl bg-white shadow-float ring-1 ring-black/5', className)} {...props}>{children}</div>; }

export function Spinner({ className = '' }: { className?: string }) { return <span aria-label="Загрузка" className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />; }

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}><Card className="w-full max-w-md p-5" onMouseDown={(e) => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><Button variant="ghost" className="min-h-10 px-3" onClick={onClose} aria-label="Закрыть">✕</Button></div>{children}</Card></div>;
}

export function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const startY = useRef<number | null>(null);
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    setOffset(Math.max(0, event.clientY - startY.current));
  };
  const handlePointerUp = () => {
    if (offset > 90) onClose();
    startY.current = null;
    setOffset(0);
  };
  if (!open) return null;
  return <div className="fixed inset-0 z-40 flex items-end bg-black/30" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}><div className="animate-sheet-in safe-bottom max-h-[88vh] w-full overflow-y-auto rounded-t-[2rem] bg-white px-4 pb-5 pt-3 shadow-2xl" style={{ transform: `translateY(${offset}px)` }} onMouseDown={(e) => e.stopPropagation()} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}><div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300" aria-hidden="true" /><div className="mx-auto max-w-xl"><div className="mb-4 flex items-start justify-between gap-3"><h2 className="text-xl font-bold">{title}</h2><Button variant="ghost" className="min-h-10 shrink-0 px-3" onClick={onClose} aria-label="Закрыть">✕</Button></div>{children}</div></div></div>;
}
