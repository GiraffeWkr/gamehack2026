import type { CSSProperties, ReactNode } from 'react';
import { useEffect } from 'react';
import type { ResourceKey } from '../../game/types';
import { RESOURCES } from '../../game/data/constants';
import { formatNumber } from '../../game/meta/format';
import { PixelIcon } from './PixelIcon';

export function PixelButton({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  disabled,
  icon,
  className = '',
  title,
  type = 'button',
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'ghost' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  title?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={`pixel-btn pixel-btn--${variant} pixel-btn--${size} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon ? <span className="pixel-btn__icon">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

export function ResourceChip({
  resource,
  amount,
  compact = false,
  onClick,
  showName = false,
}: {
  resource: ResourceKey;
  amount: number;
  compact?: boolean;
  onClick?: () => void;
  showName?: boolean;
}) {
  const meta = RESOURCES[resource];
  return (
    <button
      type="button"
      className={`resource-chip ${compact ? 'resource-chip--compact' : ''} ${onClick ? 'resource-chip--clickable' : ''}`}
      onClick={onClick}
      title={`${meta.name} — ${meta.description}`}
      style={{ '--resource-color': meta.color } as CSSProperties}
    >
      <span className="resource-chip__icon">
        <PixelIcon name={meta.icon} size={compact ? 14 : 17} />
      </span>
      <span className="resource-chip__value">{formatNumber(amount)}</span>
      {showName ? <span className="resource-chip__name">{meta.name}</span> : null}
    </button>
  );
}

export function Panel({
  children,
  title,
  eyebrow,
  action,
  className = '',
  style,
  noPadding,
}: {
  children: ReactNode;
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
  noPadding?: boolean;
}) {
  return (
    <section className={`pixel-panel ${noPadding ? 'pixel-panel--flush' : ''} ${className}`} style={style}>
      {title || eyebrow || action ? (
        <header className="pixel-panel__head">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            {title ? <h2 className="pixel-panel__title">{title}</h2> : null}
          </div>
          {action ? <div className="pixel-panel__action">{action}</div> : null}
        </header>
      ) : null}
      <div className="pixel-panel__body">{children}</div>
    </section>
  );
}

export function Meter({
  value,
  max = 1,
  color = 'var(--gold)',
  height = 8,
  label,
  right,
  className = '',
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  label?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className={`meter-wrap ${className}`}>
      {label || right ? (
        <div className="meter-label">
          <span>{label}</span>
          <span>{right}</span>
        </div>
      ) : null}
      <div className="meter" style={{ height }}>
        <div className="meter__fill" style={{ width: `${ratio * 100}%`, background: color }} />
        <div className="meter__notches" />
      </div>
    </div>
  );
}

export function Modal({
  title,
  eyebrow,
  children,
  footer,
  onClose,
  wide,
  className = '',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`pixel-modal ${wide ? 'pixel-modal--wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="pixel-modal__corners" aria-hidden />
        <header className="pixel-modal__head">
          <div>
            {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
            <h2>{title}</h2>
          </div>
          {onClose ? (
            <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
              <PixelIcon name="close" size={18} />
            </button>
          ) : null}
        </header>
        <div className="pixel-modal__body">{children}</div>
        {footer ? <footer className="pixel-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  danger,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  return (
    <Modal
      title={title}
      eyebrow="审判庭终端"
      onClose={onCancel}
      footer={
        <>
          <PixelButton variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </PixelButton>
          <PixelButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </PixelButton>
        </>
      }
    >
      <div className="confirm-copy">{description}</div>
    </Modal>
  );
}

export function StatRow({
  label,
  value,
  icon,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="stat-row">
      <span className="stat-row__label">
        {icon ? <span className="stat-row__icon">{icon}</span> : null}
        {label}
      </span>
      <span className="stat-row__value" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
    </div>
  );
}

export function Tag({
  children,
  color,
  filled,
}: {
  children: ReactNode;
  color?: string;
  filled?: boolean;
}) {
  return (
    <span
      className={`tag ${filled ? 'tag--filled' : ''}`}
      style={color ? ({ '--tag-color': color } as CSSProperties) : undefined}
    >
      {children}
    </span>
  );
}

export function Divider({ ornament = true }: { ornament?: boolean }) {
  return (
    <div className={`divider ${ornament ? 'divider--ornament' : ''}`} aria-hidden>
      {ornament ? <span>✦</span> : null}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description: string; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="pixel-tooltip" data-tooltip={text}>
      {children}
    </span>
  );
}
