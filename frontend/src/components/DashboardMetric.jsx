import { Link } from 'react-router-dom';
import { ContentCard } from './ContentCard.jsx';
import { formatDashboardCount } from '../utils/dashboard-presentation.js';

export function DashboardMetric({ title, value, description, to, linkLabel }) {
  return <ContentCard component="article" className="dashboard-metric">
    <h3>{title}</h3><p className="dashboard-metric-value">{formatDashboardCount(value)}</p>
    <p className="dashboard-metric-definition">{description}</p>
    {to && <Link className="text-link" to={to}>{linkLabel} <span aria-hidden="true">→</span></Link>}
  </ContentCard>;
}
