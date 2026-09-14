import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import "./settings-ui.css";

/** macOS Settings language: group title, rounded card, rows with title +
 *  description on the left and one control on the right. Apple HIG materials,
 *  tactile pointer-down feedback, and progressive disclosure. */
export function SettingsGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <div className="settings-group-header">
        <h3 className="settings-group-title">{title}</h3>
        {action && <div className="settings-group-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="settings-card">{children}</div>;
}

export function SettingsRow({
  title,
  description,
  control,
  children,
  icon,
  iconBg,
  iconColor,
}: {
  title: string;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <div className="settings-row">
      {icon && (
        <div
          className="settings-row-icon"
          style={{
            backgroundColor: iconBg || "var(--accent)",
            color: iconColor || "#ffffff",
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="settings-row-text">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </div>
      {control && <div className="settings-row-control">{control}</div>}
      {children && <div className="settings-row-full">{children}</div>}
    </div>
  );
}

export function SettingsNavRow({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  badge,
  badgeVariant,
  href,
  onClick,
}: {
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  badgeVariant?: "neutral" | "success" | "warning" | "accent";
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon && (
        <div
          className="settings-row-icon"
          style={iconBg ? { backgroundColor: iconBg, color: iconColor || "#ffffff" } : undefined}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <div className="settings-row-text">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </div>
      <div className="settings-nav-meta">
        {badge && (
          <span className={`settings-nav-badge${badgeVariant ? ` ${badgeVariant}` : ""}`}>
            {badge}
          </span>
        )}
        <ChevronRight size={15} className="settings-nav-chevron" aria-hidden="true" />
      </div>
    </>
  );

  if (href) {
    return (
      <a href={href} className="settings-row settings-nav-row" onClick={onClick}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className="settings-row settings-nav-row"
      onClick={onClick}
    >
      {content}
    </button>
  );
}

export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="switch"
      data-on={checked || undefined}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  icon,
  iconBg,
  iconColor,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <SettingsRow
      icon={icon}
      iconBg={iconBg}
      iconColor={iconColor}
      title={title}
      description={description}
      control={
        <Switch label={title} checked={checked} onChange={onChange} disabled={disabled} />
      }
    />
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="apple-segmented-control" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`apple-segmented-item${selected ? " is-selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <span className="apple-segmented-icon">{option.icon}</span>}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
