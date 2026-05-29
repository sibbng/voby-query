// Shared UI primitives used across examples

export const Tag = ({ children }: { children: JSX.Element }) => (
  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-white/5 text-white/40 border border-white/10">
    {children}
  </span>
);

export const Card = ({ children }: { children: JSX.Element }) => (
  <div class="rounded-xl border border-white/8 bg-[#111] p-5 flex flex-col gap-4">{children}</div>
);

export const Btn = ({
  children,
  onClick,
  type = 'button',
}: {
  children: JSX.Element;
  onClick?: () => void;
  type?: 'button' | 'submit';
}) => (
  <button
    type={type}
    onClick={onClick}
    class="px-3 py-1.5 rounded-lg text-sm font-medium bg-white/8 text-white/70 border border-white/10 hover:bg-white/12 hover:text-white transition-colors cursor-pointer"
  >
    {children}
  </button>
);
