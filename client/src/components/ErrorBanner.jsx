import Icon from './Icon.jsx';

export default function ErrorBanner({ children, onRetry, title = 'Something went wrong' }) {
  if (!children) return null;
  return (
    <div className="error-banner" role="alert">
      <Icon name="warning" size={19} />
      <div className="error-copy">
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
      {onRetry && <button className="text-button" type="button" onClick={onRetry}>Try again</button>}
    </div>
  );
}
