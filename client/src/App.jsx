import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import CreateMystery from './pages/CreateMystery.jsx';
import InvestigationRoom from './pages/InvestigationRoom.jsx';
import Accusation from './pages/Accusation.jsx';
import Results from './pages/Results.jsx';
import NotFound from './pages/NotFound.jsx';

function Layout() {
  return (
    <div className="app-shell flex min-h-screen flex-col">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Navbar />
      <main id="main-content" className="main-content flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateMystery />} />
          <Route path="/cases/:id" element={<InvestigationRoom />} />
          <Route path="/cases/:id/accuse" element={<Accusation />} />
          <Route path="/cases/:id/result" element={<Results />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-footer flex flex-col items-start justify-center gap-[7px] sm:flex-row sm:items-center sm:justify-between sm:gap-[18px]">
        <span>AI Mystery Room</span>
        <span className="footer-note">A case is a game session. Its link is not an account or a privacy lock.</span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  );
}
