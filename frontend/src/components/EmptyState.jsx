export function EmptyState({ title, description, action, icon = '✳' }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  );
}
