import { createRoot } from 'react-dom/client';
import NagiExperience from '../components/nagi/experience';
import { useWallpaperSettings } from './settings';
import '../styles/nagi.css';
import './wallpaper.css';

function WallpaperApp() {
  const settings = useWallpaperSettings();
  return <NagiExperience wallpaper={settings} />;
}

createRoot(document.getElementById('root')!).render(<WallpaperApp />);
