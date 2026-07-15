// Botão de ação em ícone: cor própria por ação, descrição no hover (title)
// e no leitor de tela (aria-label) — os textos são os mesmos dos antigos botões.
export type ActionIconName =
  | 'reserve'
  | 'pay'
  | 'pickup'
  | 'release'
  | 'deliver'
  | 'done'
  | 'undo'
  | 'note'
  | 'cancel'
  | 'summary'
  | 'edit'
  | 'alert';

// paths de 16x16, stroke 1.5 (desenho simples, tom editorial)
const ICON_PATHS: Record<ActionIconName, string> = {
  reserve: 'M4 2h8v12l-4-3-4 3z',
  pay: 'M8 1v14M11.5 3.5h-5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4h-6',
  pickup: 'M2 5l6-3 6 3v6l-6 3-6-3zM2 5l6 3 6-3M8 8v6',
  release: 'M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3',
  deliver: 'M1 4h8v7H1zM9 6h3l3 3v2h-6zM4 13a1.4 1.4 0 1 0 0-.01M12 13a1.4 1.4 0 1 0 0-.01',
  done: 'M2.5 8.5l4 4 7-8',
  undo: 'M3 8a5 5 0 1 1 1.5 3.5M3 14v-3h3',
  note: 'M2 3h12v8H6l-3 3v-3H2z',
  cancel: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  summary: 'M5 2h6v2H5zM3 4h10v10H3zM5.5 8h5M5.5 11h5',
  edit: 'M3 13v-2.5L10.5 3l2.5 2.5L5.5 13zM9 4.5l2.5 2.5',
  alert: 'M8 2l6.5 11.5h-13zM8 6.5V10M8 12v.01',
};

// só o desenho (pra botões que precisam de ícone + texto, como o modal mobile)
export function ActionGlyph({ icon }: { icon: ActionIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[icon]} />
    </svg>
  );
}

export function ActionIcon({
  icon,
  label,
  variant,
  filled,
  onClick,
}: {
  icon: ActionIconName;
  label: string;
  variant: string; // sufixo de cor: teal | green | amber | gray | blue | forest | red | ink
  filled?: boolean;
  onClick: () => void;
}) {
  return (
    // tooltip é CSS puro (::after lê o aria-label) — o title nativo duplicaria
    <button
      className={`action-icon action-icon--${variant}${filled ? ' action-icon--filled' : ''}`}
      aria-label={label}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={ICON_PATHS[icon]} />
      </svg>
    </button>
  );
}
