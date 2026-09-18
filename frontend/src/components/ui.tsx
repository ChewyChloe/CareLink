import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button type="button" className={`cl-button cl-button--${variant} ${className}`} {...props} />;
}
export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'danger' }) {
  return <span className={`cl-chip cl-chip--${tone}`}>{children}</span>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`cl-card ${className}`}>{children}</section>;
}
export function SectionHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return <div className="cl-section-header"><h2>{title}</h2>{meta && <span className="cl-caption">{meta}</span>}</div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="cl-empty"><span className="cl-empty-mark" aria-hidden="true">⌁</span><h2>{title}</h2><p>{children}</p></div>;
}
export function Metric({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return <div className="cl-metric"><dt>{label}</dt><dd>{value}{unit && <span>{unit}</span>}</dd></div>;
}
export function TimelineItem({ time, title, detail, children, badge, voided = false }: { time: string; title: string; detail?: string; children?: ReactNode; badge?: ReactNode; voided?: boolean }) {
  return <article className={`cl-timeline-item${voided ? ' is-void' : ''}`}><div className="cl-time"><time>{time}</time><span aria-hidden="true" /></div><div className="cl-event"><div className="cl-event-heading"><h3>{title}</h3>{badge}</div>{detail && <p>{detail}</p>}{children}</div></article>;
}
