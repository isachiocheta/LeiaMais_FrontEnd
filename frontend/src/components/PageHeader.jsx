export function PageHeader({ title, eyebrow, description, id, className = '' }) {
  return (
    <div className={`page-header ${className}`.trim()}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id={id}>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </div>
  );
}
