import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-500.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@fontsource-variable/noto-serif-sc/wght.css';
// The console foundation loads before any component stylesheet, so a page can override a shared
// class with a single class. The frozen broadcast defaults keep their historical place after them.
import './ui/index.css';
import App from './App';
import './broadcast-base.css';
import { UiThemeProvider } from './ui-theme';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><UiThemeProvider><App/></UiThemeProvider></React.StrictMode>);
