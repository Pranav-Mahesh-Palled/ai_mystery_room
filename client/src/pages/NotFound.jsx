import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

export default function NotFound() {
  return (
    <section className="page page-state empty-state">
      <span className="empty-mark"><Icon name="magnify" size={28} /></span>
      <span className="eyebrow">Wrong corridor</span>
      <h1>There’s no file at this address.</h1>
      <p>Head back to the case desk and open an investigation.</p>
      <Link className="button button-primary" to="/">Return to the room <Icon name="arrow" size={17} /></Link>
    </section>
  );
}
